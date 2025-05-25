package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/supabase-community/supabase-go"
)

// Config holds the configuration for the RTF converter
type Config struct {
	BunnyCDNAPIKey         string `json:"bunny_cdn_api_key"`
	BunnyStorageZone       string `json:"bunny_storage_zone"`
	BunnyStorageZoneRegion string `json:"bunny_storage_zone_region"`
	SupabaseURL            string `json:"supabase_url"`
	SupabaseAPIKey         string `json:"supabase_api_key"`
	Concurrency            int    `json:"concurrency"`
}

// RTFFile represents a file record from Supabase
type RTFFile struct {
	ID       int    `json:"id"`
	Filename string `json:"filename"`
	CDNPath  string `json:"cdn_path"`
	Status   string `json:"status"`
}

// RTFConverter handles the conversion process
type RTFConverter struct {
	config     Config
	supabase   *supabase.Client
	httpClient *http.Client
}

// NewRTFConverter creates a new RTF converter instance
func NewRTFConverter(configPath string) (*RTFConverter, error) {
	// Load configuration
	configData, err := os.ReadFile(configPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read config file: %w", err)
	}

	var config Config
	if err := json.Unmarshal(configData, &config); err != nil {
		return nil, fmt.Errorf("failed to parse config: %w", err)
	}

	// Initialize Supabase client
	supabaseClient, err := supabase.NewClient(config.SupabaseURL, config.SupabaseAPIKey, &supabase.ClientOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to create Supabase client: %w", err)
	}

	// Create HTTP client with timeout
	httpClient := &http.Client{
		Timeout: 30 * time.Second,
	}

	return &RTFConverter{
		config:     config,
		supabase:   supabaseClient,
		httpClient: httpClient,
	}, nil
}

// GetRTFFilesBatch retrieves a batch of RTF files from Supabase
func (r *RTFConverter) GetRTFFilesBatch(ctx context.Context, batchSize int, offset int) ([]RTFFile, error) {
	var files []RTFFile

	// Query Supabase for RTF files that haven't been converted yet
	// Assuming you have a table called 'files' with columns: id, filename, cdn_path, status
	// and status can be 'pending', 'processing', 'converted', 'failed'
	result, _, err := r.supabase.From("files").
		Select("id, filename, cdn_path, status", "", false).
		Eq("status", "pending").
		Like("filename", "%.rtf").
		Range(offset, offset+batchSize-1, "").
		Execute()

	if err != nil {
		return nil, fmt.Errorf("failed to query Supabase: %w", err)
	}

	if err := json.Unmarshal(result, &files); err != nil {
		return nil, fmt.Errorf("failed to unmarshal files: %w", err)
	}

	return files, nil
}

// UpdateFileStatus updates the status of a file in Supabase
func (r *RTFConverter) UpdateFileStatus(ctx context.Context, fileID int, status string) error {
	updateData := map[string]interface{}{
		"status":     status,
		"updated_at": time.Now().UTC().Format(time.RFC3339),
	}

	_, _, err := r.supabase.From("files").
		Update(updateData, "", "").
		Eq("id", fmt.Sprintf("%d", fileID)).
		Execute()

	if err != nil {
		return fmt.Errorf("failed to update file status: %w", err)
	}

	return nil
}

// DownloadFile downloads a file from the CDN
func (r *RTFConverter) DownloadFile(ctx context.Context, cdnPath string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", cdnPath, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := r.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to download file: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("failed to download file: status %d", resp.StatusCode)
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	return data, nil
}

// ConvertRTFToPDF converts RTF content to PDF using LibreOffice
func (r *RTFConverter) ConvertRTFToPDF(ctx context.Context, rtfData []byte, filename string) ([]byte, error) {
	// Create temporary directory
	tempDir, err := os.MkdirTemp("", "rtf_converter_*")
	if err != nil {
		return nil, fmt.Errorf("failed to create temp directory: %w", err)
	}
	defer os.RemoveAll(tempDir)

	// Write RTF file to temp directory
	rtfPath := filepath.Join(tempDir, filename)
	if err := os.WriteFile(rtfPath, rtfData, 0644); err != nil {
		return nil, fmt.Errorf("failed to write RTF file: %w", err)
	}

	// Convert RTF to PDF using LibreOffice
	cmd := exec.CommandContext(ctx,
		"libreoffice",
		"--headless",
		"--convert-to", "pdf",
		"--outdir", tempDir,
		rtfPath,
	)

	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("LibreOffice conversion failed: %w, stderr: %s", err, stderr.String())
	}

	// Read the generated PDF
	pdfFilename := strings.TrimSuffix(filename, filepath.Ext(filename)) + ".pdf"
	pdfPath := filepath.Join(tempDir, pdfFilename)

	pdfData, err := os.ReadFile(pdfPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read generated PDF: %w", err)
	}

	return pdfData, nil
}

