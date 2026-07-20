-- Create the main files table for Turso (SQLite)
CREATE TABLE files (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_title TEXT,
    cdn_path TEXT NOT NULL,
    source_url TEXT NOT NULL,
    summary JSON,  -- JSON field for summaries
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    file_size INTEGER,  -- Size in bytes
    mime_type TEXT
);

-- Create unique constraint on filename
CREATE UNIQUE INDEX unique_filename ON files(file_name);

-- Indexes for better performance
CREATE INDEX idx_files_created_at ON files(created_at);
CREATE INDEX idx_files_cdn_path ON files(cdn_path);

-- Trigger to automatically update the updated_at column
CREATE TRIGGER update_files_updated_at
    AFTER UPDATE ON files
    FOR EACH ROW
    BEGIN
        UPDATE files SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END; 