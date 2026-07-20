import os
import tomli
import psycopg2
import logging
import httpx
import fitz  # PyMuPDF
import asyncio
import random  # Added for random batch selection
import time  # Added for retry delays
from pathlib import Path
from typing import List, Tuple
import re
from tqdm import tqdm
import gc  # Added for garbage collection

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration will be loaded from config.toml
# Redirect PyMuPDF warnings to logs
fitz.TOOLS.mupdf_display_errors(False)
fitz.TOOLS.mupdf_warnings(reset=True)  # Clear previous warnings

# Global semaphore to limit concurrent PDF processing
PDF_PROCESSING_SEMAPHORE = None

def load_config() -> dict:
    """Load configuration from config.toml"""
    with open("config.toml", "rb") as f:
        return tomli.load(f)

async def upload_text_to_bunnycdn(text_content: str, original_filename: str, config: dict) -> bool:
    """Upload text content to BunnyCDN."""
    bunny_config = config.get('bunnycdn', {})
    storage_zone_name = bunny_config.get('storage_zone_name')
    api_key = bunny_config.get('api_key')
    base_url = bunny_config.get('base_url')

    if not all([storage_zone_name, api_key, base_url]):
        logger.error("BunnyCDN configuration is missing or incomplete in config.toml.")
        return False

    # Create a safe filename with .rtf extension
    safe_filename = re.sub(r'[<>:"/\\|?*]', '_', original_filename)
    if safe_filename.lower().endswith('.pdf'):
        safe_filename = safe_filename[:-4]
    
    rtf_filename = f"{safe_filename}.rtf"
    upload_url = f"{base_url}/{storage_zone_name}/{rtf_filename}"
    
    headers = {
        "AccessKey": api_key,
        "Content-Type": "application/rtf"
    }
    
    async with httpx.AsyncClient(timeout=120.0) as client:
        try:
            response = await client.put(upload_url, data=text_content.encode('utf-8'), headers=headers)
            response.raise_for_status()
            logger.info(f"Successfully uploaded {rtf_filename} to BunnyCDN.")
            return True
        except httpx.HTTPError as e:
            logger.error(f"HTTP error uploading {rtf_filename}: {e.response.text if hasattr(e, 'response') else str(e)}")
            return False
        except Exception as e:
            logger.error(f"Unexpected error uploading {rtf_filename}: {e}")
            return False

async def download_pdf_from_cdn(cdn_url: str, file_name: str) -> bytes:
    """Download PDF content from CDN URL."""
    logger.info(f"Downloading PDF from CDN: {file_name}")
    
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

def _pdf_to_text_sync(pdf_content: bytes, file_name: str) -> str:
    """Convert PDF content to text using PyMuPDF (synchronous) with enhanced error handling"""
    pdf_document = None
    try:
        # Create a temporary file-like object from bytes
        pdf_document = fitz.open(stream=pdf_content, filetype="pdf")
        
        # Check for errors and try to repair if necessary
        if pdf_document.is_repaired:
            logger.warning(f"PDF {file_name} was corrupted and has been repaired.")

        # Check if PDF is encrypted or has other issues
        if pdf_document.needs_pass:
            logger.error(f"PDF {file_name} is password protected and cannot be processed.")
            return ""

        text_pages = []
        page_count = len(pdf_document)
        
        # Limit processing to reasonable number of pages to prevent memory issues
        max_pages = 500  # Limit to 500 pages
        if page_count > max_pages:
            logger.warning(f"PDF {file_name} has {page_count} pages, limiting to {max_pages}")
            page_count = max_pages
        
        for page_num in range(page_count):
            try:
                page = pdf_document.load_page(page_num)
                text = page.get_text()
                if text.strip():  # Only add non-empty pages
                    text_pages.append(f"--- Page {page_num + 1} ---\n{text}")
                
                # Clean up page object immediately
                page = None
                
                # Force garbage collection every 50 pages
                if page_num % 50 == 0:
                    gc.collect()
                    
            except Exception as e:
                logger.error(f"Error processing page {page_num + 1} of {file_name}: {e}")
                continue # Skip corrupted pages
        
        full_text = "\n\n".join(text_pages)
        logger.info(f"Extracted {len(full_text)} characters from PDF {file_name}")
        return full_text
        
    except Exception as e:
        logger.error(f"Error opening/processing PDF {file_name}: {e}")
        return ""
    finally:
        # Ensure PDF document is always closed
        if pdf_document:
            try:
                pdf_document.close()
            except Exception as e:
                logger.error(f"Error closing PDF document {file_name}: {e}")
        
        # Force garbage collection to free memory
        gc.collect()

async def pdf_to_text(pdf_content: bytes, file_name: str, max_retries: int = 2) -> str:
    """Convert PDF content to text with retry logic and enhanced error handling."""
    for attempt in range(max_retries + 1):
        try:
            # Acquire semaphore to limit concurrent PDF processing
            async with PDF_PROCESSING_SEMAPHORE:
                loop = asyncio.get_running_loop()
                # Use asyncio.wait_for to add timeout protection
                result = await asyncio.wait_for(
                    loop.run_in_executor(None, _pdf_to_text_sync, pdf_content, file_name),
                    timeout=60.0  # 60 second timeout
                )
                return result
        except asyncio.TimeoutError:
            logger.error(f"PDF processing timeout (60s) for {file_name} on attempt {attempt + 1}")
            if attempt < max_retries:
                wait_time = 2 ** attempt  # Exponential backoff
                logger.info(f"Retrying PDF {file_name} in {wait_time} seconds...")
                await asyncio.sleep(wait_time)
                gc.collect()
            else:
                logger.error(f"All {max_retries + 1} attempts failed for PDF {file_name} due to timeout")
                return ""
        except Exception as e:
            logger.error(f"Attempt {attempt + 1} failed for PDF {file_name}: {e}")
            if attempt < max_retries:
                wait_time = 2 ** attempt  # Exponential backoff
                logger.info(f"Retrying PDF {file_name} in {wait_time} seconds...")
                await asyncio.sleep(wait_time)
                # Force garbage collection before retry
                gc.collect()
            else:
                logger.error(f"All {max_retries + 1} attempts failed for PDF {file_name}")
                return ""