// UploadToBunnyCDN uploads a file to BunnyCDN
func (r *RTFConverter) UploadToBunnyCDN(ctx context.Context, data []byte, filename string) error {
	// Construct BunnyCDN upload URL
	uploadURL := fmt.Sprintf("https://jh.storage.b-cdn.net/caseon/%s",
		filename)

	req, err := http.NewRequestWithContext(ctx, "PUT", uploadURL, bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("failed to create upload request: %w", err)
	}

	req.Header.Set("AccessKey", r.config.BunnyCDNAPIKey)
	req.Header.Set("Content-Type", "application/pdf")

	resp, err := r.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to upload to BunnyCDN: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("BunnyCDN upload failed: status %d, body: %s", resp.StatusCode, string(body))
	}

	return nil
}

// ProcessFile processes a single RTF file
func (r *RTFConverter) ProcessFile(ctx context.Context, file RTFFile) error {
	log.Printf("Processing file: %s (ID: %d)", file.Filename, file.ID)

	// Update status to processing
	if err := r.UpdateFileStatus(ctx, file.ID, "processing"); err != nil {
		return fmt.Errorf("failed to update status to processing: %w", err)
	}

	// Download RTF file
	log.Printf("Downloading file from: %s", file.CDNPath)
	rtfData, err := r.DownloadFile(ctx, file.CDNPath)
	if err != nil {
		r.UpdateFileStatus(ctx, file.ID, "failed")
		return fmt.Errorf("failed to download file: %w", err)
	}

	// Convert RTF to PDF
	log.Printf("Converting RTF to PDF: %s", file.Filename)
	pdfData, err := r.ConvertRTFToPDF(ctx, rtfData, file.Filename)
	if err != nil {
		r.UpdateFileStatus(ctx, file.ID, "failed")
		return fmt.Errorf("failed to convert RTF to PDF: %w", err)
	}

	// Generate PDF filename
	pdfFilename := strings.TrimSuffix(file.Filename, filepath.Ext(file.Filename)) + ".pdf"

	// Upload PDF to BunnyCDN
	log.Printf("Uploading PDF to BunnyCDN: %s", pdfFilename)
	if err := r.UploadToBunnyCDN(ctx, pdfData, pdfFilename); err != nil {
		r.UpdateFileStatus(ctx, file.ID, "failed")
		return fmt.Errorf("failed to upload to BunnyCDN: %w", err)
	}

	// Update status to converted
	if err := r.UpdateFileStatus(ctx, file.ID, "converted"); err != nil {
		return fmt.Errorf("failed to update status to converted: %w", err)
	}

	log.Printf("Successfully processed file: %s", file.Filename)
	return nil
}

// ProcessBatch processes a batch of files concurrently
func (r *RTFConverter) ProcessBatch(ctx context.Context, files []RTFFile) {
	var wg sync.WaitGroup
	semaphore := make(chan struct{}, r.config.Concurrency)

	for _, file := range files {
		wg.Add(1)
		go func(f RTFFile) {
			defer wg.Done()
			semaphore <- struct{}{} // Acquire semaphore
			defer func() { <-semaphore }() // Release semaphore

			if err := r.ProcessFile(ctx, f); err != nil {
				log.Printf("Error processing file %s (ID: %d): %v", f.Filename, f.ID, err)
			}
		}(file)
	}

	wg.Wait()
}

// Run starts the RTF converter process
func (r *RTFConverter) Run(ctx context.Context) error {
	log.Println("Starting RTF converter...")

	batchSize := 50 // Process 50 files at a time
	offset := 0

	for {
		select {
		case <-ctx.Done():
			log.Println("Context cancelled, stopping RTF converter")
			return ctx.Err()
		default:
		}

		// Get batch of files
		files, err := r.GetRTFFilesBatch(ctx, batchSize, offset)
		if err != nil {
			log.Printf("Error getting files batch: %v", err)
			time.Sleep(10 * time.Second)
			continue
		}

		if len(files) == 0 {
			log.Println("No more files to process, waiting...")
			time.Sleep(30 * time.Second)
			offset = 0 // Reset offset to check for new files
			continue
		}

		log.Printf("Processing batch of %d files", len(files))
		r.ProcessBatch(ctx, files)

		offset += len(files)

		// Small delay between batches
		time.Sleep(1 * time.Second)
	}
}

func main() {
	// Check if LibreOffice is available
	if _, err := exec.LookPath("libreoffice"); err != nil {
		log.Fatal("LibreOffice not found. Please install LibreOffice to use this converter.")
	}

	// Load configuration
	configPath := "../config.json" // Relative to rtf_converter directory
	if len(os.Args) > 1 {
		configPath = os.Args[1]
	}

	converter, err := NewRTFConverter(configPath)
	if err != nil {
		log.Fatalf("Failed to create RTF converter: %v", err)
	}

	// Create context with cancellation
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Handle graceful shutdown
	go func() {
		// You can add signal handling here if needed
		// For now, the converter will run indefinitely
	}()

	// Start the converter
	if err := converter.Run(ctx); err != nil {
		log.Fatalf("RTF converter failed: %v", err)
	}
}
