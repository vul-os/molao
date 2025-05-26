package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math/rand"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"
	cryptorand "crypto/rand"
	"math/big"

	"github.com/schollz/progressbar/v3"
	"github.com/supabase-community/supabase-go"
)

// ANSI color codes for colored output
const (
	ColorReset  = "\033[0m"
	ColorRed    = "\033[31m"
	ColorGreen  = "\033[32m"
	ColorYellow = "\033[33m"
	ColorBlue   = "\033[34m"
	ColorPurple = "\033[35m"
	ColorCyan   = "\033[36m"
	ColorWhite  = "\033[37m"
	ColorBold   = "\033[1m"
)

// Visual indicators
const (
	IconSuccess = "✓"
	IconError   = "✗"
	IconWarning = "⚠"
	IconInfo    = "ℹ"
	IconProcess = "⚡"
	IconUpload  = "↗"
	IconDownload = "↙"
	IconConvert = "🔄"
)

// Logging helper functions
func logSuccess(format string, args ...interface{}) {
	log.Printf("%s%s%s %s", ColorGreen, IconSuccess, ColorReset, fmt.Sprintf(format, args...))
}

func logError(format string, args ...interface{}) {
	log.Printf("%s%s%s %s", ColorRed, IconError, ColorReset, fmt.Sprintf(format, args...))
}

func logWarning(format string, args ...interface{}) {
	log.Printf("%s%s%s %s", ColorYellow, IconWarning, ColorReset, fmt.Sprintf(format, args...))
}

func logInfo(format string, args ...interface{}) {
	log.Printf("%s%s%s %s", ColorBlue, IconInfo, ColorReset, fmt.Sprintf(format, args...))
}

func logProcess(format string, args ...interface{}) {
	log.Printf("%s%s%s %s", ColorCyan, IconProcess, ColorReset, fmt.Sprintf(format, args...))
}

func logUpload(format string, args ...interface{}) {
	log.Printf("%s%s%s %s", ColorPurple, IconUpload, ColorReset, fmt.Sprintf(format, args...))
}

func logDownload(format string, args ...interface{}) {
	log.Printf("%s%s%s %s", ColorCyan, IconDownload, ColorReset, fmt.Sprintf(format, args...))
}

func logConvert(format string, args ...interface{}) {
	log.Printf("%s%s%s %s", ColorYellow, IconConvert, ColorReset, fmt.Sprintf(format, args...))
}

// Config holds the configuration for the RTF converter
type Config struct {
	BunnyCDNAPIKey         string `json:"bunny_cdn_api_key"`
	BunnyStorageZone       string `json:"bunny_storage_zone"`
	BunnyStorageZoneRegion string `json:"bunny_storage_zone_region"`
	SupabaseURL            string `json:"supabase_url"`
	SupabaseAPIKey         string `json:"supabase_api_key"`
	Concurrency            int    `json:"concurrency"`
	LibreOfficeBasePort    int    `json:"libreoffice_base_port"` // Changed from LibreOfficePort
}

// RTFFile represents a file record from Supabase
type RTFFile struct {
	ID       string `json:"id"`
	Filename string `json:"file_name"`
	CDNPath  string `json:"cdn_path"`
}

// LibreOfficeInstance represents a single LibreOffice instance
type LibreOfficeInstance struct {
	port       int
	process    *exec.Cmd
	profileDir string
	tempDir    string
	mutex      sync.Mutex
	inUse      bool
	id         int
}

// LibreOfficePool manages multiple LibreOffice instances for concurrent processing
type LibreOfficePool struct {
	instances []*LibreOfficeInstance
	available chan *LibreOfficeInstance
	basePort  int
	poolSize  int
	mutex     sync.RWMutex
}

// RTFConverter handles the conversion process
type RTFConverter struct {
	config     Config
	supabase   *supabase.Client
	httpClient *http.Client
	loPool     *LibreOfficePool
}

// NewLibreOfficeInstance creates a new LibreOffice instance
func NewLibreOfficeInstance(id, port int) *LibreOfficeInstance {
	return &LibreOfficeInstance{
		id:   id,
		port: port,
	}
}

