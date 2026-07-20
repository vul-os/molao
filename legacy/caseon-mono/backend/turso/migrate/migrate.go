package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/BurntSushi/toml"
	"github.com/supabase-community/supabase-go"
	_ "github.com/tursodatabase/libsql-client-go/libsql"
	"github.com/vbauerster/mpb/v8"
	"github.com/vbauerster/mpb/v8/decor"
)

type MigrateConfig struct {
	Supabase struct {
		URL    string `toml:"url"`
		APIKey string `toml:"api_key"`
	} `toml:"supabase"`
	Turso struct {
		URL       string `toml:"url"`
		AuthToken string `toml:"auth_token"`
	} `toml:"turso"`
	Migration struct {
		BatchSize          int `toml:"batch_size"`
		Concurrency        int `toml:"concurrency"`
		SummaryConcurrency int `toml:"summary_concurrency"`
	} `toml:"migration"`
}

type FileRecord struct {
	ID        string          `json:"id"`
	FileName  string          `json:"file_name"`
	FileType  string          `json:"file_type"`
	FileTitle *string         `json:"file_title"`
	CDNPath   string          `json:"cdn_path"`
	SourceURL string          `json:"source_url"`
	CreatedAt time.Time       `json:"created_at"`
	UpdatedAt time.Time       `json:"updated_at"`
	FileSize  *int64          `json:"file_size"`
	MimeType  *string         `json:"mime_type"`
	Summaries []SummaryRecord `json:"summaries"`
}

type SummaryRecord struct {
	Model     string    `json:"model"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"created_at"`
}

type BatchJob struct {
	Offset    int
	BatchSize int
}

func main() {
	migrateMain()
}

func migrateMain() {
	// Load configuration
	var config MigrateConfig
	if _, err := toml.DecodeFile("./config.toml", &config); err != nil {
		log.Fatal("Failed to load config:", err)
	}

	// Set defaults if not configured
	if config.Migration.BatchSize <= 0 {
		config.Migration.BatchSize = 100
	}
	if config.Migration.Concurrency <= 0 {
		config.Migration.Concurrency = 10
	}
	if config.Migration.SummaryConcurrency <= 0 {
		config.Migration.SummaryConcurrency = 20
	}

	log.Printf("🔧 Migration configuration loaded - Batch size: %d, Concurrency: %d, Summary concurrency: %d",
		config.Migration.BatchSize, config.Migration.Concurrency, config.Migration.SummaryConcurrency)

	// Initialize Supabase client
	supabaseClient, err := supabase.NewClient(config.Supabase.URL, config.Supabase.APIKey, &supabase.ClientOptions{})
	if err != nil {
		log.Fatal("Failed to initialize Supabase client:", err)
	}

	// Connect to Turso
	tursoConn := fmt.Sprintf("%s?authToken=%s", config.Turso.URL, config.Turso.AuthToken)
	tursoDB, err := sql.Open("libsql", tursoConn)
	if err != nil {
		log.Fatal("Failed to connect to Turso:", err)
	}
	defer tursoDB.Close()

	// Test Turso connection
	if err := tursoDB.Ping(); err != nil {
		log.Fatal("Turso connection test failed:", err)
	}

	log.Println("✅ Connected to both databases successfully")

	// Create the files table in Turso (run the schema first)
	if err := createTursoSchemaForMigration(tursoDB); err != nil {
		log.Fatal("Failed to create Turso schema:", err)
	}

	// Migrate data
	ctx := context.Background()
	if err := migrateDataFromSupabaseParallel(ctx, supabaseClient, tursoDB, &config.Migration); err != nil {
		log.Fatal("Migration failed:", err)
	}

	log.Println("🎉 Migration completed successfully!")
}