async def process_pdf_file(file_info: Tuple[str, str, str], config: dict, max_retries: int = 2) -> bool:
    """Process a single PDF file with retry logic: download, convert, and upload."""
    file_id, file_name, cdn_path = file_info
    
    for attempt in range(max_retries + 1):
        try:
            logger.debug(f"Processing PDF: {file_name} (ID: {file_id}) - Attempt {attempt + 1}")
            
            # Download PDF content
            pdf_content = await download_pdf_from_cdn(cdn_path, file_name)
            
            if not pdf_content:
                logger.error(f"No content downloaded for PDF {file_id}")
                if attempt < max_retries:
                    continue
                return False
            
            # Convert PDF to text with retry logic
            text_content = await pdf_to_text(pdf_content, file_name)
            
            if not text_content.strip():
                logger.warning(f"No text extracted from PDF {file_name}")
                if attempt < max_retries:
                    continue
                return False
            
            # Upload text file to BunnyCDN
            success = await upload_text_to_bunnycdn(text_content, file_name, config)
            
            if success:
                logger.debug(f"Successfully processed and uploaded PDF {file_name}")
                return True
            else:
                logger.error(f"Failed to upload text for PDF {file_name}")
                if attempt < max_retries:
                    wait_time = 2 ** attempt
                    logger.info(f"Retrying upload for {file_name} in {wait_time} seconds...")
                    await asyncio.sleep(wait_time)
                    continue
                return False
                
        except Exception as e:
            logger.error(f"Attempt {attempt + 1} failed for PDF {file_id} ({file_name}): {e}")
            if attempt < max_retries:
                wait_time = 2 ** attempt  # Exponential backoff
                logger.info(f"Retrying PDF {file_name} in {wait_time} seconds...")
                await asyncio.sleep(wait_time)
                # Force garbage collection before retry
                gc.collect()
            else:
                logger.error(f"All {max_retries + 1} attempts failed for PDF {file_id}")
                return False

async def main():
    """Main function to process all PDF files from Supabase"""
    global PDF_PROCESSING_SEMAPHORE
    
    logger.info("Starting PDF to text conversion process...")
    
    # Load configuration
    config = load_config()
    
    # Set up concurrency limits to prevent segfaults
    max_concurrent_pdfs = 1
    PDF_PROCESSING_SEMAPHORE = asyncio.Semaphore(max_concurrent_pdfs)
    logger.info(f"Max concurrent PDF processing: {max_concurrent_pdfs}")
    
    # Connect to database
    try:
        conn = psycopg2.connect(config['database']['connection_string'])
        logger.info("Connected to database")
        
        with conn.cursor() as cur:
            # Query for PDF files with CDN URLs
            cur.execute("""
                SELECT f.id, f.file_name, f.cdn_path 
                FROM files f 
                WHERE f.cdn_path IS NOT NULL 
                AND f.mime_type = 'application/pdf'
                AND f.cdn_path LIKE '%.pdf'
            """)
            
            pdf_files = cur.fetchall()
            logger.info(f"Found {len(pdf_files)} PDF files to process")
            
            if not pdf_files:
                logger.info("No PDF files found to process")
                return

            # Randomly shuffle the PDF files for random batch selection
            random.shuffle(pdf_files)
            logger.info("PDF files shuffled for random batch processing")

            # Reduced default batch size to prevent memory issues
            batch_size = config.get('processing', {}).get('batch_size', 5)  # Reduced from 10 to 5
            logger.info(f"Processing in batches of {batch_size}")

            total_successful = 0
            total_failed = 0

            with tqdm(total=len(pdf_files), desc="Processing PDFs") as pbar:
                for i in range(0, len(pdf_files), batch_size):
                    pdf_batch = pdf_files[i:i + batch_size]
                    batch_num = (i // batch_size) + 1
                    
                    logger.info(f"Processing batch {batch_num} ({len(pdf_batch)} files)...")

                    tasks = [process_pdf_file(file_info, config) for file_info in pdf_batch]
                    
                    results = []
                    for future in asyncio.as_completed(tasks):
                        try:
                            result = await future
                            results.append(result)
                            pbar.update(1)
                            
                            # Add small delay between completions to prevent overwhelming the system
                            await asyncio.sleep(0.1)
                            
                        except Exception as e:
                            logger.error(f"Task failed with error: {e}")
                            results.append(False)
                            pbar.update(1)
                    
                    successful_conversions = sum(1 for r in results if r)
                    failed_conversions = len(results) - successful_conversions
                    
                    total_successful += successful_conversions
                    total_failed += failed_conversions
                    
                    logger.info(f"Batch {batch_num} complete: {successful_conversions} successful, {failed_conversions} failed.")
                    
                    # Force garbage collection between batches and add delay
                    gc.collect()
                    await asyncio.sleep(1)  # Add 1 second delay between batches

            logger.info(f"All processing complete: {total_successful} total successful, {total_failed} total failed.")
            
    except Exception as e:
        logger.error(f"Database error: {e}")
    finally:
        if 'conn' in locals():
            conn.close()
            logger.info("Database connection closed")

if __name__ == "__main__":
    asyncio.run(main()) 