// Start starts the LibreOffice instance with isolated profile
func (loi *LibreOfficeInstance) Start(ctx context.Context) error {
	loi.mutex.Lock()
	defer loi.mutex.Unlock()

	if loi.process != nil {
		return nil // Already started
	}

	logProcess("Starting LibreOffice instance %d on port %d...", loi.id, loi.port)

	// Check if LibreOffice is available
	if _, err := exec.LookPath("libreoffice"); err != nil {
		logError("LibreOffice not found: %v", err)
		return fmt.Errorf("LibreOffice not found: %w", err)
	}

	// Create isolated temporary directory for this instance
	tempDir, err := os.MkdirTemp("", fmt.Sprintf("libreoffice_instance_%d_*", loi.id))
	if err != nil {
		logError("Failed to create temp directory for instance %d: %v", loi.id, err)
		return fmt.Errorf("failed to create temp directory: %w", err)
	}
	loi.tempDir = tempDir

	// Create isolated profile directory
	profileDir := filepath.Join(tempDir, "profile")
	if err := os.MkdirAll(profileDir, 0755); err != nil {
		logError("Failed to create profile directory for instance %d: %v", loi.id, err)
		return fmt.Errorf("failed to create profile directory: %w", err)
	}
	loi.profileDir = profileDir

	// Kill any existing process that might be using our port
	loi.killProcessOnPort()

	// Start LibreOffice in headless mode with UNO socket listener
	acceptString := fmt.Sprintf("socket,host=127.0.0.1,port=%d;urp;", loi.port)
	
	cmd := exec.CommandContext(ctx,
		"libreoffice",
		"--headless",
		"--invisible",
		"--nocrashreport",
		"--nodefault",
		"--nofirststartwizard",
		"--nologo",
		"--norestore",
		fmt.Sprintf("--accept=%s", acceptString),
		fmt.Sprintf("-env:UserInstallation=file://%s", profileDir),
	)

	// Set isolated environment for this instance
	cmd.Env = append(os.Environ(),
		fmt.Sprintf("HOME=%s", tempDir),
		fmt.Sprintf("TMPDIR=%s", tempDir),
		fmt.Sprintf("XDG_CONFIG_HOME=%s", profileDir),
		fmt.Sprintf("XDG_DATA_HOME=%s", profileDir),
		fmt.Sprintf("XDG_CACHE_HOME=%s", profileDir),
	)

	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	logInfo("Starting LibreOffice instance %d with command: %v", loi.id, cmd.Args)
	
	if err := cmd.Start(); err != nil {
		logError("Failed to start LibreOffice instance %d: %v, stderr: %s", loi.id, err, stderr.String())
		os.RemoveAll(tempDir)
		return fmt.Errorf("failed to start LibreOffice instance %d: %w, stderr: %s", loi.id, err, stderr.String())
	}

	loi.process = cmd

	// Wait for LibreOffice to start and listen on the socket
	if err := loi.waitForConnection(30 * time.Second); err != nil {
		loi.Stop()
		logError("LibreOffice instance %d failed to start listening: %v", loi.id, err)
		return fmt.Errorf("LibreOffice instance %d failed to start listening: %w", loi.id, err)
	}

	logSuccess("LibreOffice instance %d started successfully on port %d", loi.id, loi.port)
	return nil
}

// waitForConnection waits for LibreOffice to start listening on the socket
func (loi *LibreOfficeInstance) waitForConnection(timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	
	for time.Now().Before(deadline) {
		conn, err := net.DialTimeout("tcp", fmt.Sprintf("127.0.0.1:%d", loi.port), 1*time.Second)
		if err == nil {
			conn.Close()
			return nil
		}
		time.Sleep(500 * time.Millisecond)
	}
	
	return fmt.Errorf("timeout waiting for LibreOffice instance %d to listen on port %d", loi.id, loi.port)
}

// killProcessOnPort kills any process using our port
func (loi *LibreOfficeInstance) killProcessOnPort() {
	// Try to find and kill process using our specific port
	cmd := exec.Command("lsof", "-ti", fmt.Sprintf(":%d", loi.port))
	if output, err := cmd.Output(); err == nil {
		pid := strings.TrimSpace(string(output))
		if pid != "" {
			logWarning("Killing existing process %s on port %d for instance %d", pid, loi.port, loi.id)
			exec.Command("kill", "-9", pid).Run()
			time.Sleep(1 * time.Second)
		}
	}
}

// Stop stops the LibreOffice instance and cleans up
func (loi *LibreOfficeInstance) Stop() {
	loi.mutex.Lock()
	defer loi.mutex.Unlock()

	if loi.process == nil {
		return
	}

	logProcess("Stopping LibreOffice instance %d...", loi.id)

	// Try graceful shutdown first
	if err := loi.process.Process.Signal(os.Interrupt); err != nil {
		logWarning("Failed to send interrupt signal to instance %d: %v", loi.id, err)
	}

	// Wait for graceful shutdown
	done := make(chan error, 1)
	go func() {
		done <- loi.process.Wait()
	}()

	select {
	case <-time.After(5 * time.Second):
		// Force kill if graceful shutdown takes too long
		logWarning("Force killing LibreOffice instance %d process...", loi.id)
		loi.process.Process.Kill()
		<-done
	case err := <-done:
		if err != nil {
			logWarning("LibreOffice instance %d process exited with error: %v", loi.id, err)
		}
	}

	loi.process = nil

	// Clean up temporary directory
	if loi.tempDir != "" {
		logInfo("Cleaning up temp directory for instance %d: %s", loi.id, loi.tempDir)
		os.RemoveAll(loi.tempDir)
		loi.tempDir = ""
		loi.profileDir = ""
	}

	logSuccess("LibreOffice instance %d stopped and cleaned up", loi.id)
}

// IsRunning checks if the LibreOffice instance is running
func (loi *LibreOfficeInstance) IsRunning() bool {
	loi.mutex.Lock()
	defer loi.mutex.Unlock()

	if loi.process == nil {
		return false
	}

	// Check if process is still alive
	if loi.process.ProcessState != nil && loi.process.ProcessState.Exited() {
		loi.process = nil
		return false
	}

	// Check if socket is still listening with shorter timeout
	conn, err := net.DialTimeout("tcp", fmt.Sprintf("127.0.0.1:%d", loi.port), 2*time.Second)
	if err != nil {
		logWarning("LibreOffice instance %d socket check failed: %v", loi.id, err)
		return false
	}
	conn.Close()
	return true
}

