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
	"github.com/google/uuid"
	"github.com/supabase-community/supabase-go"
	"github.com/vbauerster/mpb/v8"
	"github.com/vbauerster/mpb/v8/decor"
)

// Config holds the configuration for the application
type Config struct {
	BunnyCDNAPIKey        string `json:"bunny_cdn_api_key"`
	BunnyStorageZone      string `json:"bunny_storage_zone"`
	BunnyStorageZoneRegion string `json:"bunny_storage_zone_region"`
	CaseURLsFile          string `json:"case_urls_file"`
	Concurrency           int    `json:"concurrency"`
	SupabaseURL           string `json:"supabase_url"`
	SupabaseAPIKey        string `json:"supabase_api_key"`
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
	if apiKey, exists := os.LookupEnv("BUNNY_CDN_API_KEY"); exists {
		config.BunnyCDNAPIKey = apiKey
	}
	if storageZone, exists := os.LookupEnv("BUNNY_STORAGE_ZONE"); exists {
		config.BunnyStorageZone = storageZone
	}
	if storageZoneRegion, exists := os.LookupEnv("BUNNY_STORAGE_ZONE_REGION"); exists {
		config.BunnyStorageZoneRegion = storageZoneRegion
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
	if config.BunnyCDNAPIKey == "" || config.BunnyStorageZone == "" || config.BunnyStorageZoneRegion == "" || 
	   config.CaseURLsFile == "" || config.SupabaseURL == "" || config.SupabaseAPIKey == "" {
		return nil, fmt.Errorf("config fields 'bunny_cdn_api_key', 'bunny_storage_zone', 'bunny_storage_zone_region', 'case_urls_file', 'supabase_url', and 'supabase_api_key' must be set")
	}
	if config.Concurrency <= 0 {
		config.Concurrency = 2 // Default concurrency
	}

	return config, nil
}

// BunnyCDNUploader handles uploading files to Bunny CDN
type BunnyCDNUploader struct {
	apiKey        string
	storageZone   string
	region        string
	httpClient    *http.Client
}

// NewBunnyCDNUploader initializes a new BunnyCDNUploader
func NewBunnyCDNUploader(apiKey, storageZone, region string) *BunnyCDNUploader {
	return &BunnyCDNUploader{
		apiKey:      apiKey,
		storageZone: storageZone,
		region:      region,
		httpClient: &http.Client{
			Timeout: 60 * time.Second,
			Transport: &http.Transport{
				MaxIdleConns:        100,
				MaxIdleConnsPerHost: 100,
				IdleConnTimeout:     90 * time.Second,
				DisableCompression:  false,
				MaxConnsPerHost:     100,
				ForceAttemptHTTP2:   true,
			},
		},
	}
}

// UploadFile uploads a file to Bunny CDN with retry logic
func (u *BunnyCDNUploader) UploadFile(fileName string, data []byte) error {
	// Create the upload URL
	uploadURL := fmt.Sprintf("https://jh.storage.bunnycdn.com/caseonza/%s",  url.PathEscape(fileName))
	log.Printf("🔗 [%s] Upload URL: %s", fileName, uploadURL)
	log.Printf("📊 [%s] Storage Zone: %s, Region: %s", fileName, u.storageZone, u.region)
	log.Printf("🔑 [%s] API Key (first 10 chars): %s...", fileName, u.apiKey[:10])

	// Define the upload operation with retry
	operation := func() error {
		log.Printf("📦 [%s] Creating direct PUT request (attempt)", fileName)
		
		log.Printf("🌐 [%s] Creating HTTP request", fileName)
		// Create the request with context timeout
		ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
		defer cancel()
		
		// Create a new reader from the file data for each request
		bodyReader := bytes.NewReader(data)
		req, err := http.NewRequestWithContext(ctx, "PUT", uploadURL, bodyReader)
		if err != nil {
			log.Printf("❌ [%s] Failed to create HTTP request: %v", fileName, err)
			return fmt.Errorf("failed to create request: %v", err)
		}
		log.Printf("✅ [%s] HTTP request created successfully", fileName)

		// Set headers for direct file upload
		log.Printf("🏷️ [%s] Setting request headers", fileName)
		req.Header.Set("AccessKey", u.apiKey)
		
		// Set content type based on file extension
		contentType := "application/octet-stream" // Default
		if strings.HasSuffix(strings.ToLower(fileName), ".rtf") {
			contentType = "application/rtf"
		}
		req.Header.Set("Content-Type", contentType)
		req.Header.Set("User-Agent", "Go-Scraper/1.0")
		req.Header.Set("Content-Length", fmt.Sprintf("%d", len(data)))
		
		log.Printf("📋 [%s] Request headers:", fileName)
		for key, values := range req.Header {
			for _, value := range values {
				if key == "AccessKey" {
					log.Printf("  %s: %s...", key, value[:10])
				} else {
					log.Printf("  %s: %s", key, value)
				}
			}
		}
		log.Printf("📏 [%s] Request content length: %d", fileName, len(data))
		
		log.Printf("📡 [%s] Sending HTTP PUT request to Bunny CDN", fileName)
		startTime := time.Now()
		
		// Send the request
		resp, err := u.httpClient.Do(req)
		duration := time.Since(startTime)
		
		if err != nil {
			log.Printf("❌ [%s] HTTP request failed after %v: %v", fileName, duration, err)
			return fmt.Errorf("failed to send request: %v", err)
		}
		defer resp.Body.Close()

		log.Printf("📨 [%s] Received response after %v", fileName, duration)
		log.Printf("📊 [%s] Response status: %d %s", fileName, resp.StatusCode, resp.Status)
		
		// Log response headers
		log.Printf("📋 [%s] Response headers:", fileName)
		for key, values := range resp.Header {
			for _, value := range values {
				log.Printf("  %s: %s", key, value)
			}
		}
		
		// Read response body
		responseBody, err := io.ReadAll(resp.Body)
		if err != nil {
			log.Printf("⚠️ [%s] Failed to read response body: %v", fileName, err)
		} else {
			log.Printf("📄 [%s] Response body (%d bytes): %s", fileName, len(responseBody), string(responseBody))
		}
		
		// Check response
		if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
			log.Printf("❌ [%s] Upload failed with status %d: %s", fileName, resp.StatusCode, string(responseBody))
			return fmt.Errorf("upload failed with status %d: %s", resp.StatusCode, string(responseBody))
		}

		log.Printf("✅ [%s] Upload successful with status %d", fileName, resp.StatusCode)
		return nil
	}

	// Configure exponential backoff with limited retries
	expBackoff := backoff.NewExponentialBackOff()
	expBackoff.MaxElapsedTime = 3 * time.Minute
	expBackoff.InitialInterval = 2 * time.Second
	expBackoff.MaxInterval = 30 * time.Second
	expBackoff.Multiplier = 2.0

	log.Printf("🔄 [%s] Starting upload with retry (max %v)", fileName, expBackoff.MaxElapsedTime)
	
	// Retry the upload operation with detailed error logging
	retryCount := 0
	err := backoff.Retry(func() error {
		retryCount++
		log.Printf("🔄 [%s] Upload attempt #%d", fileName, retryCount)
		return operation()
	}, expBackoff)
	
	if err != nil {
		log.Printf("❌ [%s] Upload failed after %d attempts and %v: %v", fileName, retryCount, expBackoff.MaxElapsedTime, err)
		return fmt.Errorf("upload failed after retries: %v", err)
	}

	log.Printf("🎉 [%s] Upload completed successfully after %d attempts", fileName, retryCount)
	return nil
}

