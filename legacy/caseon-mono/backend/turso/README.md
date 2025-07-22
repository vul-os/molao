# Supabase to Turso Migration Script

This script migrates data from Supabase (PostgreSQL) to Turso (SQLite), converting the separate `files` and `file_summaries` tables into a single `files` table with a JSON `summary` field.

## Setup

1. **Configure your databases**: Edit `config.toml` with your actual database credentials:

```toml
[supabase]
host = "your-project-ref.supabase.co"
port = 5432
database = "postgres" 
user = "postgres"
password = "your-supabase-password"
sslmode = "require"

[turso]
url = "libsql://your-database-name.turso.io"
auth_token = "your-turso-auth-token"
```

2. **Install dependencies**:
```bash
cd backend/turso
go mod tidy
```

## Usage

Run the migration script:

```bash
go run migrate.go
```

## What it does

1. **Reads from Supabase**: Fetches all files and their associated summaries
2. **Maintains file IDs**: Uses the exact same UUIDs for files in Turso
3. **Converts summaries**: Transforms the separate `file_summaries` table into a JSON field with structure:
   ```json
   [
     {
       "model": "gpt-4",
       "content": "Summary content here...",
       "created_at": "2024-01-01T12:00:00Z"
     }
   ]
   ```
4. **Creates schema**: Automatically creates the Turso table structure
5. **Migrates data**: Inserts all files with their JSON summaries

## Output

The script provides detailed logging showing:
- Connection status to both databases
- Number of files found
- Number of summaries per file
- Migration progress for each file

## Schema Conversion

**Supabase (PostgreSQL)** → **Turso (SQLite)**:
- `UUID` → `TEXT` 
- `VARCHAR` → `TEXT`
- `TIMESTAMP WITH TIME ZONE` → `DATETIME`
- `BIGINT` → `INTEGER`
- Separate `file_summaries` table → JSON `summary` field 