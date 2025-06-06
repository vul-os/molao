#!/usr/bin/env python3
"""
Document Summarizer for Supabase Files using Gemini AI Flash Lite
Downloads files from CDN, extracts text, and generates summaries using Gemini AI API
Saves summaries to file_summaries table in Supabase
"""

import os
import requests
import re
import tomli
import psycopg2
import uuid
import logging
import httpx
import asyncio
import tempfile
from pathlib import Path
from striprtf.striprtf import rtf_to_text
import docx
import fitz
import time
from typing import Optional, Dict, Any, List, Tuple
from datetime import datetime
from tqdm.asyncio import tqdm
import google.generativeai as genai
import json

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class GeminiDocumentSummarizer:
    def __init__(self, model_name: str = "gemini-2.0-flash", batch_size: int = 20, max_rpm: int = 3500):
        """
        Initialize the document summarizer with Gemini 2.0 Flash-Lite
        
        Args:
            model_name: Gemini model name (default: gemini-2.0-flash)
            batch_size: Number of files to process concurrently (reduced for Flash-Lite limits)
            max_rpm: Maximum requests per minute (4,000 for Flash-Lite, using 3500 for safety)
        """
        self.model_name = model_name
        self.batch_size = batch_size
        self.max_rpm = max_rpm
        self.request_delay = 60.0 / max_rpm  # Adjusted for Flash-Lite limits
        self.last_request_time = 0
        self.config = self.load_config()
        
        # Configure Gemini AI
        self.setup_gemini()
        
        logger.info(f"Using Gemini model: {self.model_name}")
        logger.info(f"Processing files with batch size: {self.batch_size}")
        logger.info(f"Rate limit: {self.max_rpm} RPM ({self.request_delay:.3f}s delay) - Flash-Lite limits")
        
    def load_config(self) -> Dict[str, Any]:
        """Load configuration from config.toml"""
        try:
            with open("config.toml", "rb") as f:
                return tomli.load(f)
        except FileNotFoundError:
            logger.error("config.toml not found. Please create it with database and Gemini API configuration.")
            raise
        
    def setup_gemini(self):
        """Setup Gemini AI with API key"""
        try:
            # Get API key from environment variable or config
            api_key = os.getenv('GEMINI_API_KEY') or self.config.get('gemini', {}).get('api_key')
            
            if not api_key:
                raise ValueError(
                    "Gemini API key not found. Please set GEMINI_API_KEY environment variable "
                    "or add it to config.toml under [gemini] section"
                )
            
            genai.configure(api_key=api_key)
            self.model = genai.GenerativeModel(self.model_name)
            
            logger.info("Gemini AI configured successfully!")
            
        except Exception as e:
            logger.error(f"Error setting up Gemini AI: {e}")
            raise

    async def rate_limit_delay(self):
        """Implement rate limiting to respect API limits"""
        current_time = time.time()
        time_since_last_request = current_time - self.last_request_time
        
        if time_since_last_request < self.request_delay:
            delay = self.request_delay - time_since_last_request
            logger.debug(f"Rate limiting: waiting {delay:.2f} seconds")
            await asyncio.sleep(delay)
        
        self.last_request_time = time.time()

    async def download_file_from_cdn(self, cdn_url: str, file_name: str) -> bytes:
        """Download file content from CDN URL."""
        logger.info(f"Downloading file from CDN: {file_name}")
        
        async with httpx.AsyncClient(timeout=120.0) as client:
            try:
                response = await client.get('https://' + cdn_url)
                response.raise_for_status()
                
                logger.info(f"Successfully downloaded {file_name} ({len(response.content)} bytes)")
                return response.content
                
            except httpx.HTTPError as e:
                logger.error(f"HTTP error downloading {file_name} from {cdn_url}: {e}")
                raise
            except Exception as e:
                logger.error(f"Unexpected error downloading {file_name}: {e}")
                raise

    def process_file_content(self, file_content: bytes, file_name: str, mime_type: str) -> str:
        """Process file content based on mime type."""
        try:
            if mime_type == "application/rtf":
                try:
                    rtf_string = file_content.decode('utf-8', errors='ignore')
                    extracted_text = rtf_to_text(rtf_string)
                    logger.info(f"RTF file {file_name}: extracted {len(extracted_text)} chars")
                    return self.normalize_whitespace(extracted_text)
                except Exception as e:
                    logger.error(f"Failed to parse RTF for file {file_name}: {e}")
                    return ""
            elif mime_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
                # Save to temporary file for docx processing
                with tempfile.NamedTemporaryFile(suffix='.docx', delete=False) as temp_file:
                    temp_file.write(file_content)
                    temp_file.flush()
                    
                    try:
                        doc = docx.Document(temp_file.name)
                        text = self.normalize_whitespace("\n\n".join([para.text for para in doc.paragraphs]))
                        return text
                    finally:
                        os.unlink(temp_file.name)
            elif mime_type == "application/pdf":
                # Save to temporary file for PDF processing
                with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as temp_file:
                    temp_file.write(file_content)
                    temp_file.flush()
                    
                    try:
                        with fitz.open(temp_file.name) as doc:
                            text = "\n\n".join([page.get_text() for page in doc])
                            return self.normalize_whitespace(text)
                    finally:
                        os.unlink(temp_file.name)
            else:
                # Treat as text file
                text = file_content.decode('utf-8', errors='ignore')
                return self.normalize_whitespace(text)
        except Exception as e:
            logger.error(f"Failed to process file {file_name}: {e}")
            return ""

    def normalize_whitespace(self, text: str) -> str:
        """Normalize whitespace in text"""
        return re.sub(r"\s+", " ", text).strip()

    def chunk_text(self, text: str, max_chars: int = 1000000) -> list:
        """
        Split text into chunks that fit within Gemini's context limits
        
        Args:
            text: Input text to chunk
            max_chars: Maximum characters per chunk (Gemini Flash has ~1M token context)
            
        Returns:
            List of text chunks
        """
        logger.info(f"Total document characters: {len(text)}")
        
        if len(text) <= max_chars:
            logger.info("Document fits in single chunk - no splitting needed!")
            return [text]
        
        # If we need to split, do it by paragraphs
        paragraphs = text.split('\n\n')
        chunks = []
        current_chunk = ""
        
        for paragraph in paragraphs:
            test_chunk = current_chunk + "\n\n" + paragraph if current_chunk else paragraph
            
            if len(test_chunk) <= max_chars:
                current_chunk = test_chunk
            else:
                if current_chunk:
                    chunks.append(current_chunk.strip())
                current_chunk = paragraph
        
        if current_chunk:
            chunks.append(current_chunk.strip())
        
        logger.info(f"Split text into {len(chunks)} chunks")
        return chunks

    async def generate_summary(self, text: str) -> str:
        """
        Generate summary using Gemini AI Flash Lite
        
        Args:
            text: Input text to summarize
            
        Returns:
            Generated summary
        """
        logger.info(f"Generating summary for text with {len(text)} characters")
        
        # Apply rate limiting
        await self.rate_limit_delay()
        
        # Create prompt for legal document summarization (adjusted to avoid safety filters)
        prompt = f"""Please provide a professional business document summary. Focus on factual information such as:
- Key parties and entities mentioned
- Important dates and deadlines
- Financial amounts and terms
- Main obligations and responsibilities
- Document type and purpose

Document content:
{text}

Professional summary:"""
        
        try:
            # Generate summary using Gemini
            response = await asyncio.to_thread(
                self.model.generate_content,
                prompt,
                generation_config=genai.types.GenerationConfig(
                    temperature=0.3,
                    top_p=0.8,
                    top_k=40,
                    max_output_tokens=2048,
                ),
                safety_settings={
                    genai.types.HarmCategory.HARM_CATEGORY_HATE_SPEECH: genai.types.HarmBlockThreshold.BLOCK_ONLY_HIGH,
                    genai.types.HarmCategory.HARM_CATEGORY_HARASSMENT: genai.types.HarmBlockThreshold.BLOCK_ONLY_HIGH,
                    genai.types.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: genai.types.HarmBlockThreshold.BLOCK_ONLY_HIGH,
                    genai.types.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: genai.types.HarmBlockThreshold.BLOCK_ONLY_HIGH,
                }
            )
            
            # Check if response was blocked
            if not response.candidates:
                logger.warning(f"⚠️ Content blocked by safety filters")
                if hasattr(response, 'prompt_feedback') and response.prompt_feedback:
                    block_reason = getattr(response.prompt_feedback, 'block_reason', 'Unknown')
                    logger.warning(f"Block reason: {block_reason}")
                
                # Return a fallback summary for blocked content
                return "⚠️ Content blocked by safety filters. Unable to generate summary due to content policy restrictions."
            
            # Check if the first candidate was blocked
            candidate = response.candidates[0]
            if hasattr(candidate, 'finish_reason') and candidate.finish_reason:
                finish_reason = candidate.finish_reason.name if hasattr(candidate.finish_reason, 'name') else str(candidate.finish_reason)
                if 'SAFETY' in finish_reason or 'BLOCKED' in finish_reason:
                    logger.warning(f"⚠️ Response blocked due to safety: {finish_reason}")
                    return "⚠️ Content blocked by safety filters. Unable to generate summary due to content policy restrictions."
            
            # Try to get the text content
            try:
                summary = response.text.strip()
                if not summary:
                    logger.warning("⚠️ Empty response from Gemini")
                    return "⚠️ Empty response received from Gemini API."
                    
                logger.info(f"Generated summary with {len(summary)} characters")
                return summary
                
            except ValueError as ve:
                logger.warning(f"⚠️ Could not access response text: {ve}")
                return "⚠️ Response text could not be accessed due to content restrictions."
            
        except Exception as e:
            logger.error(f"Error generating summary with Gemini: {e}")
            # If rate limited, wait shorter time and retry once
            if "quota" in str(e).lower() or "rate" in str(e).lower():
                logger.info("Rate limit detected, waiting 10 seconds before retry...")
                await asyncio.sleep(10)  # Reduced from 60 to 10 seconds
                try:
                    response = await asyncio.to_thread(
                        self.model.generate_content,
                        prompt,
                        generation_config=genai.types.GenerationConfig(
                            temperature=0.3,
                            top_p=0.8,
                            top_k=40,
                            max_output_tokens=2048,
                        ),
                        safety_settings={
                            genai.types.HarmCategory.HARM_CATEGORY_HATE_SPEECH: genai.types.HarmBlockThreshold.BLOCK_ONLY_HIGH,
                            genai.types.HarmCategory.HARM_CATEGORY_HARASSMENT: genai.types.HarmBlockThreshold.BLOCK_ONLY_HIGH,
                            genai.types.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: genai.types.HarmBlockThreshold.BLOCK_ONLY_HIGH,
                            genai.types.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: genai.types.HarmBlockThreshold.BLOCK_ONLY_HIGH,
                        }
                    )
                    
                    # Same safety checks for retry
                    if not response.candidates:
                        return "⚠️ Content blocked by safety filters after retry."
                    
                    try:
                        return response.text.strip()
                    except ValueError:
                        return "⚠️ Response text could not be accessed after retry."
                        
                except Exception as retry_error:
                    logger.error(f"Retry also failed: {retry_error}")
                    return f"❌ Failed to generate summary after retry: {str(retry_error)[:200]}"
            
            # For other errors, return a descriptive error message
            return f"❌ Error generating summary: {str(e)[:200]}"

    async def summarize_long_document(self, text: str) -> str:
        """
        Summarize long documents by chunking and combining summaries
        
        Args:
            text: Full document text
            
        Returns:
            Combined summary
        """
        chunks = self.chunk_text(text)
        
        if len(chunks) == 1:
            return await self.generate_summary(chunks[0])
        
        logger.info(f"Processing {len(chunks)} chunks...")
        chunk_summaries = []
        
        # Process chunks with rate limiting
        for i, chunk in enumerate(chunks, 1):
            try:
                logger.info(f"Processing chunk {i}/{len(chunks)}")
                summary = await self.generate_summary(chunk)
                chunk_summaries.append(summary)
                    
            except Exception as e:
                logger.error(f"Error summarizing chunk {i}: {e}")
                chunk_summaries.append(f"[Error summarizing chunk {i}]")
        
        # Combine chunk summaries
        combined_text = "\n\n".join(chunk_summaries)
        
        # Generate final summary from chunk summaries
        logger.info("Generating final combined summary...")
        final_summary = await self.generate_summary(combined_text)
        
        return final_summary

    async def process_file(self, file_id: uuid.UUID, file_name: str, mime_type: str, cdn_path: str) -> str:
        """
        Complete pipeline: download file, extract text, and generate summary
        
        Args:
            file_id: File ID from database
            file_name: Name of the file
            mime_type: MIME type of the file
            cdn_path: CDN path to download file
            
        Returns:
            Generated summary
        """
        try:
            # Download file
            file_content = await self.download_file_from_cdn(cdn_path, file_name)
            
            # Extract text
            text = self.process_file_content(file_content, file_name, mime_type)
            
            if not text.strip():
                raise ValueError("No text content extracted from file")
            
            # Generate summary
            summary = await self.summarize_long_document(text)
            
            return summary
            
        except Exception as e:
            logger.error(f"Error processing file {file_id}: {e}")
            raise

    def get_database_connection(self):
        """Get database connection using config"""
        return psycopg2.connect(self.config['database']['connection_string'])

    def save_summary_to_database(self, file_id: uuid.UUID, summary: str):
        """Save summary to file_summaries table"""
        model_name = f"gemini-{self.model_name}"
        
        logger.info(f"💾 Attempting to save summary for file {file_id} with model {model_name}")
        logger.debug(f"Summary length: {len(summary)} characters")
        
        try:
            conn = self.get_database_connection()
            try:
                with conn.cursor() as cur:
                    # First, let's check if the file exists
                    cur.execute("SELECT id, file_name FROM files WHERE id = %s", (str(file_id),))
                    file_record = cur.fetchone()
                    if not file_record:
                        logger.error(f"❌ File {file_id} not found in files table!")
                        return
                    
                    logger.info(f"📄 File found: {file_record[1]} (ID: {file_record[0]})")
                    
                    # Check if summary already exists
                    cur.execute("""
                        SELECT id FROM file_summaries 
                        WHERE file_id = %s AND model = %s
                    """, (str(file_id), model_name))
                    existing = cur.fetchone()
                    
                    if existing:
                        logger.info(f"🔄 Updating existing summary (ID: {existing[0]})")
                    else:
                        logger.info(f"➕ Creating new summary entry")
                    
                    # Insert or update summary with Gemini model name
                    cur.execute("""
                        INSERT INTO file_summaries (file_id, model, content, created_at, updated_at)
                        VALUES (%s, %s, %s, NOW(), NOW())
                        ON CONFLICT (file_id, model) 
                        DO UPDATE SET 
                            content = EXCLUDED.content,
                            updated_at = NOW()
                        RETURNING id
                    """, (str(file_id), model_name, summary))
                    
                    result = cur.fetchone()
                    if result:
                        summary_id = result[0]
                        logger.info(f"✅ Successfully saved summary (ID: {summary_id}) for file {file_id}")
                    else:
                        logger.error(f"❌ No result returned from insert/update for file {file_id}")
                    
                    conn.commit()
                    logger.info(f"💾 Database transaction committed for file {file_id}")
                    
            except psycopg2.Error as db_error:
                logger.error(f"❌ Database error for file {file_id}: {db_error}")
                conn.rollback()
                raise
            finally:
                conn.close()
                
        except Exception as e:
            logger.error(f"❌ Error saving summary to database for file {file_id}: {e}")
            logger.error(f"   Model: {model_name}")
            logger.error(f"   Summary length: {len(summary)}")
            raise

    def get_files_to_process(self):
        """Get files that need summaries generated"""
        conn = self.get_database_connection()
        try:
            with conn.cursor() as cur:
                # Get files that don't have summaries for this Gemini model
                model_name = f"gemini-{self.model_name}"
                cur.execute("""
                    SELECT f.id, f.file_name, f.mime_type, f.cdn_path 
                    FROM files f 
                    LEFT JOIN file_summaries fs ON f.id = fs.file_id AND fs.model = %s
                    WHERE f.cdn_path IS NOT NULL 
                    AND fs.id IS NULL
                    ORDER BY f.created_at DESC
                """, (model_name,))
                
                files = cur.fetchall()
                return files
                
        finally:
            conn.close()

    async def process_files_batch(self, files_batch: List[Tuple]) -> List[Tuple[str, str]]:
        """Process a batch of files with concurrent downloads AND concurrent API processing"""
        results = []
        
        # Download all files in the batch concurrently
        download_tasks = []
        for file_info in files_batch:
            file_id, file_name, mime_type, cdn_path = file_info
            download_tasks.append(self.download_file_from_cdn(cdn_path, file_name))
        
        logger.info(f"Downloading {len(files_batch)} files concurrently...")
        downloaded_files = await asyncio.gather(*download_tasks, return_exceptions=True)
        
        # Process ALL files concurrently (both text extraction AND API calls)
        logger.info(f"Processing {len(files_batch)} files concurrently with Gemini API...")
        
        async def process_single_file(file_info, file_content):
            file_id, file_name, mime_type, cdn_path = file_info
            
            if isinstance(file_content, Exception):
                logger.error(f"Failed to download {file_name}: {file_content}")
                return (file_id, None, str(file_content))
            
            try:
                # Extract text
                text = self.process_file_content(file_content, file_name, mime_type)
                
                if not text.strip():
                    raise ValueError("No text content extracted from file")
                
                # Generate summary with rate limiting (now concurrent!)
                summary = await self.summarize_long_document(text)
                
                logger.info(f"Successfully processed {file_name}")
                return (file_id, summary, None)  # success
                
            except Exception as e:
                logger.error(f"Error processing {file_name}: {e}")
                return (file_id, None, str(e))  # error
        
        # Process all files concurrently
        processing_tasks = []
        for file_info, file_content in zip(files_batch, downloaded_files):
            processing_tasks.append(process_single_file(file_info, file_content))
        
        results = await asyncio.gather(*processing_tasks, return_exceptions=True)
        
        # Handle any exceptions from the gather
        final_results = []
        for result in results:
            if isinstance(result, Exception):
                logger.error(f"Processing task failed: {result}")
                final_results.append((None, None, str(result)))
            else:
                final_results.append(result)
        
        return final_results

    async def process_all_files(self):
        """Process all files in the database that don't have summaries with batch processing and progress tracking"""
        logger.info("Starting batch processing of all files with Gemini AI...")
        
        # Get files to process
        files_to_process = self.get_files_to_process()
        total_files = len(files_to_process)
        logger.info(f"Found {total_files} files to process")
        
        if not files_to_process:
            logger.info("No files need processing")
            return
        
        processed_count = 0
        error_count = 0
        start_time = time.time()
        
        # Create batches
        batches = [files_to_process[i:i + self.batch_size] 
                  for i in range(0, len(files_to_process), self.batch_size)]
        
        logger.info(f"Processing {len(batches)} batches of {self.batch_size} files each")
        
        # Process batches with progress bar
        with tqdm(total=total_files, desc="Processing files", unit="files") as pbar:
            for batch_idx, batch in enumerate(batches):
                try:
                    logger.info(f"Processing batch {batch_idx + 1}/{len(batches)} ({len(batch)} files)")
                    batch_start_time = time.time()
                    
                    # Process batch with rate limiting
                    results = await self.process_files_batch(batch)
                    
                    # Save results to database
                    batch_processed = 0
                    batch_errors = 0
                    
                    logger.info(f"📊 Processing {len(results)} results from batch {batch_idx + 1}")
                    
                    for i, result in enumerate(results):
                        if isinstance(result, Exception):
                            error_count += 1
                            batch_errors += 1
                            logger.error(f"❌ Result {i+1} is an exception: {result}")
                            continue
                            
                        file_id, summary, error = result
                        logger.info(f"📝 Processing result {i+1}: file_id={file_id}, has_summary={summary is not None}, error={error}")
                        
                        if error:
                            error_count += 1
                            batch_errors += 1
                            logger.error(f"❌ Failed to process file {file_id}: {error}")
                        else:
                            if summary is None:
                                logger.error(f"❌ File {file_id} processed but summary is None!")
                                error_count += 1
                                batch_errors += 1
                                continue
                            
                            # Check if this is a blocked content summary
                            is_blocked = "blocked by safety filters" in summary.lower() or summary.startswith("⚠️")
                            is_error = summary.startswith("❌")
                            
                            if is_error:
                                logger.warning(f"⚠️ File {file_id} had processing error, saving error summary: {summary[:100]}...")
                            elif is_blocked:
                                logger.warning(f"⚠️ File {file_id} content was blocked, saving blocked summary")
                            
                            try:
                                logger.info(f"💾 Saving summary for file {file_id} (length: {len(summary)} chars)")
                                self.save_summary_to_database(file_id, summary)
                                processed_count += 1
                                batch_processed += 1
                                
                                if is_blocked:
                                    logger.info(f"⚠️ Saved blocked content summary for file {file_id}")
                                elif is_error:
                                    logger.info(f"⚠️ Saved error summary for file {file_id}")
                                else:
                                    logger.info(f"✅ Successfully saved summary for file {file_id}")
                                    
                            except Exception as e:
                                error_count += 1
                                batch_errors += 1
                                logger.error(f"❌ Failed to save summary for {file_id}: {e}")
                                logger.exception("Full exception details:")
                    
                    logger.info(f"📈 Batch {batch_idx + 1} summary: {batch_processed} saved, {batch_errors} errors")
                    
                    # Update progress bar
                    pbar.update(len(batch))
                    
                    # Calculate and display statistics
                    batch_time = time.time() - batch_start_time
                    elapsed_time = time.time() - start_time
                    avg_time_per_file = elapsed_time / max(processed_count + error_count, 1)
                    remaining_files = total_files - (processed_count + error_count)
                    estimated_remaining_time = remaining_files * avg_time_per_file
                    
                    # Update progress bar description with ETA
                    eta_minutes = estimated_remaining_time / 60
                    pbar.set_description(f"Processing files (ETA: {eta_minutes:.1f}min)")
                    
                    logger.info(f"Batch {batch_idx + 1} completed in {batch_time:.1f}s: "
                              f"{batch_processed} processed, {batch_errors} errors")
                    logger.info(f"Overall progress: {processed_count}/{total_files} processed, "
                              f"ETA: {eta_minutes:.1f} minutes")
                    
                    # Minimal delay between batches for very high throughput
                    if batch_idx < len(batches) - 1:  # Don't delay after the last batch
                        await asyncio.sleep(0.1)  # Very small delay, just to prevent overwhelming
                        
                except Exception as e:
                    logger.error(f"Error processing batch {batch_idx + 1}: {e}")
                    error_count += len(batch)
                    pbar.update(len(batch))
        
        total_time = time.time() - start_time
        logger.info(f"Batch processing completed in {total_time/60:.1f} minutes")
        logger.info(f"Results: {processed_count} processed, {error_count} errors")
        logger.info(f"Average time per file: {total_time/max(total_files, 1):.2f} seconds")