// HealthCheck performs a more thorough health check of the LibreOffice instance
func (loi *LibreOfficeInstance) HealthCheck(ctx context.Context) error {
	if !loi.IsRunning() {
		return fmt.Errorf("instance %d is not running", loi.id)
	}
	
	// Try to connect multiple times to ensure stability
	for i := 0; i < 3; i++ {
		conn, err := net.DialTimeout("tcp", fmt.Sprintf("127.0.0.1:%d", loi.port), 1*time.Second)
		if err != nil {
			logWarning("LibreOffice instance %d health check failed attempt %d: %v", loi.id, i+1, err)
			if i == 2 {
				return fmt.Errorf("instance %d failed health check after 3 attempts", loi.id)
			}
			time.Sleep(500 * time.Millisecond)
			continue
		}
		conn.Close()
		break
	}
	
	return nil
}

// NewLibreOfficePool creates a new LibreOffice pool
func NewLibreOfficePool(basePort, poolSize int) *LibreOfficePool {
	pool := &LibreOfficePool{
		instances: make([]*LibreOfficeInstance, poolSize),
		available: make(chan *LibreOfficeInstance, poolSize),
		basePort:  basePort,
		poolSize:  poolSize,
	}

	// Create instances
	for i := 0; i < poolSize; i++ {
		port := basePort + i
		instance := NewLibreOfficeInstance(i, port)
		pool.instances[i] = instance
	}

	return pool
}

// Start starts all LibreOffice instances in the pool
func (lop *LibreOfficePool) Start(ctx context.Context) error {
	logProcess("Starting LibreOffice pool with %d instances (ports %d-%d)...", 
		lop.poolSize, lop.basePort, lop.basePort+lop.poolSize-1)

	var wg sync.WaitGroup
	errors := make(chan error, lop.poolSize)

	// Start all instances concurrently
	for i, instance := range lop.instances {
		wg.Add(1)
		go func(idx int, inst *LibreOfficeInstance) {
			defer wg.Done()
			if err := inst.Start(ctx); err != nil {
				logError("Failed to start LibreOffice instance %d: %v", idx, err)
				errors <- fmt.Errorf("failed to start instance %d: %w", idx, err)
				return
			}
			// Add to available pool
			lop.available <- inst
		}(i, instance)
	}

	wg.Wait()
	close(errors)

	// Check for any startup errors
	var startupErrors []error
	for err := range errors {
		startupErrors = append(startupErrors, err)
	}

	if len(startupErrors) > 0 {
		logError("Failed to start %d/%d LibreOffice instances", len(startupErrors), lop.poolSize)
		// Stop any successfully started instances
		lop.Stop()
		return fmt.Errorf("failed to start %d instances: %v", len(startupErrors), startupErrors[0])
	}

	logSuccess("Successfully started all %d LibreOffice instances", lop.poolSize)
	return nil
}

