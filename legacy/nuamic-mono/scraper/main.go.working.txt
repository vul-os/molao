package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path"
	"strings"
	"sync"
	"time"

	"os/signal"
	"strconv"
	"syscall"

	"github.com/cenkalti/backoff/v4"
	"github.com/google/uuid" // Added for UUID validation
	"github.com/supabase-community/supabase-go"
	"github.com/vbauerster/mpb/v8"
	"github.com/vbauerster/mpb/v8/decor"
)

// Config holds the configuration for the application
type Config struct {
	BunnyAPIKey     string `json:"bunny_api_key"`
	StorageZoneName string `json:"storage_zone_name"`
	Region          string `json:"region"` // e.g., us-east, eu-central
	CaseURLsFile    string `json:"case_urls_file"`
	Concurrency     int    `json:"concurrency"`
	SupabaseURL     string `json:"supabase_url"`
	SupabaseAPIKey  string `json:"supabase_api_key"`
}

// LoadConfig reads the configuration from the specified JSON file
func LoadConfig(filename string) (*Config, error) {
	file, err := os.Open(filename)
	if err != nil {
		return nil, fmt.Errorf("failed to open config file '%s': %v", filename, err)
	}
	defer file.Close()

	decoder := json.NewDecoder(file)
	config := &Config{}
	if err := decoder.Decode(config); err != nil {
		return nil, fmt.Errorf("failed to decode config file '%s': %v", filename, err)
	}

	// Override with environment variables if set
	if apiKey, exists := os.LookupEnv("BUNNY_API_KEY"); exists {
		config.BunnyAPIKey = apiKey
	}
	if storageZone, exists := os.LookupEnv("BUNNY_STORAGE_ZONE"); exists {
		config.StorageZoneName = storageZone
	}
	if region, exists := os.LookupEnv("BUNNY_REGION"); exists {
		config.Region = region
	}
	if caseURLsFile, exists := os.LookupEnv("CASE_URLS_FILE"); exists {
		config.CaseURLsFile = caseURLsFile
	}
	if concurrency, exists := os.LookupEnv("CONCURRENCY"); exists {
		if c, err := strconv.Atoi(concurrency); err == nil && c > 0 {
			config.Concurrency = c
		}
	}
	if supabaseURL, exists := os.LookupEnv("SUPABASE_URL"); exists {
		config.SupabaseURL = supabaseURL
	}
	if supabaseAPIKey, exists := os.LookupEnv("SUPABASE_API_KEY"); exists {
		config.SupabaseAPIKey = supabaseAPIKey
	}

	// Validate configuration fields
	if config.BunnyAPIKey == "" || config.StorageZoneName == "" || config.CaseURLsFile == "" || config.Region == "" || config.SupabaseURL == "" || config.SupabaseAPIKey == "" {
		return nil, fmt.Errorf("config fields 'bunny_api_key', 'storage_zone_name', 'region', 'case_urls_file', 'supabase_url', and 'supabase_api_key' must be set")
	}
	if config.Concurrency <= 0 {
		config.Concurrency = 2 // Default concurrency
	}

	return config, nil
}

// BunnyCDNUploader handles uploading files to BunnyCDN via REST API
type BunnyCDNUploader struct {
	APIKey      string
	StorageZone string
	Region      string
	HTTPClient  *http.Client
}

// NewBunnyCDNUploader initializes a new BunnyCDNUploader
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

