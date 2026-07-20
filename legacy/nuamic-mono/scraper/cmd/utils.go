package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path"
	"strings"
	"time"

	"github.com/cenkalti/backoff/v4"
	"github.com/google/uuid"
	"github.com/supabase-community/supabase-go"
)

// BunnyCDNUploader handles uploading files to BunnyCDN
type BunnyCDNUploader struct {
	APIKey      string
	StorageZone string
	Region      string
	HTTPClient  *http.Client
}

// NewBunnyCDNUploader creates a new BunnyCDN uploader instance
func NewBunnyCDNUploader(apiKey, storageZone, region string) *BunnyCDNUploader {
	return &BunnyCDNUploader{
		APIKey:      apiKey,
		StorageZone: storageZone,
		Region:      region,
		HTTPClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// UploadFile uploads a file to BunnyCDN
func (u *BunnyCDNUploader) UploadFile(ctx context.Context, fileName string, data []byte) error {
	uploadURL := fmt.Sprintf("https://%s.bunnycdn.com/%s/%s",
		u.Region,
		u.StorageZone,
		url.PathEscape(fileName),
	)

	req, err := http.NewRequestWithContext(ctx, "PUT", uploadURL, bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("failed to create upload request: %v", err)
	}

	req.Header.Set("AccessKey", u.APIKey)
	req.Header.Set("Content-Type", "application/rtf")
	req.Header.Set("Accept", "application/json")

	resp, err := u.HTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("upload request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return nil
	}

	body, _ := io.ReadAll(resp.Body)
	return fmt.Errorf("upload failed with status %d: %s", resp.StatusCode, string(body))
}

// Config structure updated to include proxy configuration
type Config struct {
	BunnyAPIKey     string      `json:"bunny_api_key"`
	StorageZoneName string      `json:"storage_zone_name"`
	Region          string      `json:"region"`
	CaseURLsFile    string      `json:"case_urls_file"`
	Concurrency     int         `json:"concurrency"`
	SupabaseURL     string      `json:"supabase_url"`
	SupabaseAPIKey  string      `json:"supabase_api_key"`
	ProxyConfig     ProxyConfig `json:"proxy_config"`
}

// ExtractDetailsFromURL extracts folder, year, and case number from URL
func ExtractDetailsFromURL(caseURL string) (string, string, string, error) {
	parsedURL, err := url.Parse(caseURL)
	if err != nil {
		return "", "", "", fmt.Errorf("invalid URL '%s': %v", caseURL, err)
	}

	segments := strings.Split(parsedURL.Path, "/")

	// Get folder (index 3)
	folder := ""
	if len(segments) > 3 {
		folder = segments[3]
	}

	// Get year (index 4)
	year := ""
	if len(segments) > 4 {
		year = segments[4]
	}

	// Get case file (index 5)
	caseFile := ""
	if len(segments) > 5 {
		caseFile = segments[5]
	}

	// Check if we got all required components
	if folder == "" || year == "" || caseFile == "" {
		// Return empty strings instead of error if segments are missing
		return folder, year, strings.TrimSuffix(caseFile, path.Ext(caseFile)), nil
	}

	// Remove file extension from caseFile
	caseNumber := strings.TrimSuffix(caseFile, path.Ext(caseFile))

	return folder, year, caseNumber, nil
}

func LoadConfig(filename string) (*Config, error) {
	file, err := os.Open(filename)
	if err != nil {
		return nil, fmt.Errorf("failed to open config file: %v", err)
	}
	defer file.Close()

	var config Config
	if err := json.NewDecoder(file).Decode(&config); err != nil {
		return nil, fmt.Errorf("failed to decode config: %v", err)
	}

	loadEnvConfig(&config)
	if err := validateConfig(&config); err != nil {
		return nil, err
	}

	return &config, nil
}

func loadEnvConfig(config *Config) {
	if apiKey := os.Getenv("BUNNY_API_KEY"); apiKey != "" {
		config.BunnyAPIKey = apiKey
	}
	if storageZone := os.Getenv("BUNNY_STORAGE_ZONE"); storageZone != "" {
		config.StorageZoneName = storageZone
	}
	if region := os.Getenv("BUNNY_REGION"); region != "" {
		config.Region = region
	}
	if webshareKey := os.Getenv("WEBSHARE_API_KEY"); webshareKey != "" {
		config.ProxyConfig.WebshareAPIKey = webshareKey
	}
}

func validateConfig(config *Config) error {
	if config.BunnyAPIKey == "" || config.StorageZoneName == "" ||
		config.Region == "" || config.CaseURLsFile == "" ||
		config.SupabaseURL == "" || config.SupabaseAPIKey == "" {
		return fmt.Errorf("all required configuration fields must be set")
	}
	if config.Concurrency <= 0 {
		config.Concurrency = 2
	}
	return nil
}

func initSupabaseClient(config *Config) (*supabase.Client, error) {
	return supabase.NewClient(config.SupabaseURL, config.SupabaseAPIKey, nil)
}

func processCase(ctx context.Context, caseURL string, pm *ProxyManager, uploader *BunnyCDNUploader, supabaseClient *supabase.Client, config *Config) error {
	folder, year, _, err := ExtractDetailsFromURL(caseURL)
	if err != nil {
		return fmt.Errorf("failed to extract details: %v", err)
	}

	proxy, err := pm.GetNextProxy()
	if err != nil {
		proxy = nil
	}

	var client *http.Client
	if proxy != nil {
		client, err = pm.CreateProxyHTTPClient(proxy)
		if err != nil {
			return fmt.Errorf("failed to create proxy client: %v", err)
		}
	} else {
		client = &http.Client{Timeout: 60 * time.Second}
	}

	rtfLink := strings.TrimSuffix(caseURL, ".html") + ".rtf"
	rtfData, rtfFileName, err := downloadFileWithRetry(client, rtfLink, caseURL)
	if err != nil {
		return fmt.Errorf("download failed: %v", err)
	}

	modifiedFileName := fmt.Sprintf("%s-%s-%s%s",
		folder, year, sanitizedFileName(rtfFileName), path.Ext(rtfFileName))

	if err := uploader.UploadFile(ctx, modifiedFileName, rtfData); err != nil {
		return fmt.Errorf("upload failed: %v", err)
	}

	if err := updateDatabaseRecords(ctx, supabaseClient, modifiedFileName, caseURL, rtfData, config); err != nil {
		return fmt.Errorf("database update failed: %v", err)
	}

	return nil
}

func downloadFileWithRetry(client *http.Client, fileURL, referer string) ([]byte, string, error) {
	var data []byte
	var fileName string

	operation := func() error {
		req, err := http.NewRequest("GET", fileURL, nil)
		if err != nil {
			return fmt.Errorf("failed to create request: %v", err)
		}

		setRequestHeaders(req, referer)

		resp, err := client.Do(req)
		if err != nil {
			return fmt.Errorf("request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			return fmt.Errorf("bad status: %d", resp.StatusCode)
		}

		data, err = io.ReadAll(resp.Body)
		if err != nil {
			return fmt.Errorf("failed to read body: %v", err)
		}

		fileName = path.Base(fileURL)
		return nil
	}

	backOff := backoff.NewExponentialBackOff()
	backOff.MaxElapsedTime = 2 * time.Minute

	if err := backoff.Retry(operation, backOff); err != nil {
		return nil, "", err
	}

	return data, fileName, nil
}

func setRequestHeaders(req *http.Request, referer string) {
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "+
		"AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
	req.Header.Set("Referer", referer)
	req.Header.Set("Accept", "application/rtf,*/*;q=0.8")
	req.Header.Set("Accept-Language", "en-US,en;q=0.5")
	req.Header.Set("Connection", "keep-alive")
}

func updateDatabaseRecords(ctx context.Context, client *supabase.Client, fileName, sourceURL string, data []byte, config *Config) error {
	fileRecord := map[string]interface{}{
		"file_name": fileName,
		"file_type": "rtf",
		"cdn_path":  buildCDNPath(fileName, config),
		"file_size": len(data),
		"mime_type": "application/rtf",
	}

	resp, _, err := client.From("files").Insert(fileRecord, false, "", "", "").Execute()
	if err != nil {
		return fmt.Errorf("failed to insert file record: %v", err)
	}

	fileID, err := extractFileID(resp)
	if err != nil {
		return err
	}

	sourceRecord := map[string]interface{}{
		"file_id":      fileID,
		"source_url":   sourceURL,
		"status":       "active",
		"retrieved_at": time.Now().UTC(),
	}

	_, _, err = client.From("sources").Insert(sourceRecord, false, "", "", "").Execute()
	return err
}

func extractFileID(resp []byte) (string, error) {
	var records []map[string]interface{}
	if err := json.Unmarshal(resp, &records); err != nil {
		return "", fmt.Errorf("failed to parse response: %v", err)
	}

	if len(records) == 0 {
		return "", fmt.Errorf("no records in response")
	}

	fileID, ok := records[0]["id"].(string)
	if !ok || !isValidUUID(fileID) {
		return "", fmt.Errorf("invalid file ID")
	}

	return fileID, nil
}

func isValidUUID(u string) bool {
	_, err := uuid.Parse(u)
	return err == nil
}

func sanitizedFileName(fullFileName string) string {
	return strings.TrimSuffix(fullFileName, path.Ext(fullFileName))
}

func buildCDNPath(fileName string, config *Config) string {
	return fmt.Sprintf("https://%s.bunnycdn.com/%s/%s",
		config.Region, config.StorageZoneName, url.QueryEscape(fileName))
}