func createTursoSchemaForMigration(db *sql.DB) error {
	schema := `
	-- Create the main files table for Turso (SQLite)
	CREATE TABLE IF NOT EXISTS files (
		id TEXT PRIMARY KEY,
		file_name TEXT NOT NULL,
		file_type TEXT NOT NULL,
		file_title TEXT,
		cdn_path TEXT NOT NULL,
		source_url TEXT NOT NULL,
		summary JSON,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		file_size INTEGER,
		mime_type TEXT
	);

	-- Create unique constraint on filename
	CREATE UNIQUE INDEX IF NOT EXISTS unique_filename ON files(file_name);

	-- Indexes for better performance
	CREATE INDEX IF NOT EXISTS idx_files_created_at ON files(created_at);
	CREATE INDEX IF NOT EXISTS idx_files_cdn_path ON files(cdn_path);

	-- Trigger to automatically update the updated_at column
	CREATE TRIGGER IF NOT EXISTS update_files_updated_at
		AFTER UPDATE ON files
		FOR EACH ROW
		BEGIN
			UPDATE files SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
		END;
	`

	log.Println("📋 Creating Turso schema...")
	_, err := db.Exec(schema)
	return err
}

func migrateDataFromSupabaseParallel(ctx context.Context, supabaseClient *supabase.Client, tursoDB *sql.DB, migrationConfig *struct {
	BatchSize          int `toml:"batch_size"`
	Concurrency        int `toml:"concurrency"`
	SummaryConcurrency int `toml:"summary_concurrency"`
}) error {
	// First, get total count of files for progress bar
	log.Println("📊 Counting total files in Supabase...")
	countResp, _, err := supabaseClient.From("files").
		Select("count", "exact", false).
		Execute()
	if err != nil {
		return fmt.Errorf("failed to count files from Supabase: %w", err)
	}

	var countResult []map[string]interface{}
	if err := json.Unmarshal(countResp, &countResult); err != nil {
		return fmt.Errorf("failed to parse count response: %w", err)
	}

	var totalFiles int
	if len(countResult) > 0 {
		if count, ok := countResult[0]["count"].(float64); ok {
			totalFiles = int(count)
		}
	}

	if totalFiles == 0 {
		log.Println("ℹ️ No files found in Supabase")
		return nil
	}

	log.Printf("📊 Found %d total files to migrate with %d concurrent workers", totalFiles, migrationConfig.Concurrency)

	// Initialize progress bar
	p := mpb.New(mpb.WithWidth(80))
	bar := p.AddBar(int64(totalFiles),
		mpb.PrependDecorators(
			decor.Name("🚀 Migrating files: "),
			decor.CountersNoUnit("%d/%d", decor.WCSyncWidth),
		),
		mpb.AppendDecorators(
			decor.Percentage(decor.WC{W: 5}),
			decor.Name(" | "),
			decor.EwmaSpeed(0, "%.1f files/s", 60),
			decor.Name(" | "),
			decor.OnComplete(
				decor.EwmaETA(decor.ET_STYLE_MMSS, 60), "✅ Done!",
			),
		),
	)

	// Create channels for work distribution
	jobChan := make(chan BatchJob, migrationConfig.Concurrency*2)

	// Create context for cancellation
	workCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	// Error channel to collect errors from workers
	errChan := make(chan error, migrationConfig.Concurrency)

	// WaitGroup for workers
	var wg sync.WaitGroup

	// Start worker goroutines
	for i := 0; i < migrationConfig.Concurrency; i++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			if err := batchWorker(workCtx, workerID, supabaseClient, tursoDB, jobChan, bar, migrationConfig.SummaryConcurrency); err != nil {
				log.Printf("❌ Worker %d error: %v", workerID, err)
				errChan <- err
				cancel() // Cancel all other workers
			}
		}(i)
	}

	// Generate batch jobs
	go func() {
		defer close(jobChan)
		offset := 0
		for offset < totalFiles {
			select {
			case <-workCtx.Done():
				return
			case jobChan <- BatchJob{Offset: offset, BatchSize: migrationConfig.BatchSize}:
				offset += migrationConfig.BatchSize
			}
		}
	}()

	// Wait for all workers to complete
	go func() {
		wg.Wait()
		close(errChan)
	}()

	// Check for errors
	for err := range errChan {
		if err != nil {
			cancel()
			p.Wait()
			return err
		}
	}

	// Wait for progress bar to complete
	p.Wait()

	return nil
}