// GetFileURL returns the public URL for a file
func (u *BunnyCDNUploader) GetFileURL(fileName string) string {
	return fmt.Sprintf("https://jh.storage.bunnycdn.com/%s", u.storageZone, u.region, url.PathEscape(fileName))
}

// ExtractDetailsFromURL extracts the folder, year, and case number from the case URL
// Example: "https://www.saflii.org/za/cases/ZACC/2004/12.html" -> ("ZACC", "2004", "12", nil)
// Also handles: "http://saflii.org/za/other/ZAGPJHCRolls/recent.html" -> ("ZAGPJHCRolls", "unknown", "recent", nil)
func ExtractDetailsFromURL(caseURL string) (string, string, string, error) {
	parsedURL, err := url.Parse(caseURL)
	if err != nil {
		return "", "", "", fmt.Errorf("invalid URL '%s': %v", caseURL, err)
	}

	segments := strings.Split(parsedURL.Path, "/")
	// Remove empty segments
	var cleanSegments []string
	for _, segment := range segments {
		if segment != "" {
			cleanSegments = append(cleanSegments, segment)
		}
	}
	
	// Need at least 3 segments: za, cases/other, folder
	if len(cleanSegments) < 3 {
		return "", "", "", fmt.Errorf("unexpected URL structure for '%s' - not enough path segments", caseURL)
	}

	var folder, year, caseFile string
	
	// Handle different URL structures
	if len(cleanSegments) >= 5 && cleanSegments[1] == "cases" {
		// Standard structure: /za/cases/{FOLDER}/{YEAR}/{CASE}.html
		folder = cleanSegments[2]
		year = cleanSegments[3]
		caseFile = cleanSegments[4]
	} else if len(cleanSegments) >= 4 && cleanSegments[1] == "other" {
		// Other structure: /za/other/{FOLDER}/{CASE}.html
		folder = cleanSegments[2]
		year = "unknown" // No year in this structure
		caseFile = cleanSegments[3]
	} else {
		// Try to extract what we can from the available segments
		if len(cleanSegments) >= 3 {
			folder = cleanSegments[len(cleanSegments)-2] // Second to last segment
			year = "unknown"
			caseFile = cleanSegments[len(cleanSegments)-1] // Last segment
		} else {
			return "", "", "", fmt.Errorf("unexpected URL structure for '%s' - cannot extract required components", caseURL)
		}
	}
	
	if folder == "" || caseFile == "" {
		return "", "", "", fmt.Errorf("empty folder or case file extracted from URL '%s'", caseURL)
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

// extractTitleFromHTML extracts the title from HTML content
func extractTitleFromHTML(htmlContent []byte) string {
	content := string(htmlContent)
	
	// Find the title tag (case insensitive)
	titleStart := strings.Index(strings.ToLower(content), "<title>")
	if titleStart == -1 {
		return ""
	}
	titleStart += 7 // Move past "<title>"
	
	titleEnd := strings.Index(strings.ToLower(content[titleStart:]), "</title>")
	if titleEnd == -1 {
		return ""
	}
	
	title := content[titleStart : titleStart+titleEnd]
	return strings.TrimSpace(title)
}

// isValidUUID checks if a string is a valid UUID
func isValidUUID(u string) bool {
	_, err := uuid.Parse(u)
	return err == nil
}

// checkFileExists checks if a file with the given filename already exists in the database
func checkFileExists(ctx context.Context, supabaseClient *supabase.Client, fileName string, workerID int) (bool, error) {
	// Create a context with timeout for this specific operation
	checkCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	var exists bool
	
	// Define the check operation with retry
	operation := func() error {
		select {
		case <-checkCtx.Done():
			return fmt.Errorf("check operation timed out or cancelled")
		default:
		}

		log.Printf("🔍 Worker %d: Checking if file exists in database: %s", workerID, fileName)
		
		// Perform the select query with a channel to handle the response
		type checkResult struct {
			resp []byte
			err  error
		}
		
		resultChan := make(chan checkResult, 1)
		
		go func() {
			r, _, e := supabaseClient.From("files").Select("id", "", false).Eq("file_name", fileName).Execute()
			resultChan <- checkResult{resp: r, err: e}
		}()
		
		select {
		case <-checkCtx.Done():
			return fmt.Errorf("database check timed out after 30 seconds")
		case result := <-resultChan:
			if result.err != nil {
				return fmt.Errorf("database check failed: %v", result.err)
			}
			
			// Parse the response to check if any records exist
			var existingFiles []map[string]interface{}
			if err := json.Unmarshal(result.resp, &existingFiles); err != nil {
				return fmt.Errorf("failed to parse check response: %v", err)
			}
			
			exists = len(existingFiles) > 0
			return nil
		}
	}

	// Configure exponential backoff for retries
	expBackoff := backoff.NewExponentialBackOff()
	expBackoff.MaxElapsedTime = 1 * time.Minute
	expBackoff.InitialInterval = 1 * time.Second
	expBackoff.MaxInterval = 5 * time.Second

	// Retry the check operation
	if err := backoff.Retry(operation, backoff.WithContext(expBackoff, checkCtx)); err != nil {
		return false, fmt.Errorf("failed to check file existence after retries: %v", err)
	}

	if exists {
		log.Printf("✅ Worker %d: File already exists in database: %s", workerID, fileName)
	} else {
		log.Printf("🆕 Worker %d: File does not exist in database: %s", workerID, fileName)
	}
	
	return exists, nil
}

// insertFileRecord inserts a file record into Supabase with timeout and retry logic
func insertFileRecord(ctx context.Context, supabaseClient *supabase.Client, fileRecord map[string]interface{}, workerID int, fileName string) (string, error) {
	// Create a context with timeout for this specific operation
	insertCtx, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()

	var resp []byte
	var fileID string
	
	// Define the insert operation with retry
	operation := func() error {
		select {
		case <-insertCtx.Done():
			return fmt.Errorf("insert operation timed out or cancelled")
		default:
		}

		log.Printf("💾 Worker %d: Attempting database insert for: %s", workerID, fileName)
		
		// Perform the insert with a channel to handle the response
		type insertResult struct {
			resp []byte
			err  error
		}
		
		resultChan := make(chan insertResult, 1)
		
		go func() {
			r, _, e := supabaseClient.From("files").Insert(fileRecord, false, "", "representation", "").Execute()
			resultChan <- insertResult{resp: r, err: e}
		}()
		
		select {
		case <-insertCtx.Done():
			return fmt.Errorf("database insert timed out after 45 seconds")
		case result := <-resultChan:
			if result.err != nil {
				return fmt.Errorf("database insert failed: %v", result.err)
			}
			resp = result.resp
			
			// Parse the response to get the inserted 'id'
			var insertedFiles []map[string]interface{}
			if err := json.Unmarshal(resp, &insertedFiles); err != nil {
				return fmt.Errorf("failed to parse insert response: %v", err)
			}
			if len(insertedFiles) == 0 {
				return fmt.Errorf("no records found in insert response")
			}
			
			id, ok := insertedFiles[0]["id"].(string)
			if !ok || !isValidUUID(id) {
				return fmt.Errorf("invalid 'id' type or format in response")
			}
			
			fileID = id
			return nil
		}
	}

	// Configure exponential backoff for retries
	expBackoff := backoff.NewExponentialBackOff()
	expBackoff.MaxElapsedTime = 2 * time.Minute
	expBackoff.InitialInterval = 1 * time.Second
	expBackoff.MaxInterval = 10 * time.Second

	// Retry the insert operation
	if err := backoff.Retry(operation, backoff.WithContext(expBackoff, insertCtx)); err != nil {
		return "", fmt.Errorf("failed to insert after retries: %v", err)
	}

	log.Printf("✅ Worker %d: Successfully inserted database record for: %s (ID: %s)", workerID, fileName, fileID)
	return fileID, nil
}

func main() {
	// Load configuration
	log.Println("🚀 Starting scraper...")
	config, err := LoadConfig("config.json")
	if err != nil {
		log.Fatalf("Error loading config: %v", err)
	}
	log.Printf("✅ Config loaded - Concurrency: %d, Total URLs file: %s", config.Concurrency, config.CaseURLsFile)

	// Initialize Bunny CDN uploader
	uploader := NewBunnyCDNUploader(config.BunnyCDNAPIKey, config.BunnyStorageZone, config.BunnyStorageZoneRegion)
	log.Println("✅ Bunny CDN uploader initialized")

	// Initialize Supabase client
	supabaseClient, err := supabase.NewClient(config.SupabaseURL, config.SupabaseAPIKey, &supabase.ClientOptions{})
	if err != nil {
		log.Fatalf("Failed to initialize Supabase client: %v", err)
	}
	log.Println("✅ Supabase client initialized")

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
	log.Println("✅ HTTP client initialized")

	// Open the case URLs file
	log.Printf("📂 Opening case URLs file: %s", config.CaseURLsFile)
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
	log.Printf("📊 Found %d case URLs to process", totalCases)

	// Reverse the order of URLs to process them in reverse
	for i, j := 0, len(caseURLs)-1; i < j; i, j = i+1, j-1 {
		caseURLs[i], caseURLs[j] = caseURLs[j], caseURLs[i]
	}
	log.Printf("🔄 URLs reversed - will process from last to first")

	// Initialize progress bar
	p := mpb.New(mpb.WithWidth(80))
	bar := p.AddBar(int64(totalCases),
		mpb.PrependDecorators(
			decor.Name("Processing RTFs: "),
			decor.CountersNoUnit("%d/%d", decor.WCSyncWidth),
			decor.Name(" ("),
			decor.Percentage(decor.WC{W: 5}),
			decor.Name(")"),
		),
		mpb.AppendDecorators(
			decor.Name(" | "),
			decor.EwmaSpeed(0, "%.1f files/s", 60),
			decor.Name(" | "),
			decor.OnComplete(
				decor.EwmaETA(decor.ET_STYLE_MMSS, 60), "✅ Done!",
			),
		),
	)

	// Setup concurrency with worker pool pattern
	concurrency := config.Concurrency
	log.Printf("🔧 Setting up worker pool with %d workers", concurrency)
	
	// Create channels for work distribution
	urlChan := make(chan string, concurrency*2) // Buffer to prevent blocking
	var wg sync.WaitGroup

	// Context for graceful shutdown
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Handle OS Interrupts for graceful shutdown
	go func() {
		sig := make(chan os.Signal, 1)
		signal.Notify(sig, os.Interrupt, syscall.SIGTERM)
		<-sig
		log.Println("\n🛑 Interrupt signal received. Shutting down gracefully...")
		cancel()
		close(urlChan) // Close channel to stop workers
	}()

	// Start worker goroutines
	log.Printf("👷 Starting %d worker goroutines...", concurrency)
	for i := 0; i < concurrency; i++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			log.Printf("👷‍♂️ Worker %d started", workerID)
			
			for cURL := range urlChan {
				select {
				case <-ctx.Done():
					log.Printf("👷‍♂️ Worker %d stopping due to context cancellation", workerID)
					return
				default:
					processCase(ctx, workerID, cURL, uploader, supabaseClient, downloadClient, bar)
				}
			}
			log.Printf("👷‍♂️ Worker %d finished", workerID)
		}(i)
	}

	// Send URLs to workers
	log.Println("📤 Distributing URLs to workers...")
	go func() {
		defer close(urlChan)
		for i, cURL := range caseURLs {
			select {
			case <-ctx.Done():
				log.Printf("📤 URL distribution stopped at %d/%d due to context cancellation", i, totalCases)
				return
			case urlChan <- cURL:
				if (i+1)%100 == 0 || i == 0 {
					log.Printf("📤 Distributed %d/%d URLs to workers", i+1, totalCases)
				}
			}
		}
		log.Printf("📤 All %d URLs distributed to workers", totalCases)
	}()

	// Wait for all workers to finish
	log.Println("⏳ Waiting for all workers to complete...")
	wg.Wait()
	p.Wait()

	log.Println("🎉 All RTF files have been processed successfully!")
}

