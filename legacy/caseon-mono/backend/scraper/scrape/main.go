package main

import (
	"bufio"
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

	"cloud.google.com/go/storage"
	"github.com/cenkalti/backoff/v4"
	"github.com/google/uuid" // Added for UUID validation
	"github.com/supabase-community/supabase-go"
	"github.com/vbauerster/mpb/v8"
	"github.com/vbauerster/mpb/v8/decor"
	"google.golang.org/api/option"
)

// Config holds the configuration for the application
type Config struct {
	GCPKeyFile     string `json:"gcp_key_file"`
	BucketName     string `json:"bucket_name"`
	CaseURLsFile   string `json:"case_urls_file"`
	Concurrency    int    `json:"concurrency"`
	SupabaseURL    string `json:"supabase_url"`
	SupabaseAPIKey string `json:"supabase_api_key"`
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
	if keyFile, exists := os.LookupEnv("GCP_KEY_FILE"); exists {
		config.GCPKeyFile = keyFile
	}
	if bucketName, exists := os.LookupEnv("GCP_BUCKET_NAME"); exists {
		config.BucketName = bucketName
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
	if config.GCPKeyFile == "" || config.BucketName == "" || config.CaseURLsFile == "" || config.SupabaseURL == "" || config.SupabaseAPIKey == "" {
		return nil, fmt.Errorf("config fields 'gcp_key_file', 'bucket_name', 'case_urls_file', 'supabase_url', and 'supabase_api_key' must be set")
	}
	if config.Concurrency <= 0 {
		config.Concurrency = 2 // Default concurrency
	}

	return config, nil
}

// GCPStorageUploader handles uploading files to Google Cloud Storage
type GCPStorageUploader struct {
	client     *storage.Client
	bucketName string
	ctx        context.Context
}

// NewGCPStorageUploader initializes a new GCPStorageUploader
func NewGCPStorageUploader(ctx context.Context, keyFile, bucketName string) (*GCPStorageUploader, error) {
	client, err := storage.NewClient(ctx, option.WithCredentialsFile(keyFile))
	if err != nil {
		return nil, fmt.Errorf("failed to create storage client: %v", err)
	}

	return &GCPStorageUploader{
		client:     client,
		bucketName: bucketName,
		ctx:        ctx,
	}, nil
}

// UploadFile uploads a file to Google Cloud Storage with retry logic
func (u *GCPStorageUploader) UploadFile(fileName string, data []byte) error {
	bucket := u.client.Bucket(u.bucketName)
	obj := bucket.Object(fileName)

	// Define the upload operation with retry
	operation := func() error {
		writer := obj.NewWriter(u.ctx)
		
		// Set content type based on file extension
		contentType := "application/octet-stream" // Default
		if strings.HasSuffix(strings.ToLower(fileName), ".rtf") {
			contentType = "application/rtf"
		}
		writer.ContentType = contentType

		if _, err := writer.Write(data); err != nil {
			writer.Close()
			return fmt.Errorf("failed to write data: %v", err)
		}

		if err := writer.Close(); err != nil {
			return fmt.Errorf("failed to close writer: %v", err)
		}

		return nil
	}

	// Configure exponential backoff
	expBackoff := backoff.NewExponentialBackOff()
	expBackoff.MaxElapsedTime = 2 * time.Minute

	// Retry the upload operation
	if err := backoff.Retry(operation, backoff.WithContext(expBackoff, u.ctx)); err != nil {
		return err
	}

	return nil
}

// Close closes the GCP storage client
func (u *GCPStorageUploader) Close() error {
	return u.client.Close()
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

// checkSourceExists checks if a source URL has already been processed
func checkSourceExists(client *supabase.Client, sourceURL string) (bool, error) {
	resp, _, err := client.From("sources").
		Select("id", "", false).
		Eq("source_url", sourceURL).
		Limit(1, "").
		Execute()
	
	if err != nil {
		return false, fmt.Errorf("failed to check source existence: %v", err)
	}

	// Log the raw response for debugging
	if len(resp) == 0 {
		return false, nil // No results found
	}

	// Try to unmarshal the response
	var results []map[string]interface{}
	if err := json.Unmarshal(resp, &results); err != nil {
		return false, fmt.Errorf("failed to parse source check response (raw response: %s): %v", string(resp), err)
	}

	return len(results) > 0, nil
}

func main() {
	// Load configuration
	config, err := LoadConfig("config.json")
	if err != nil {
		log.Fatalf("Error loading config: %v", err)
	}

	// Initialize GCP storage uploader
	uploader, err := NewGCPStorageUploader(context.Background(), config.GCPKeyFile, config.BucketName)
	if err != nil {
		log.Fatalf("Failed to initialize GCP storage uploader: %v", err)
	}

	// Initialize Supabase client
	supabaseClient, err := supabase.NewClient(config.SupabaseURL, config.SupabaseAPIKey, &supabase.ClientOptions{})
	if err != nil {
		log.Fatalf("Failed to initialize Supabase client: %v", err)
	}

	// Create a single HTTP client for downloading files with optimized settings
	downloadClient := &http.Client{
		Timeout: 60 * time.Second,
		Transport: &http.Transport{
			MaxIdleConns:        100,
			MaxIdleConnsPerHost: 100,
			IdleConnTimeout:     90 * time.Second,
			DisableCompression:  false,
			MaxConnsPerHost:     100,
			ForceAttemptHTTP2:   true,
		},
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

			// Check if source already exists
			exists, err := checkSourceExists(supabaseClient, cURL)
			if err != nil {
				log.Printf("❌ Failed to check if source exists for '%s': %v", cURL, err)
				bar.Increment()
				return
			}
			if exists {
				log.Printf("⏭️ Skipping already processed URL: %s", cURL)
				bar.Increment()
				return
			}

			// Extract folder, year, and case number
			folder, year, _, err := ExtractDetailsFromURL(cURL)
			if err != nil {
				log.Printf("❌ Failed to extract details from URL '%s': %v", cURL, err)
				bar.Increment()
				return
			}
			log.Printf("📁 Processing case from folder '%s', year '%s', URL: %s", folder, year, cURL)

			// Construct RTF link by replacing .html with .rtf
			rtfLink := strings.TrimSuffix(cURL, ".html") + ".rtf"
			log.Printf("🔗 Attempting to download RTF from: %s", rtfLink)

			// Download the RTF file with Referer header set to case URL
			rtfData, rtfFileName, err := DownloadFile(downloadClient, rtfLink, cURL)
			if err != nil {
				log.Printf("❌ Failed to download RTF from '%s': %v", rtfLink, err)
				bar.Increment()
				return
			}
			log.Printf("✅ Successfully downloaded RTF file: %s (size: %.2f KB)", rtfFileName, float64(len(rtfData))/1024)

			// Sanitize base filename without extension
			baseFileName := sanitizedFileName(rtfFileName)

			// Construct modified filename with folder, year, and case number
			modifiedFileName := fmt.Sprintf("%s-%s-%s%s", folder, year, baseFileName, path.Ext(rtfFileName))
			log.Printf("📝 Renamed file to: %s", modifiedFileName)

			// Upload the RTF to Google Cloud Storage
			log.Printf("⬆️ Uploading to GCP Storage: %s", modifiedFileName)
			err = uploader.UploadFile(modifiedFileName, rtfData)
			if err != nil {
				log.Printf("❌ Failed to upload '%s' to GCP Storage: %v", modifiedFileName, err)
				bar.Increment()
				return
			}
			log.Printf("✅ Successfully uploaded to GCP Storage: %s", modifiedFileName)

			// Prepare data for 'files' table without metadata
			fileRecord := map[string]interface{}{
				"file_name": modifiedFileName,
				"file_type": "rtf",
				"cdn_path":  fmt.Sprintf("gs://%s/%s", config.BucketName, url.PathEscape(modifiedFileName)),
				"file_size": len(rtfData),
				"mime_type": "application/rtf",
			}

			// Insert into 'files' table
			log.Printf("💾 Inserting file record into database: %s", modifiedFileName)
			resp, _, err := supabaseClient.From("files").Insert(fileRecord, false, "", "representation", "").Execute()
			if err != nil {
				log.Printf("❌ Failed to insert record into 'files' for '%s': %v", modifiedFileName, err)
				if resp != nil {
					log.Printf("Supabase response: %s", string(resp))
				}
				bar.Increment()
				return
			}

			// Parse the response to get the inserted 'id'
			var insertedFiles []map[string]interface{}
			if err := json.Unmarshal(resp, &insertedFiles); err != nil {
				log.Printf("❌ Failed to parse insert response for 'files' table: %v", err)
				return
			}
			if len(insertedFiles) == 0 {
				log.Printf("❌ No records found in insert response for 'files' table for '%s'", modifiedFileName)
				return
			}
			fileID, ok := insertedFiles[0]["id"].(string) // Supabase returns UUIDs as strings
			if !ok || !isValidUUID(fileID) {
				log.Printf("❌ Invalid 'id' type or format for inserted file '%s'", modifiedFileName)
				return
			}
			log.Printf("✅ Successfully inserted file record with ID: %s", fileID)

			// Prepare data for 'sources' table with source_url
			sourceRecord := map[string]interface{}{
				"file_id":      fileID,
				"source_url":   cURL,
				"status":       "active",
				"retrieved_at": time.Now().UTC(),
			}
			log.Printf("💾 Inserting source record: %+v", sourceRecord)

			// Insert into 'sources' table
			resp, _, err = supabaseClient.From("sources").Insert(sourceRecord, false, "", "representation", "").Execute()
			if err != nil {
				log.Printf("❌ Failed to insert record into 'sources' for '%s': %v", cURL, err)
				if resp != nil {
					log.Printf("Supabase response: %s", string(resp))
				}
				return
			}

			// Parse the response to confirm insertion
			var insertedSources []map[string]interface{}
			if err := json.Unmarshal(resp, &insertedSources); err != nil {
				log.Printf("❌ Failed to parse insert response for 'sources' table: %v", err)
				return
			}
			if len(insertedSources) == 0 {
				log.Printf("❌ No records found in insert response for 'sources' table for '%s'", cURL)
				return
			}
			sourceID, ok := insertedSources[0]["id"].(string)
			if !ok || !isValidUUID(sourceID) {
				log.Printf("❌ Invalid 'id' type or format for inserted source for '%s'", cURL)
				return
			}

			log.Printf("✅ Successfully processed case: %s (file_id: %s, source_id: %s)", modifiedFileName, fileID, sourceID)
			bar.Increment()
		}(caseURL)
	}

	// Wait for all goroutines to finish
	wg.Wait()
	p.Wait()

	log.Println("All RTF files have been processed.")

	// Close GCP storage uploader
	if err := uploader.Close(); err != nil {
		log.Printf("❌ Failed to close GCP storage uploader: %v", err)
	}
}