# Main execution
async def main():
    """Main function to process all files with high-throughput Gemini 2.0 Flash"""
    
    # Initialize summarizer for high-throughput Gemini 2.0 Flash processing
    summarizer = GeminiDocumentSummarizer(
        model_name="gemini-2.0-flash",  # Using Gemini 2.0 Flash-Lite (4K RPM)
        batch_size=10,  # Conservative batch size for Flash-Lite limits
        max_rpm=2000  # 3500 RPM for safety margin (4K max available)
    )
    
    try:
        # Process all files
        logger.info("=" * 70)
        logger.info("OPTIMIZED PROCESSING WITH GEMINI 2.0 FLASH-LITE")
        logger.info("Files will be processed using Gemini 2.0 Flash-Lite API")
        logger.info("Rate limited to 4,000 RPM with concurrent processing")
        logger.info("Batch size: 20 files | Rate: 3500 RPM | Concurrent API calls")
        logger.info("=" * 70)
        
        await summarizer.process_all_files()
        
        logger.info("=" * 70)
        logger.info("HIGH-THROUGHPUT PROCESSING COMPLETED")
        logger.info("=" * 70)
        
    except Exception as e:
        logger.error(f"Error: {e}")
        raise e

if __name__ == "__main__":
    asyncio.run(main()) 