// UploadFile uploads a file to BunnyCDN with the given filename using REST API with retry logic
func (u *BunnyCDNUploader) UploadFile(ctx context.Context, fileName string, data []byte) error {
	// Construct the upload URL
	uploadURL := fmt.Sprintf("https://%s.bunnycdn.com/%s/%s",
		u.Region,
		u.StorageZone,
		url.PathEscape(fileName),
	)

	// Create a new PUT request with the file data and context
	req, err := http.NewRequestWithContext(ctx, "PUT", uploadURL, bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("failed to create upload request: %v", err)
	}

	// Set required headers
	req.Header.Set("AccessKey", u.APIKey)
	// Set Content-Type based on file extension
	contentType := "application/octet-stream" // Default
	if strings.HasSuffix(strings.ToLower(fileName), ".rtf") {
		contentType = "application/rtf"
	}
	req.Header.Set("Content-Type", contentType)
	req.Header.Set("Accept", "application/json")

	// Define the upload operation with retry
	operation := func() error {
		resp, err := u.HTTPClient.Do(req)
		if err != nil {
			return fmt.Errorf("upload request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			return nil // Success
		}

		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("upload failed with status %d: %s", resp.StatusCode, string(body))
	}

	// Configure exponential backoff
	expBackoff := backoff.NewExponentialBackOff()
	expBackoff.MaxElapsedTime = 2 * time.Minute

	// Retry the upload operation
	if err := backoff.Retry(operation, backoff.WithContext(expBackoff, ctx)); err != nil {
		return err
	}

	return nil
}

// ExtractDetailsFromURL extracts the folder, year, and case number from the case URL
// Example: "https://www.saflii.org/za/cases/ZACC/2004/12.html" -> ("ZACC", "2004", "12", nil)
func ExtractDetailsFromURL(caseURL string) (string, string, string, error) {
	parsedURL, err := url.Parse(caseURL)
	if err != nil {
		return "", "", "", fmt.Errorf("invalid URL '%s': %v", caseURL, err)
	}

	segments := strings.Split(parsedURL.Path, "/")
	// Expected structure: /za/cases/{FOLDER}/{YEAR}/{CASE}.html
	if len(segments) < 5 {
		return "", "", "", fmt.Errorf("unexpected URL structure for '%s'", caseURL)
	}

	folder := segments[3]
	year := segments[4]
	caseFile := segments[5]
	if folder == "" || year == "" || caseFile == "" {
		return "", "", "", fmt.Errorf("empty folder, year, or case number extracted from URL '%s'", caseURL)
	}

	// Remove file extension from caseFile
	caseNumber := strings.TrimSuffix(caseFile, path.Ext(caseFile))

	return folder, year, caseNumber, nil
}

// DownloadFile downloads a file from the given URL and returns its data and file name with retry logic
func DownloadFile(client *http.Client, fileURL string, referer string) ([]byte, string, error) {
	// Create GET request
	req, err := http.NewRequest("GET", fileURL, nil)
	if err != nil {
		return nil, "", fmt.Errorf("failed to create GET request for '%s': %v", fileURL, err)
	}

	// Set headers to mimic a real browser
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "+
		"AppleWebKit/537.36 (KHTML, like Gecko) "+
		"Chrome/91.0.4472.124 Safari/537.36")
	req.Header.Set("Referer", referer)
	req.Header.Set("Accept", "application/rtf,*/*;q=0.8")
	req.Header.Set("Accept-Language", "en-US,en;q=0.5")
	req.Header.Set("Connection", "keep-alive")

	var data []byte
	var fileName string

	// Define the download operation with retry
	operation := func() error {
		resp, err := client.Do(req)
		if err != nil {
			return fmt.Errorf("failed to download file from '%s': %v", fileURL, err)
		}
		defer resp.Body.Close()

		// Check for successful status code
		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			return fmt.Errorf("failed to download file from '%s': status %d, response: %s", fileURL, resp.StatusCode, string(body))
		}

		// Read the file data
		data, err = io.ReadAll(resp.Body)
		if err != nil {
			return fmt.Errorf("failed to read file data from '%s': %v", fileURL, err)
		}

		// Extract file name from URL
		parsedURL, err := url.Parse(fileURL)
		if err != nil {
			return fmt.Errorf("invalid file URL '%s': %v", fileURL, err)
		}
		fileName = path.Base(parsedURL.Path)

		return nil
	}

	// Configure exponential backoff
	expBackoff := backoff.NewExponentialBackOff()
	expBackoff.MaxElapsedTime = 2 * time.Minute

	// Retry the download operation
	if err := backoff.Retry(operation, backoff.WithContext(expBackoff, context.Background())); err != nil {
		return nil, "", err
	}

	return data, fileName, nil
}