func batchWorker(ctx context.Context, workerID int, supabaseClient *supabase.Client, tursoDB *sql.DB, jobChan <-chan BatchJob, bar *mpb.Bar, summaryConcurrency int) error {
	// Prepare insert statement for this worker
	insertQuery := `
		INSERT OR IGNORE INTO files (id, file_name, file_type, file_title, cdn_path, source_url, 
						  summary, created_at, updated_at, file_size, mime_type)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`

	stmt, err := tursoDB.Prepare(insertQuery)
	if err != nil {
		return fmt.Errorf("worker %d: failed to prepare insert statement: %w", workerID, err)
	}
	defer stmt.Close()

	// Prepare check statement to see if file already exists
	checkQuery := `SELECT COUNT(*) FROM files WHERE id = ? OR file_name = ?`
	checkStmt, err := tursoDB.Prepare(checkQuery)
	if err != nil {
		return fmt.Errorf("worker %d: failed to prepare check statement: %w", workerID, err)
	}
	defer checkStmt.Close()

	for job := range jobChan {
		select {
		case <-ctx.Done():
			return nil
		default:
		}

		if err := processBatch(ctx, workerID, supabaseClient, stmt, checkStmt, job, bar, summaryConcurrency); err != nil {
			return fmt.Errorf("worker %d: failed to process batch at offset %d: %w", workerID, job.Offset, err)
		}
	}

	return nil
}

func processBatch(ctx context.Context, workerID int, supabaseClient *supabase.Client, stmt *sql.Stmt, checkStmt *sql.Stmt, job BatchJob, bar *mpb.Bar, summaryConcurrency int) error {
	// Fetch batch of files from Supabase
	resp, _, err := supabaseClient.From("files").
		Select("id, file_name, file_type, file_title, cdn_path, source_url, created_at, updated_at, file_size, mime_type", "", false).
		Range(job.Offset, job.Offset+job.BatchSize-1, "").
		Execute()
	if err != nil {
		return fmt.Errorf("failed to fetch files batch: %w", err)
	}

	var files []FileRecord
	if err := json.Unmarshal(resp, &files); err != nil {
		return fmt.Errorf("failed to parse files response: %w", err)
	}

	if len(files) == 0 {
		return nil // No more files
	}

	// Fetch summaries for all files in this batch concurrently
	if err := fetchSummariesConcurrently(ctx, supabaseClient, files, summaryConcurrency); err != nil {
		return fmt.Errorf("failed to fetch summaries: %w", err)
	}

	// Insert all files in this batch
	for _, file := range files {
		select {
		case <-ctx.Done():
			return nil
		default:
		}

		// Check if file already exists
		var existsCount int
		err := checkStmt.QueryRow(file.ID, file.FileName).Scan(&existsCount)
		if err != nil {
			log.Printf("⚠️ Worker %d: Could not check existence for file %s: %v", workerID, file.ID, err)
		} else if existsCount > 0 {
			log.Printf("ℹ️ Worker %d: File %s already exists, skipping", workerID, file.FileName)
			bar.Increment()
			continue
		}

		// Validate and prepare data
		if err := validateFileRecord(&file); err != nil {
			log.Printf("⚠️ Worker %d: Skipping invalid file %s: %v", workerID, file.ID, err)
			bar.Increment() // Still count it as processed
			continue
		}

		// Convert summaries to JSON
		var summaryJSON string
		if len(file.Summaries) > 0 {
			summaryBytes, err := json.Marshal(file.Summaries)
			if err != nil {
				log.Printf("⚠️ Worker %d: Failed to marshal summaries for file %s, inserting without summaries: %v",
					workerID, file.ID, err)
				summaryJSON = "[]" // Empty JSON array as fallback
			} else {
				summaryJSON = string(summaryBytes)
			}
		} else {
			summaryJSON = "[]" // Empty JSON array instead of NULL
		}

		// Format timestamps for SQLite
		createdAt := file.CreatedAt.Format("2006-01-02 15:04:05")
		updatedAt := file.UpdatedAt.Format("2006-01-02 15:04:05")

		// Execute insert with detailed error logging
		result, err := stmt.Exec(
			file.ID,
			file.FileName,
			file.FileType,
			file.FileTitle,
			file.CDNPath,
			file.SourceURL,
			summaryJSON,
			createdAt,
			updatedAt,
			file.FileSize,
			file.MimeType,
		)
		if err != nil {
			// Log detailed information about the failing record
			log.Printf("❌ Worker %d: Failed to insert file - ID: %s, Name: %s, Type: %s",
				workerID, file.ID, file.FileName, file.FileType)
			log.Printf("❌ Worker %d: CDN Path: %s, Source: %s",
				workerID, file.CDNPath, file.SourceURL)
			log.Printf("❌ Worker %d: Summary length: %d, File size: %v",
				workerID, len(summaryJSON), file.FileSize)
			log.Printf("❌ Worker %d: Created: %s, Updated: %s",
				workerID, createdAt, updatedAt)
			log.Printf("❌ Worker %d: SQL Error: %v", workerID, err)

			// Try to continue with other files instead of failing the entire batch
			log.Printf("⚠️ Worker %d: Skipping file %s and continuing with batch", workerID, file.FileName)
			bar.Increment()
			continue
		}

		// Check if the insert actually happened (INSERT OR IGNORE might skip)
		rowsAffected, err := result.RowsAffected()
		if err == nil && rowsAffected == 0 {
			log.Printf("ℹ️ Worker %d: File %s was skipped (already exists)", workerID, file.FileName)
		}

		// Update progress bar (thread-safe)
		bar.Increment()
	}

	return nil
}

