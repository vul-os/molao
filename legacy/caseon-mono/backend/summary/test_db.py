#!/usr/bin/env python3
"""
Test script to verify database connection and schema
"""

import tomli
import psycopg2
import uuid

def load_config():
    """Load configuration from config.toml"""
    with open("config.toml", "rb") as f:
        return tomli.load(f)

def test_database():
    """Test database connection and schema"""
    config = load_config()
    
    try:
        conn = psycopg2.connect(config['database']['connection_string'])
        print("✅ Database connection successful")
        
        with conn.cursor() as cur:
            # Test files table
            cur.execute("SELECT COUNT(*) FROM files")
            file_count = cur.fetchone()[0]
            print(f"📄 Files table: {file_count} records")
            
            # Test file_summaries table structure
            cur.execute("""
                SELECT column_name, data_type, is_nullable 
                FROM information_schema.columns 
                WHERE table_name = 'file_summaries'
                ORDER BY ordinal_position
            """)
            columns = cur.fetchall()
            print("\n📋 file_summaries table schema:")
            for col in columns:
                print(f"  {col[0]}: {col[1]} (nullable: {col[2]})")
            
            # Test file_summaries table
            cur.execute("SELECT COUNT(*) FROM file_summaries")
            summary_count = cur.fetchone()[0]
            print(f"\n📝 file_summaries table: {summary_count} records")
            
            # Check for any existing Gemini summaries
            cur.execute("SELECT DISTINCT model FROM file_summaries WHERE model LIKE 'gemini%'")
            gemini_models = cur.fetchall()
            print(f"\n🤖 Existing Gemini models: {[m[0] for m in gemini_models]}")
            
            # Test a sample file with CDN path
            cur.execute("""
                SELECT id, file_name, mime_type, cdn_path 
                FROM files 
                WHERE cdn_path IS NOT NULL 
                LIMIT 5
            """)
            sample_files = cur.fetchall()
            print(f"\n📂 Sample files with CDN paths:")
            for file in sample_files:
                print(f"  {file[0]}: {file[1]} ({file[2]})")
            
            # Test if we can insert a dummy summary
            if sample_files:
                test_file_id = sample_files[0][0]
                test_model = "test-gemini-2.0-flash"
                test_content = "This is a test summary"
                
                try:
                    cur.execute("""
                        INSERT INTO file_summaries (file_id, model, content, created_at, updated_at)
                        VALUES (%s, %s, %s, NOW(), NOW())
                        ON CONFLICT (file_id, model) 
                        DO UPDATE SET 
                            content = EXCLUDED.content,
                            updated_at = NOW()
                        RETURNING id
                    """, (str(test_file_id), test_model, test_content))
                    
                    result = cur.fetchone()
                    if result:
                        print(f"\n✅ Test insert successful: summary ID {result[0]}")
                        
                        # Clean up test data
                        cur.execute("DELETE FROM file_summaries WHERE id = %s", (result[0],))
                        print("🧹 Test data cleaned up")
                    else:
                        print("\n❌ Test insert failed: no result returned")
                    
                    conn.commit()
                    
                except Exception as e:
                    print(f"\n❌ Test insert failed: {e}")
                    conn.rollback()
        
        conn.close()
        
    except Exception as e:
        print(f"❌ Database test failed: {e}")

if __name__ == "__main__":
    test_database() 