// sanitizedFileName extracts the filename without extension
func sanitizedFileName(fullFileName string) string {
	ext := path.Ext(fullFileName)
	name := strings.TrimSuffix(fullFileName, ext)
	return name
}

// isValidUUID checks if a string is a valid UUID
func isValidUUID(u string) bool {
	_, err := uuid.Parse(u)
	return err == nil
}

func main() {
	// Load configuration
	config, err := LoadConfig("config.json")
	if err != nil {
		log.Fatalf("Error loading config: %v", err)
	}

	// Initialize BunnyCDN uploader
	uploader := NewBunnyCDNUploader(config.BunnyAPIKey, config.StorageZoneName, config.Region)

	// Initialize Supabase client
	supabaseClient, err := supabase.NewClient(config.SupabaseURL, config.SupabaseAPIKey, &supabase.ClientOptions{})
	if err != nil {
		log.Fatalf("Failed to initialize Supabase client: %v", err)
	}

	// Create a single HTTP client for downloading files
	downloadClient := &http.Client{
		Timeout: 60 * time.Second,
	}

	// Open the case URLs file
	file, err := os.Open(config.CaseURLsFile)
	if err != nil {
		log.Fatalf("Failed to open case URLs file '%s': %v", config.CaseURLsFile, err)
	}
	defer file.Close()

	// Read all case URLs into a slice
	var caseURLs []string
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line != "" {
			caseURLs = append(caseURLs, line)
		}
	}
	if err := scanner.Err(); err != nil {
		log.Fatalf("Error reading case URLs from '%s': %v", config.CaseURLsFile, err)
	}

	totalCases := len(caseURLs)
	if totalCases == 0 {
		log.Fatalf("No case URLs found in '%s'", config.CaseURLsFile)
	}

	// Initialize progress bar
	p := mpb.New(mpb.WithWidth(60))
	bar := p.AddBar(int64(totalCases),
		mpb.PrependDecorators(
			decor.Name("Processing RTFs: "),
			decor.Percentage(),
		),
		mpb.AppendDecorators(
			decor.Elapsed(decor.ET_STYLE_GO),
			decor.OnComplete(
				decor.Name("Done! "),
				"✔️",
			),
		),
	)

	// Setup concurrency
	concurrency := config.Concurrency
	sem := make(chan struct{}, concurrency)
	var wg sync.WaitGroup

	// Context for graceful shutdown
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Handle OS Interrupts for graceful shutdown
	go func() {
		sig := make(chan os.Signal, 1)
		signal.Notify(sig, os.Interrupt, syscall.SIGTERM)
		<-sig
		log.Println("\nInterrupt signal received. Shutting down gracefully...")
		cancel()
	}()

	for _, caseURL := range caseURLs {
		select {
		case <-ctx.Done():
			log.Println("Context canceled. Exiting main loop.")
			break
		default:
			// Continue processing
		}

		wg.Add(1)
		sem <- struct{}{} // Acquire a slot

		go func(cURL string) {
			defer wg.Done()
			defer func() { <-sem }() // Release the slot

			// Extract folder, year, and case number
			folder, year, _, err := ExtractDetailsFromURL(cURL)
			if err != nil {
				log.Printf("Skipping URL '%s': %v", cURL, err)
				bar.Increment()
				return
			}

			// Construct RTF link by replacing .html with .rtf
			rtfLink := strings.TrimSuffix(cURL, ".html") + ".rtf"
			log.Printf("Constructed RTF link: %s", rtfLink)

			// Download the RTF file with Referer header set to case URL
			rtfData, rtfFileName, err := DownloadFile(downloadClient, rtfLink, cURL)
			if err != nil {
				log.Printf("Failed to download RTF for '%s': %v", cURL, err)
				bar.Increment()
				return
			}

			// Sanitize base filename without extension
			baseFileName := sanitizedFileName(rtfFileName)

			// Construct modified filename with folder, year, and case number
			// Example: ZACC-2004-12.rtf
			modifiedFileName := fmt.Sprintf("%s-%s-%s%s", folder, year, baseFileName, path.Ext(rtfFileName))

			// Upload the RTF to BunnyCDN via REST API
			err = uploader.UploadFile(ctx, modifiedFileName, rtfData)
			if err != nil {
				log.Printf("Failed to upload '%s' to BunnyCDN: %v", modifiedFileName, err)
				bar.Increment()
				return
			}

			// Prepare data for 'files' table without metadata
			fileRecord := map[string]interface{}{
				"file_name": modifiedFileName,
				"file_type": "rtf",
				"cdn_path":  fmt.Sprintf("https://%s.bunnycdn.com/%s/%s", uploader.Region, uploader.StorageZone, url.PathEscape(modifiedFileName)),
				"file_size": len(rtfData), // Size in bytes
				"mime_type": "application/rtf",
			}

			// Insert into 'files' table
			resp, _, err := supabaseClient.From("files").Insert(fileRecord, false, "", "representation", "").Execute()
			if err != nil {
				log.Printf("Failed to insert record into 'files' for '%s': %v", modifiedFileName, err)
				if resp != nil {
					log.Printf("Supabase response: %s", string(resp))
				}
				bar.Increment()
				return
			}

			// Parse the response to get the inserted 'id'
			var insertedFiles []map[string]interface{}
			if err := json.Unmarshal(resp, &insertedFiles); err != nil {
				log.Printf("Failed to parse insert response for 'files' table: %v", err)
				return
			}
			if len(insertedFiles) == 0 {
				log.Printf("No records found in insert response for 'files' table for '%s'", modifiedFileName)
				return
			}
			fileID, ok := insertedFiles[0]["id"].(string) // Supabase returns UUIDs as strings
			if !ok || !isValidUUID(fileID) {
				log.Printf("Invalid 'id' type or format for inserted file '%s'", modifiedFileName)
				return
			}
			bar.Increment()

			// Prepare data for 'sources' table with source_url
			sourceRecord := map[string]interface{}{
				"file_id":      fileID,
				"source_url":   cURL,
				"status":       "active",
				"retrieved_at": time.Now().UTC(), // Changed from string to time.Time
			}
			// Log the sourceRecord being inserted
			log.Printf("Attempting to insert into 'sources': %+v", sourceRecord)

			// Insert into 'sources' table
			resp, _, err = supabaseClient.From("sources").Insert(sourceRecord, false, "", "representation", "").Execute()
			if err != nil {
				log.Printf("Failed to insert record into 'sources' for '%s': %v", cURL, err)
				if resp != nil {
					log.Printf("Supabase response: %s", string(resp))
				}
				return
			}

			// Parse the response to confirm insertion
			var insertedSources []map[string]interface{}
			if err := json.Unmarshal(resp, &insertedSources); err != nil {
				log.Printf("Failed to parse insert response for 'sources' table: %v", err)
				return
			}
			if len(insertedSources) == 0 {
				log.Printf("No records found in insert response for 'sources' table for '%s'", cURL)
				return
			}
			sourceID, ok := insertedSources[0]["id"].(string)
			if !ok || !isValidUUID(sourceID) {
				log.Printf("Invalid 'id' type or format for inserted source for '%s'", cURL)
				return
			}

			// Log success
			log.Printf("Successfully uploaded RTF '%s' to BunnyCDN and recorded in Supabase with source ID '%s'.", modifiedFileName, sourceID)
			bar.Increment()
		}(caseURL)
	}

	// Wait for all goroutines to finish
	wg.Wait()
	p.Wait()

	log.Println("All RTF files have been processed.")
}
