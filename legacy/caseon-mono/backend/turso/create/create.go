package main

import (
	"database/sql"
	"fmt"
	"log"

	"github.com/BurntSushi/toml"
	_ "github.com/tursodatabase/libsql-client-go/libsql"
)

type CreateConfig struct {
	Turso struct {
		URL       string `toml:"url"`
		AuthToken string `toml:"auth_token"`
	} `toml:"turso"`
}

func main() {
	// Load configuration
	var config CreateConfig
	if _, err := toml.DecodeFile("../config.toml", &config); err != nil {
		log.Fatal("Failed to load config:", err)
	}

	// Connect to Turso
	tursoConn := fmt.Sprintf("%s?authToken=%s", config.Turso.URL, config.Turso.AuthToken)
	db, err := sql.Open("libsql", tursoConn)
	if err != nil {
		log.Fatal("Failed to connect to Turso:", err)
	}
	defer db.Close()

	// Test connection
	if err := db.Ping(); err != nil {
		log.Fatal("Turso connection test failed:", err)
	}

	log.Println("✅ Connected to Turso successfully")

	// Create the schema
	if err := createSchema(db); err != nil {
		log.Fatal("Failed to create schema:", err)
	}

	log.Println("🎉 Turso tables created successfully!")
}

func createSchema(db *sql.DB) error {
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

	log.Println("📋 Creating tables and indexes...")
	_, err := db.Exec(schema)
	if err != nil {
		return fmt.Errorf("failed to execute schema: %w", err)
	}

	log.Println("✅ Tables created successfully")
	return nil
}
