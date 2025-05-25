# Qdrant Vector Storage Integration

This document explains the changes made to integrate Qdrant vector database for storing file embeddings while keeping Supabase/PostgreSQL for file management.

## Architecture Overview

- **Supabase/PostgreSQL**: Used for file management, metadata, and CDN path storage
- **Qdrant**: Used for vector storage and similarity search
- **Hybrid Approach**: Best of both worlds - relational data in PostgreSQL, vectors in Qdrant

## Changes Made

### 1. Configuration Updates
- Added Qdrant configuration section to `config.toml`
- Kept existing Supabase/PostgreSQL configuration for file queries
- Includes URL, API key, and collection name settings

### 2. Dependencies
- Added `qdrant-client>=1.7.0` to `requirements.txt`
- Kept `psycopg2-binary` for Supabase connectivity

### 3. Core Functions Modified
- `get_qdrant_client()`: Initializes Qdrant client and ensures collection exists
- `save_to_qdrant()`: Replaces `save_to_database()`, stores vectors in Qdrant with rich metadata including file_name
- `main()`: Uses Supabase for file listing and Qdrant for vector storage

## Configuration

Your `config.toml` file should have both sections:

```toml
[database]
connection_string = "postgresql://postgres.xxx:password@aws-0-eu-central-1.pooler.supabase.com:6543/postgres"

[qdrant]
url = "http://localhost:6333"  # Your Qdrant instance URL
api_key = "your-qdrant-api-key-here"  # Set to actual API key or remove for local instance
collection_name = "file_embeddings"  # Collection name for storing vectors
```

## Data Flow

1. **File Discovery**: Query Supabase `files` table for files with `cdn_path`
2. **Processed Check**: Check Qdrant for already processed file IDs
3. **Processing**: Download from CDN, extract text, generate embeddings
4. **Storage**: Store vectors and metadata in Qdrant (not PostgreSQL)

## Vector Storage Schema

Each vector point in Qdrant contains:

### Vector
- 1024-dimensional embedding from BAAI/bge-large-en-v1.5 model
- Cosine distance metric for similarity search

### Payload (Metadata)
```json
{
    "file_id": "uuid-string",
    "file_name": "document.pdf",
    "model": "BAAI/bge-large-en-v1.5",
    "chunk_index": 0,
    "chunk_start": 0,
    "chunk_end": 512,
    "tokens": 512,
    "chunk_text": "The actual text content...",
    "created_at": "2024-01-01T12:00:00"
}
```

## Usage

### Standard Usage (Recommended)
Use the main `main.py` file which:
- Gets file list from Supabase
- Checks processed files in Qdrant  
- Stores new vectors in Qdrant

```bash
python main.py
```

### Alternative: Separate Example
The `example_with_postgres.py` shows the same functionality in a separate file for reference.

## Installation

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Set up Qdrant:
   - Local: `docker run -p 6333:6333 qdrant/qdrant`
   - Cloud: Use Qdrant Cloud service

3. Update configuration in `config.toml` with your Qdrant details

4. Run the embedding process:
```bash
python main.py
```

## Benefits of This Hybrid Approach

1. **File Management**: Keep using Supabase for file metadata, user management, etc.
2. **Vector Performance**: Qdrant optimized for vector operations and similarity search
3. **Rich Metadata**: Store file names and other metadata alongside vectors
4. **Scalability**: Each system handles what it does best
5. **Migration Friendly**: Easy to migrate existing file data

## Querying Vectors

Example of how to search for similar content:

```python
from qdrant_client import QdrantClient

client = QdrantClient(url="http://localhost:6333")

# Search for similar vectors
results = client.search(
    collection_name="file_embeddings",
    query_vector=your_query_vector,
    limit=10,
    query_filter={
        "must": [
            {"key": "file_name", "match": {"value": "specific_file.pdf"}}
        ]
    }
)

# Access results
for result in results:
    print(f"File: {result.payload['file_name']}")
    print(f"Score: {result.score}")
    print(f"Text: {result.payload['chunk_text'][:100]}...")
```

## Migration Notes

- The original PostgreSQL `file_vectors` table is no longer used for vector storage
- File metadata is now stored directly with vectors in Qdrant
- Supabase `files` table continues to be used for file management
- No changes needed to existing file upload/management workflows 