// Get acquires an available LibreOffice instance from the pool
func (lop *LibreOfficePool) Get(ctx context.Context) (*LibreOfficeInstance, error) {
	// Add timeout to prevent indefinite blocking
	getCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	
	select {
	case instance := <-lop.available:
		instance.inUse = true
		logInfo("Acquired LibreOffice instance %d from pool", instance.id)
		
		// Perform health check on the instance
		if err := instance.HealthCheck(ctx); err != nil {
			logWarning("LibreOffice instance %d failed health check: %v, restarting...", instance.id, err)
			
			// Stop the unhealthy instance
			instance.Stop()
			
			// Try to restart it
			if err := instance.Start(ctx); err != nil {
				logError("Failed to restart LibreOffice instance %d: %v", instance.id, err)
				// Return instance to pool even if restart failed
				lop.Put(instance)
				return nil, fmt.Errorf("failed to restart LibreOffice instance %d: %w", instance.id, err)
			}
			
			// Verify the restarted instance is healthy
			if err := instance.HealthCheck(ctx); err != nil {
				logError("Restarted LibreOffice instance %d still unhealthy: %v", instance.id, err)
				lop.Put(instance)
				return nil, fmt.Errorf("restarted LibreOffice instance %d still unhealthy: %w", instance.id, err)
			}
			
			logSuccess("Successfully restarted LibreOffice instance %d", instance.id)
		}
		
		return instance, nil
	case <-getCtx.Done():
		if getCtx.Err() == context.DeadlineExceeded {
			logError("Timeout waiting for LibreOffice instance from pool after 30 seconds")
			return nil, fmt.Errorf("timeout waiting for LibreOffice instance from pool")
		}
		return nil, getCtx.Err()
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

// Put returns a LibreOffice instance to the pool
func (lop *LibreOfficePool) Put(instance *LibreOfficeInstance) {
	if instance == nil {
		return
	}
	
	instance.inUse = false
	logInfo("Returning LibreOffice instance %d to pool", instance.id)
	
	select {
	case lop.available <- instance:
		// Successfully returned to pool
	default:
		// Pool is full, this shouldn't happen but handle gracefully
		logWarning("LibreOffice pool is full, cannot return instance %d", instance.id)
	}
}

// Stop stops all LibreOffice instances in the pool
func (lop *LibreOfficePool) Stop() {
	logProcess("Stopping LibreOffice pool...")

	// Stop all instances
	var wg sync.WaitGroup
	for _, instance := range lop.instances {
		wg.Add(1)
		go func(inst *LibreOfficeInstance) {
			defer wg.Done()
			inst.Stop()
		}(instance)
	}

	wg.Wait()

	// Drain the available channel
	for {
		select {
		case <-lop.available:
			// Drain
		default:
			goto done
		}
	}
done:

	logSuccess("LibreOffice pool stopped")
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

	// Set default LibreOffice base port if not specified
	if config.LibreOfficeBasePort == 0 {
		config.LibreOfficeBasePort = 8100
	}

	// Set default concurrency if not specified
	if config.Concurrency == 0 {
		config.Concurrency = 4
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

	// Create LibreOffice pool with same size as concurrency
	loPool := NewLibreOfficePool(config.LibreOfficeBasePort, config.Concurrency)

	return &RTFConverter{
		config:     config,
		supabase:   supabaseClient,
		httpClient: httpClient,
		loPool:     loPool,
	}, nil
}

// GetRTFFilesBatch retrieves a batch of RTF files from Supabase
func (r *RTFConverter) GetRTFFilesBatch(ctx context.Context, batchSize int, offset int) ([]RTFFile, error) {
	var files []RTFFile

	// Query Supabase for RTF files
	result, _, err := r.supabase.From("files").
		Select("id, file_name, cdn_path", "", false).
		Like("file_name", "%.rtf").
		Range(offset, offset+batchSize-1, "").
		Execute()

	if err != nil {
		logError("Failed to query Supabase: %v", err)
		return nil, fmt.Errorf("failed to query Supabase: %w", err)
	}

	if err := json.Unmarshal(result, &files); err != nil {
		logError("Failed to unmarshal files: %v", err)
		return nil, fmt.Errorf("failed to unmarshal files: %w", err)
	}

	// Filter out files that already have PDFs (optional optimization)
	var filteredFiles []RTFFile
	for _, file := range files {
		pdfExists, err := r.CheckPDFExists(ctx, file.Filename)
		if err != nil {
			// If we can't check, include the file to be safe
			logWarning("Could not check PDF existence for %s, including in batch: %v", file.Filename, err)
			filteredFiles = append(filteredFiles, file)
		} else if !pdfExists {
			filteredFiles = append(filteredFiles, file)
		} else {
			logInfo("Skipping %s - PDF already exists", file.Filename)
		}
	}

	logInfo("Filtered batch: %d RTF files -> %d files needing conversion", len(files), len(filteredFiles))

	// Shuffle the filtered files randomly to avoid processing the same files in the same order
	if len(filteredFiles) > 1 {
		rand.Shuffle(len(filteredFiles), func(i, j int) {
			filteredFiles[i], filteredFiles[j] = filteredFiles[j], filteredFiles[i]
		})
		logInfo("Shuffled %d files in batch for random processing order", len(filteredFiles))
	}

	return filteredFiles, nil
}

// DownloadFile downloads a file from the CDN
func (r *RTFConverter) DownloadFile(ctx context.Context, cdnPath string) ([]byte, error) {
	// Add https:// prefix if not present
	if !strings.HasPrefix(cdnPath, "http://") && !strings.HasPrefix(cdnPath, "https://") {
		cdnPath = "https://" + cdnPath
	}

	req, err := http.NewRequestWithContext(ctx, "GET", cdnPath, nil)
	if err != nil {
		logError("Failed to create download request: %v", err)
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := r.httpClient.Do(req)
	if err != nil {
		logError("Failed to download file: %v", err)
		return nil, fmt.Errorf("failed to download file: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		logError("Failed to download file: status %d", resp.StatusCode)
		return nil, fmt.Errorf("failed to download file: status %d", resp.StatusCode)
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		logError("Failed to read response body: %v", err)
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	return data, nil
}

// ConvertRTFToPDF converts RTF content to PDF using an isolated LibreOffice instance
func (r *RTFConverter) ConvertRTFToPDF(ctx context.Context, rtfData []byte, filename string) ([]byte, error) {
	logConvert("Starting RTF to PDF conversion for: %s (size: %d bytes)", filename, len(rtfData))
	
	// Get LibreOffice instance from pool
	instance, err := r.loPool.Get(ctx)
	if err != nil {
		logError("Failed to get LibreOffice instance for %s: %v", filename, err)
		return nil, fmt.Errorf("failed to get LibreOffice instance: %w", err)
	}
	defer r.loPool.Put(instance)

	// Create temporary directory for this conversion
	tempDir, err := os.MkdirTemp("", fmt.Sprintf("rtf_conversion_%d_*", instance.id))
	if err != nil {
		logError("Failed to create temp directory for %s: %v", filename, err)
		return nil, fmt.Errorf("failed to create temp directory: %w", err)
	}
	defer func() {
		logInfo("Cleaning up conversion temp directory for %s: %s", filename, tempDir)
		os.RemoveAll(tempDir)
	}()

	logInfo("Created conversion temp directory for %s: %s", filename, tempDir)

	// Generate unique filename to avoid conflicts
	randomSuffix, _ := cryptorand.Int(cryptorand.Reader, big.NewInt(1000000))
	uniqueFilename := fmt.Sprintf("%d_%s_%s", instance.id, randomSuffix.String(), filename)
	rtfPath := filepath.Join(tempDir, uniqueFilename)
	
	logInfo("Writing RTF file to: %s", rtfPath)
	if err := os.WriteFile(rtfPath, rtfData, 0644); err != nil {
		logError("Failed to write RTF file %s: %v", filename, err)
		return nil, fmt.Errorf("failed to write RTF file: %w", err)
	}

	logSuccess("Successfully wrote RTF file: %s", rtfPath)

	// Validate RTF file format before attempting conversion
	if len(rtfData) == 0 {
		logError("RTF file %s is empty", filename)
		return nil, fmt.Errorf("RTF file %s is empty", filename)
	}
	
	// Check if file starts with RTF header
	rtfHeader := string(rtfData[:min(10, len(rtfData))])
	if !strings.HasPrefix(rtfHeader, "{\\rtf") {
		logError("Invalid RTF format for %s. File starts with: %q", filename, rtfHeader)
		// Log more of the file content for debugging
		sampleSize := min(500, len(rtfData))
		logError("File content sample for %s (first %d bytes): %q", filename, sampleSize, string(rtfData[:sampleSize]))
		return nil, fmt.Errorf("file %s does not appear to be valid RTF format (missing RTF header)", filename)
	}
	
	logSuccess("RTF file %s appears valid (starts with: %s)", filename, rtfHeader)

	// Create a context with timeout for LibreOffice conversion
	conversionCtx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()

	// Convert RTF to PDF using the isolated LibreOffice instance
	pdfFilename := strings.TrimSuffix(uniqueFilename, filepath.Ext(uniqueFilename)) + ".pdf"
	pdfPath := filepath.Join(tempDir, pdfFilename)

	// Use direct conversion without UNO connection (more reliable for concurrent use)
	cmd := exec.CommandContext(conversionCtx,
		"libreoffice",
		"--headless",
		"--convert-to", "pdf",
		"--outdir", tempDir,
		fmt.Sprintf("-env:UserInstallation=file://%s", instance.profileDir),
		rtfPath,
	)

	// Set isolated environment
	cmd.Env = append(os.Environ(),
		fmt.Sprintf("HOME=%s", instance.tempDir),
		fmt.Sprintf("TMPDIR=%s", tempDir),
		fmt.Sprintf("XDG_CONFIG_HOME=%s", instance.profileDir),
		fmt.Sprintf("XDG_DATA_HOME=%s", instance.profileDir),
		fmt.Sprintf("XDG_CACHE_HOME=%s", instance.profileDir),
	)

	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	logProcess("Starting LibreOffice conversion for %s using instance %d...", filename, instance.id)
	logInfo("LibreOffice command: %v", cmd.Args)
	startTime := time.Now()

	if err := cmd.Run(); err != nil {
		conversionDuration := time.Since(startTime)
		logError("LibreOffice conversion failed for %s after %v using instance %d: %v", filename, conversionDuration, instance.id, err)
		logError("LibreOffice stderr for %s: %s", filename, stderr.String())
		
		// Check if it was a timeout
		if conversionCtx.Err() == context.DeadlineExceeded {
			logError("LibreOffice conversion timed out after 60 seconds for file %s", filename)
			return nil, fmt.Errorf("LibreOffice conversion timed out after 60 seconds for file %s", filename)
		}
		
		return nil, fmt.Errorf("LibreOffice conversion failed: %w, stderr: %s", err, stderr.String())
	}

	conversionDuration := time.Since(startTime)
	logSuccess("LibreOffice conversion completed for %s in %v using instance %d", filename, conversionDuration, instance.id)

	// Read the generated PDF
	logInfo("Reading generated PDF from: %s", pdfPath)

	pdfData, err := os.ReadFile(pdfPath)
	if err != nil {
		logError("Failed to read generated PDF %s: %v", pdfPath, err)
		
		// List files in temp directory for debugging
		if files, err := os.ReadDir(tempDir); err != nil {
			logError("Could not list temp directory %s: %v", tempDir, err)
		} else {
			logInfo("Files in temp directory %s after conversion:", tempDir)
			for _, file := range files {
				if info, err := file.Info(); err == nil {
					logInfo("  - %s (size: %d bytes)", file.Name(), info.Size())
				} else {
					logWarning("  - %s (could not get info)", file.Name())
				}
			}
		}
		
		return nil, fmt.Errorf("failed to read generated PDF: %w", err)
	}

	logSuccess("Successfully converted %s to PDF (output size: %d bytes, conversion time: %v, instance: %d)", 
		filename, len(pdfData), conversionDuration, instance.id)
	return pdfData, nil
}

// UploadToBunnyCDN uploads a file to BunnyCDN
func (r *RTFConverter) UploadToBunnyCDN(ctx context.Context, data []byte, filename string) error {
	logUpload("Starting upload to BunnyCDN for file: %s (size: %d bytes)", filename, len(data))
	
	// Construct BunnyCDN upload URL
	uploadURL := fmt.Sprintf("https://jh.storage.bunnycdn.com/caseonza/%s",
		filename)
	
	logInfo("Upload URL: %s", uploadURL)

	req, err := http.NewRequestWithContext(ctx, "PUT", uploadURL, bytes.NewReader(data))
	if err != nil {
		logError("Failed to create upload request for %s: %v", filename, err)
		return fmt.Errorf("failed to create upload request: %w", err)
	}

	req.Header.Set("AccessKey", r.config.BunnyCDNAPIKey)
	req.Header.Set("Content-Type", "application/pdf")
	
	logProcess("Sending PUT request to BunnyCDN for %s...", filename)
	startTime := time.Now()

	resp, err := r.httpClient.Do(req)
	if err != nil {
		logError("HTTP request failed for %s after %v: %v", filename, time.Since(startTime), err)
		return fmt.Errorf("failed to upload to BunnyCDN: %w", err)
	}
	defer resp.Body.Close()
	
	uploadDuration := time.Since(startTime)
	logInfo("Upload request completed for %s in %v, status: %d", filename, uploadDuration, resp.StatusCode)

	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		logError("BunnyCDN upload failed for %s: status %d, response body: %s", filename, resp.StatusCode, string(body))
		return fmt.Errorf("BunnyCDN upload failed: status %d, body: %s", resp.StatusCode, string(body))
	}

	logSuccess("Successfully uploaded %s to BunnyCDN (size: %d bytes, duration: %v)", filename, len(data), uploadDuration)
	return nil
}

// ProcessFile processes a single RTF file
func (r *RTFConverter) ProcessFile(ctx context.Context, file RTFFile) error {
	// Add timeout for the entire file processing operation
	processCtx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()
	
	logProcess("Processing file: %s (ID: %s)", file.Filename, file.ID)

	// Download RTF file
	logDownload("Downloading file from: %s", file.CDNPath)
	rtfData, err := r.DownloadFile(processCtx, file.CDNPath)
	if err != nil {
		logError("Failed to download file %s: %v", file.Filename, err)
		return fmt.Errorf("failed to download file: %w", err)
	}

	// Convert RTF to PDF
	logConvert("Converting RTF to PDF: %s", file.Filename)
	pdfData, err := r.ConvertRTFToPDF(processCtx, rtfData, file.Filename)
	if err != nil {
		logError("Failed to convert RTF to PDF for %s: %v", file.Filename, err)
		return fmt.Errorf("failed to convert RTF to PDF: %w", err)
	}

	// Generate PDF filename
	pdfFilename := strings.TrimSuffix(file.Filename, filepath.Ext(file.Filename)) + ".pdf"

	// Upload PDF to BunnyCDN
	logUpload("Uploading PDF to BunnyCDN: %s", pdfFilename)
	if err := r.UploadToBunnyCDN(processCtx, pdfData, pdfFilename); err != nil {
		logError("Failed to upload to BunnyCDN for %s: %v", pdfFilename, err)
		return fmt.Errorf("failed to upload to BunnyCDN: %w", err)
	}

	logSuccess("Successfully processed file: %s", file.Filename)
	return nil
}

// GetTotalRTFFilesCount gets the total count of RTF files
func (r *RTFConverter) GetTotalRTFFilesCount(ctx context.Context) (int, error) {
	logInfo("Querying total count of RTF files...")
	
	// Use a count query with head=true to get just the count
	result, count, err := r.supabase.From("files").
		Select("id", "exact", true). // head=true for count only
		Like("file_name", "%.rtf").
		Execute()

	if err != nil {
		logError("Failed to query total count: %v", err)
		return 0, fmt.Errorf("failed to query total count: %w", err)
	}

	// If count is available from the response headers, use it
	if count > 0 {
		logSuccess("Got count from response headers: %d", count)
		return int(count), nil
	}

	// Fallback: if count is not available, parse the result
	if result != nil {
		var files []map[string]interface{}
		if err := json.Unmarshal(result, &files); err != nil {
			logError("Failed to unmarshal count result: %v", err)
			return 0, fmt.Errorf("failed to unmarshal count result: %w", err)
		}
		logSuccess("Got count from result parsing: %d", len(files))
		return len(files), nil
	}

	logWarning("No count available, returning 0")
	return 0, nil
}

// Run starts the RTF converter process
func (r *RTFConverter) Run(ctx context.Context) error {
	logInfo("Starting RTF converter...")

	// Start LibreOffice pool
	logProcess("Starting LibreOffice pool...")
	if err := r.loPool.Start(ctx); err != nil {
		logError("Failed to start LibreOffice pool: %v", err)
		return fmt.Errorf("failed to start LibreOffice pool: %w", err)
	}
	defer r.loPool.Stop()

	// Start periodic health check for LibreOffice instances
	go r.periodicHealthCheck(ctx)

	// Get total count of RTF files
	logInfo("Getting total count of RTF files...")
	totalCount, err := r.GetTotalRTFFilesCount(ctx)
	if err != nil {
		logError("Failed to get total RTF files count: %v", err)
		return fmt.Errorf("failed to get total RTF files count: %w", err)
	}

	if totalCount == 0 {
		logWarning("No RTF files found to process")
		return nil
	}

	logSuccess("Found %d RTF files to process", totalCount)

	// Calculate batch processing parameters
	batchSize := 50
	totalBatches := (totalCount + batchSize - 1) / batchSize // Ceiling division
	
	logInfo("Processing in %d batches of %d files each", totalBatches, batchSize)

	// Create a randomized list of batch numbers to process batches in random order
	batchOrder := make([]int, totalBatches)
	for i := 0; i < totalBatches; i++ {
		batchOrder[i] = i
	}
	
	// Shuffle the batch order
	rand.Shuffle(len(batchOrder), func(i, j int) {
		batchOrder[i], batchOrder[j] = batchOrder[j], batchOrder[i]
	})
	logInfo("Randomized batch processing order to avoid repeating same batches on restart")

	// Create overall progress bar for all files
	overallBar := progressbar.NewOptions(totalCount,
		progressbar.OptionSetDescription("Converting RTF files (overall)"),
		progressbar.OptionSetWidth(50),
		progressbar.OptionShowCount(),
		progressbar.OptionShowIts(),
		progressbar.OptionSetTheme(progressbar.Theme{
			Saucer:        "=",
			SaucerHead:    ">",
			SaucerPadding: " ",
			BarStart:      "[",
			BarEnd:        "]",
		}),
	)

	// Process files in batches
	processedFiles := 0
	
	for batchIndex, batchNum := range batchOrder {
		select {
		case <-ctx.Done():
			logWarning("Context cancelled, stopping RTF converter")
			return ctx.Err()
		default:
		}

		offset := batchNum * batchSize
		
		logProcess("Processing batch %d/%d (actual batch #%d, files %d-%d)", 
			batchIndex+1, totalBatches, batchNum+1, offset+1, min(offset+batchSize, totalCount))

		// Fetch current batch of files
		files, err := r.GetRTFFilesBatch(ctx, batchSize, offset)
		if err != nil {
			logError("Error fetching batch %d: %v", batchNum+1, err)
			continue
		}

		if len(files) == 0 {
			logWarning("No files in batch %d, continuing to next batch", batchNum+1)
			continue
		}

		logSuccess("Fetched %d files in batch %d (actual batch #%d)", len(files), batchIndex+1, batchNum+1)

		// Create batch progress bar
		batchBar := progressbar.NewOptions(len(files),
			progressbar.OptionSetDescription(fmt.Sprintf("Batch %d/%d", batchIndex+1, totalBatches)),
			progressbar.OptionSetWidth(40),
			progressbar.OptionShowCount(),
			progressbar.OptionShowIts(),
			progressbar.OptionSetTheme(progressbar.Theme{
				Saucer:        "-",
				SaucerHead:    ">",
				SaucerPadding: " ",
				BarStart:      "[",
				BarEnd:        "]",
			}),
		)

		// Process files in current batch with concurrency control
		var wg sync.WaitGroup
		semaphore := make(chan struct{}, r.config.Concurrency)
		batchErrors := make(chan error, len(files))
		
		// Create a context for this batch with timeout
		batchCtx, batchCancel := context.WithTimeout(ctx, 10*time.Minute)
		defer batchCancel()

		for _, file := range files {
			select {
			case <-ctx.Done():
				logWarning("Context cancelled during batch processing")
				batchCancel()
				// Wait for existing goroutines to finish
				wg.Wait()
				return ctx.Err()
			case <-batchCtx.Done():
				logError("Batch timeout after 10 minutes, cancelling remaining files")
				// Wait for existing goroutines to finish
				wg.Wait()
				return fmt.Errorf("batch processing timeout")
			default:
			}

			wg.Add(1)
			go func(f RTFFile) {
				defer wg.Done()
				defer func() {
					// Recover from any panics to prevent hanging
					if r := recover(); r != nil {
						logError("Panic in goroutine processing file %s: %v", f.Filename, r)
						select {
						case batchErrors <- fmt.Errorf("panic processing file %s: %v", f.Filename, r):
						default:
						}
					}
					batchBar.Add(1)    // Update batch progress
					overallBar.Add(1)  // Update overall progress
				}()
				
				// Acquire semaphore with timeout to prevent deadlock
				select {
				case semaphore <- struct{}{}:
					defer func() { <-semaphore }() // Release semaphore
				case <-batchCtx.Done():
					logWarning("Timeout acquiring semaphore for file %s", f.Filename)
					return
				}

				if err := r.ProcessFile(batchCtx, f); err != nil {
					logError("Error processing file %s (ID: %s): %v", f.Filename, f.ID, err)
					select {
					case batchErrors <- err:
					default:
						// Channel is full, log the error but don't block
						logWarning("Error channel full, dropping error for file %s", f.Filename)
					}
				}
			}(file)
		}

		// Wait for current batch to complete with timeout
		done := make(chan struct{})
		go func() {
			wg.Wait()
			close(done)
		}()
		
		select {
		case <-done:
			// All goroutines completed normally
		case <-time.After(15 * time.Minute):
			logError("Batch processing timeout after 15 minutes, forcing continuation")
			batchCancel()
			// Give goroutines a bit more time to clean up
			select {
			case <-done:
			case <-time.After(30 * time.Second):
				logError("Goroutines did not finish cleanup in time")
			}
		case <-ctx.Done():
			logWarning("Context cancelled while waiting for batch completion")
			batchCancel()
			return ctx.Err()
		}
		
		close(batchErrors)

		// Count errors in this batch
		errorCount := 0
		for range batchErrors {
			errorCount++
		}

		batchBar.Finish()
		fmt.Println() // Add newline after batch progress bar

		processedFiles += len(files)
		successCount := len(files) - errorCount

		if errorCount > 0 {
			logWarning("Batch %d/%d completed: %d/%d files successful, %d errors", 
				batchIndex+1, totalBatches, successCount, len(files), errorCount)
		} else {
			logSuccess("Batch %d/%d completed: %d/%d files successful, %d errors", 
				batchIndex+1, totalBatches, successCount, len(files), errorCount)
		}

		// Small delay between batches to avoid overwhelming the system
		if batchIndex < totalBatches-1 {
			time.Sleep(1 * time.Second)
		}
	}

	overallBar.Finish()
	fmt.Println() // Add newline after overall progress bar

	logSuccess("All batches completed! Processed %d files total", processedFiles)
	return nil
}

// periodicHealthCheck runs periodic health checks on LibreOffice instances
func (r *RTFConverter) periodicHealthCheck(ctx context.Context) {
	ticker := time.NewTicker(2 * time.Minute)
	defer ticker.Stop()
	
	logInfo("Starting periodic health check for LibreOffice instances")
	
	for {
		select {
		case <-ctx.Done():
			logInfo("Stopping periodic health check due to context cancellation")
			return
		case <-ticker.C:
			logInfo("Performing periodic health check on LibreOffice instances")
			
			// Check each instance in the pool
			for i, instance := range r.loPool.instances {
				if instance.inUse {
					// Skip instances currently in use
					continue
				}
				
				if err := instance.HealthCheck(ctx); err != nil {
					logWarning("Instance %d failed health check during periodic check: %v", i, err)
					
					// Try to restart the instance
					logProcess("Restarting unhealthy LibreOffice instance %d", i)
					instance.Stop()
					
					if err := instance.Start(ctx); err != nil {
						logError("Failed to restart LibreOffice instance %d during health check: %v", i, err)
					} else {
						logSuccess("Successfully restarted LibreOffice instance %d during health check", i)
					}
				}
			}
		}
	}
}

// min returns the smaller of two integers
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// CheckPDFExists checks if a PDF version of the RTF file already exists in the database
func (r *RTFConverter) CheckPDFExists(ctx context.Context, rtfFilename string) (bool, error) {
	// Generate the expected PDF filename
	pdfFilename := strings.TrimSuffix(rtfFilename, filepath.Ext(rtfFilename)) + ".pdf"
	
	// Query Supabase to check if PDF file exists
	result, _, err := r.supabase.From("files").
		Select("id", "", false).
		Eq("file_name", pdfFilename).
		Execute()

	if err != nil {
		logError("Failed to check PDF existence for %s: %v", pdfFilename, err)
		return false, fmt.Errorf("failed to check PDF existence: %w", err)
	}

	var existingFiles []map[string]interface{}
	if err := json.Unmarshal(result, &existingFiles); err != nil {
		logError("Failed to unmarshal PDF check result for %s: %v", pdfFilename, err)
		return false, fmt.Errorf("failed to unmarshal PDF check result: %w", err)
	}

	exists := len(existingFiles) > 0
	if exists {
		logInfo("PDF already exists for %s, skipping conversion", rtfFilename)
	}
	
	return exists, nil
}

func main() {
	// Initialize random seed for shuffling files
	rand.Seed(time.Now().UnixNano())
	logInfo("Initialized random seed for file shuffling: %d", time.Now().UnixNano())

	// Load configuration
	configPath := "./config.json" // Relative to rtf_converter directory
	if len(os.Args) > 1 {
		configPath = os.Args[1]
	}

	converter, err := NewRTFConverter(configPath)
	if err != nil {
		logError("Failed to create RTF converter: %v", err)
		log.Fatalf("Failed to create RTF converter: %v", err)
	}

	// Create context with cancellation
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Handle graceful shutdown with signal handling
	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
		sig := <-sigChan
		logWarning("Received signal %v, initiating graceful shutdown...", sig)
		cancel()
	}()

	// Start the converter
	logInfo("🚀 Starting RTF to PDF converter...")
	if err := converter.Run(ctx); err != nil {
		if err == context.Canceled {
			logWarning("RTF converter was cancelled")
		} else {
			logError("RTF converter failed: %v", err)
			log.Fatalf("RTF converter failed: %v", err)
		}
	}
	
	logSuccess("🎉 RTF converter completed successfully!")
}