// processCase handles the processing of a single case URL
func processCase(ctx context.Context, workerID int, cURL string, uploader *BunnyCDNUploader, supabaseClient *supabase.Client, downloadClient *http.Client, bar *mpb.Bar) {
	defer bar.Increment()
	
	log.Printf("👷‍♂️ Worker %d: Processing %s", workerID, cURL)
	
	// Extract folder, year, and case number
	folder, year, caseNumber, err := ExtractDetailsFromURL(cURL)
	if err != nil {
		log.Printf("❌ Worker %d: Failed to extract details from URL '%s': %v", workerID, cURL, err)
		return
	}
	log.Printf("👷‍♂️ Worker %d: Extracted folder '%s', year '%s', case '%s' from %s", workerID, folder, year, caseNumber, cURL)

	// Skip URLs with unknown year
	if year == "unknown" {
		log.Printf("⏭️ Worker %d: Skipping URL with unknown year: %s", workerID, cURL)
		return
	}

	// Construct filename using court code, year, and case number
	fileName := fmt.Sprintf("%s-%s-%s.rtf", folder, year, caseNumber)
	log.Printf("📝 Worker %d: Expected file name: %s", workerID, fileName)

	// // Check if file already exists in the database before downloading
	// exists, err := checkFileExists(ctx, supabaseClient, fileName, workerID)
	// if err != nil {
	// 	log.Printf("❌ Worker %d: Failed to check file existence in database: %v", workerID, err)
	// 	return
	// }
	// if exists {
	// 	log.Printf("⏭️ Worker %d: Skipping already processed file: %s", workerID, fileName)
	// 	return
	// }

	// // First, download the HTML page to extract the title
	// log.Printf("👷‍♂️ Worker %d: Downloading HTML page to extract title from: %s", workerID, cURL)
	// htmlData, _, err := DownloadFile(downloadClient, cURL, "")
	// if err != nil {
	// 	log.Printf("❌ Worker %d: Failed to download HTML from '%s': %v", workerID, cURL, err)
	// 	return
	// }
	
	// Construct both URLs and filenames at the start
	rtfLink := strings.TrimSuffix(cURL, ".html") + ".rtf"
	pdfLink := strings.TrimSuffix(cURL, ".html") + ".pdf"
	rtfFileName := fileName  // Use the consistent filename you already generated
	pdfFileName := strings.TrimSuffix(fileName, ".rtf") + ".pdf"

	// Download RTF
	log.Printf("👷‍♂️ Worker %d: Attempting to download RTF from: %s", workerID, rtfLink)
	rtfData, _, err := DownloadFile(downloadClient, rtfLink, cURL)
	if err != nil {
		log.Printf("❌ Worker %d: Failed to download RTF from '%s': %v", workerID, rtfLink, err)
		return
	}
	log.Printf("✅ Worker %d: Successfully downloaded RTF file: %s (size: %.2f KB)", workerID, rtfFileName, float64(len(rtfData))/1024)

	// Upload RTF
	cdnPath := fmt.Sprintf("caseonza.b-cdn.net/%s", rtfFileName)
	log.Printf("📝 Worker %d: CDN path: %s", workerID, cdnPath)
	log.Printf("⬆️ Worker %d: Uploading to Bunny CDN: %s", workerID, cdnPath)
	err = uploader.UploadFile(rtfFileName, rtfData)
	if err != nil {
		log.Printf("❌ Worker %d: Failed to upload '%s' to Bunny CDN: %v", workerID, cdnPath, err)
		return
	}
	log.Printf("✅ Worker %d: Successfully uploaded to Bunny CDN: %s", workerID, cdnPath)

	// Download PDF
	log.Printf("👷‍♂️ Worker %d: Attempting to download PDF from: %s", workerID, pdfLink)
	pdfData, _, err := DownloadFile(downloadClient, pdfLink, cURL)
	if err != nil {
		log.Printf("❌ Worker %d: Failed to download PDF from '%s': %v", workerID, pdfLink, err)
		return
	}
	log.Printf("✅ Worker %d: Successfully downloaded PDF file: %s (size: %.2f KB)", workerID, pdfFileName, float64(len(pdfData))/1024)

	// Upload PDF
	pdfCdnPath := fmt.Sprintf("caseonza.b-cdn.net/%s", pdfFileName)
	log.Printf("📝 Worker %d: CDN path: %s", workerID, pdfCdnPath)
	err = uploader.UploadFile(pdfFileName, pdfData)
	if err != nil {
		log.Printf("❌ Worker %d: Failed to upload '%s' to Bunny CDN: %v", workerID, pdfCdnPath, err)
		return
	}
	log.Printf("✅ Worker %d: Successfully uploaded to Bunny CDN: %s", workerID, pdfCdnPath)
	
	// // Extract title from HTML
	// title := extractTitleFromHTML(htmlData)
	// if title == "" {
	// 	log.Printf("⚠️ Worker %d: Could not extract title from HTML for '%s'", workerID, cURL)
	// } else {
	// 	log.Printf("📝 Worker %d: Extracted title: %s", workerID, title)
	// }


	// // Prepare data for 'files' table with source_url and file_title
	// fileRecord := map[string]interface{}{
	// 	"file_name":  fileName,
	// 	"file_type":  "rtf",
	// 	"cdn_path":   cdnPath,
	// 	"file_size":  len(rtfData),
	// 	"mime_type":  "application/rtf",
	// 	"source_url": cURL,
	// 	"file_title": title,
	// }

	// // Insert into 'files' table
	// log.Printf("💾 Worker %d: Inserting file record into database: %s", workerID, fileName)
	// fileID, err := insertFileRecord(ctx, supabaseClient, fileRecord, workerID, fileName)
	// if err != nil {
	// 	log.Printf("❌ Worker %d: Failed to insert record into 'files' for '%s': %v", workerID, fileName, err)
	// 	return
	// }
	// log.Printf("✅ Worker %d: Successfully processed case: %s (file_id: %s)", workerID, fileName, fileID)
	log.Printf("✅ Worker %d: Successfully processed case: %s", workerID, fileName)
}