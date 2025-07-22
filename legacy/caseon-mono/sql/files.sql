-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create the main files table
CREATE TABLE files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(50) NOT NULL,
    file_title TEXT NULL,
    cdn_path VARCHAR(500) NOT NULL,
    source_url TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    file_size BIGINT,  -- Size in bytes
    mime_type VARCHAR(100)
);


ALTER TABLE files ADD CONSTRAINT unique_filename UNIQUE (file_name);

-- -- Create the sources table for original URLs
-- CREATE TABLE sources (
--     id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
--     file_id UUID REFERENCES files(id) ON DELETE CASCADE,
--     source_url TEXT NOT NULL,
--     retrieved_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
--     status VARCHAR(50), -- e.g., 'active', 'dead_link', 'archived'
--     CONSTRAINT unique_file_source UNIQUE (file_id, source_url)
-- );

-- Indexes for better performance
CREATE INDEX idx_files_created_at ON files(created_at);
CREATE INDEX idx_files_cdn_path ON files(cdn_path);
-- CREATE INDEX idx_sources_file_id ON sources(file_id);

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update the updated_at column
CREATE TRIGGER update_files_updated_at
    BEFORE UPDATE ON files
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();



CREATE TABLE file_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    model TEXT NOT NULL,
    content TEXT NOT NULL,
    CONSTRAINT unique_file_model UNIQUE (file_id, model)
);