// validateFileRecord ensures all required fields are valid
func validateFileRecord(file *FileRecord) error {
	if file.ID == "" {
		return fmt.Errorf("missing file ID")
	}
	if file.FileName == "" {
		return fmt.Errorf("missing file name")
	}
	if file.FileType == "" {
		return fmt.Errorf("missing file type")
	}
	if file.CDNPath == "" {
		return fmt.Errorf("missing CDN path")
	}
	if file.SourceURL == "" {
		return fmt.Errorf("missing source URL")
	}

	// Validate timestamps
	if file.CreatedAt.IsZero() {
		return fmt.Errorf("invalid created_at timestamp")
	}
	if file.UpdatedAt.IsZero() {
		return fmt.Errorf("invalid updated_at timestamp")
	}

	// Check for extremely long fields that might cause issues
	if len(file.FileName) > 500 {
		return fmt.Errorf("file name too long: %d characters", len(file.FileName))
	}
	if len(file.CDNPath) > 1000 {
		return fmt.Errorf("CDN path too long: %d characters", len(file.CDNPath))
	}
	if len(file.SourceURL) > 2000 {
		return fmt.Errorf("source URL too long: %d characters", len(file.SourceURL))
	}
	if file.FileTitle != nil && len(*file.FileTitle) > 1000 {
		return fmt.Errorf("file title too long: %d characters", len(*file.FileTitle))
	}

	return nil
}

func fetchSummariesConcurrently(ctx context.Context, supabaseClient *supabase.Client, files []FileRecord, concurrency int) error {
	// Create channels for work distribution
	fileChan := make(chan int, len(files))
	errChan := make(chan error, concurrency)

	// Create context for cancellation
	workCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	// Start summary fetcher goroutines
	var wg sync.WaitGroup
	for i := 0; i < concurrency && i < len(files); i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for fileIndex := range fileChan {
				select {
				case <-workCtx.Done():
					return
				default:
				}

				summaryResp, _, err := supabaseClient.From("file_summaries").
					Select("model, content", "", false).
					Eq("file_id", files[fileIndex].ID).
					Execute()
				if err != nil {
					errChan <- fmt.Errorf("failed to fetch summaries for file %s: %w", files[fileIndex].ID, err)
					cancel()
					return
				}

				var summaries []SummaryRecord
				if err := json.Unmarshal(summaryResp, &summaries); err != nil {
					errChan <- fmt.Errorf("failed to parse summaries response: %w", err)
					cancel()
					return
				}

				// Set created_at for summaries
				for j := range summaries {
					summaries[j].CreatedAt = time.Now()
				}

				files[fileIndex].Summaries = summaries
			}
		}()
	}

	// Send work to goroutines
	go func() {
		defer close(fileChan)
		for i := range files {
			select {
			case <-workCtx.Done():
				return
			case fileChan <- i:
			}
		}
	}()

	// Wait for completion or error
	go func() {
		wg.Wait()
		close(errChan)
	}()

	// Check for errors
	for err := range errChan {
		if err != nil {
			cancel()
			return err
		}
	}

	return nil
}
