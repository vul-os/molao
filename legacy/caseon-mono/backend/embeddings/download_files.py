import os
import tomli
import psycopg2
import uuid
import logging
import re
from datetime import datetime
import time
from typing import List, Tuple, Dict, Any
import httpx
import asyncio
from tqdm import tqdm

# Setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Constants
PROCESSED_FILES_CACHE = "downloaded_files.txt"
FAILED_FILES_LOG = "failed_downloads.txt"
USE_DOWNLOADED_FILES_CACHE = True  # Set to False to force refresh

def validate_url_conversion(original_cdn_path: str, converted_cdn_path: str, file_name: str) -> bool:
    """Validate that URL conversion worked correctly and log any issues."""
    try:
        # Check that conversion actually happened for PDF files
        if file_name.lower().endswith('.pdf'):
            if '.pdf' in original_cdn_path and '.rtf' not in converted_cdn_path:
                logger.warning(f"URL conversion may have failed for {file_name}:")
                logger.warning(f"  Original: {original_cdn_path}")
                logger.warning(f"  Converted: {converted_cdn_path}")
                return False
            elif original_cdn_path == converted_cdn_path and '.pdf' in original_cdn_path:
                logger.warning(f"No URL conversion detected for PDF file {file_name}: {original_cdn_path}")
                return False
        
        # Check for common URL issues
        if not converted_cdn_path:
            logger.error(f"Empty converted URL for {file_name}")
            return False
            
        if 'cdn.caseon.io' not in converted_cdn_path:
            logger.warning(f"Unexpected CDN domain in URL for {file_name}: {converted_cdn_path}")
        
        return True
    except Exception as e:
        logger.error(f"Error validating URL conversion for {file_name}: {e}")
        return False

def load_config() -> Dict[str, Any]:
    with open("config.toml", "rb") as f:
        return tomli.load(f)

def log_failed_file(file_id: uuid.UUID, file_name: str, cdn_path: str, error: str, failure_type: str = "download"):
    """Log failed file to text file with timestamp and details."""
    try:
        timestamp = datetime.utcnow().isoformat()
        # Convert PDF URL to RTF URL for consistency
        actual_url = cdn_path.replace('.pdf', '.rtf') if '.pdf' in cdn_path else cdn_path
        
        with open(FAILED_FILES_LOG, 'a', encoding='utf-8') as f:
            f.write(f"{timestamp}\t{failure_type}\t{file_id}\t{file_name}\thttps://{actual_url}\t{error}\n")
        
        logger.debug(f"Logged {failure_type} failure for {file_name} to {FAILED_FILES_LOG}")
    except Exception as e:
        logger.warning(f"Failed to log failure to file: {e}")

def ensure_local_folder_exists(folder_path: str) -> None:
    """Ensure the local storage folder exists."""
    os.makedirs(folder_path, exist_ok=True)
    logger.info(f"Local storage folder ready: {folder_path}")

def get_local_file_path(folder_path: str, file_id: uuid.UUID, file_name: str) -> str:
    """Generate a local file path for a given file."""
    # Extract base filename without extension and add .rtf extension
    base_name = os.path.splitext(file_name)[0]  # Remove existing extension
    rtf_filename = f"{base_name}.rtf"
    return os.path.join(folder_path, rtf_filename)

def is_file_downloaded_locally(folder_path: str, file_id: uuid.UUID, file_name: str) -> bool:
    """Check if a file is already downloaded locally."""
    local_path = get_local_file_path(folder_path, file_id, file_name)
    exists = os.path.exists(local_path) and os.path.getsize(local_path) > 0
    if exists:
        logger.debug(f"File {file_id} already exists locally: {local_path}")
    return exists

async def download_file_to_local(cdn_url: str, file_name: str, local_path: str, pbar=None) -> tuple[bool, str]:
    """Download RTF content from CDN to local storage. Note: This function only downloads RTF files, 
    PDF URLs should be converted to RTF URLs before calling this function. Returns (success, actual_mime_type)."""
    # Use tqdm.write() instead of logger.info() to avoid interfering with progress bar
    full_url = 'https://' + cdn_url
    if pbar:
        pbar.write(f"🌐 Downloading RTF from: {full_url}")
    else:
        logger.info(f"Downloading RTF content to local storage: {file_name} -> {local_path}")
        logger.info(f"RTF URL: {full_url}")
    
    # Configure HTTP client for better concurrent performance
    limits = httpx.Limits(max_keepalive_connections=20, max_connections=100)
    timeout = httpx.Timeout(connect=30.0, read=60.0, write=30.0, pool=120.0)
    
    async with httpx.AsyncClient(timeout=timeout, limits=limits) as client:
        try:
            response = await client.get('https://' + cdn_url)
            response.raise_for_status()
            
            # Write file to local storage using asyncio
            with open(local_path, 'wb') as f:
                f.write(response.content)
            
            # Use tqdm.write() for successful downloads to avoid interfering with progress bar
            if pbar:
                pbar.write(f"✅ Downloaded RTF: {file_name} ({len(response.content):,} bytes) from RTF URL")
            else:
                logger.info(f"Successfully downloaded RTF {file_name} to local storage ({len(response.content)} bytes)")
            
            # Update progress bar immediately after successful download
            if pbar:
                pbar.update(1)
            
            return True, "application/rtf"
            
        except httpx.HTTPError as e:
            error_msg = f"HTTP error downloading RTF {file_name} from {cdn_url}: {e}"
            if pbar:
                pbar.write(f"❌ Failed RTF download: {file_name} - {e}")
            else:
                logger.error(error_msg)
            # Update progress bar even on failure
            if pbar:
                pbar.update(1)
            return False, None
        except Exception as e:
            error_msg = f"Unexpected error downloading RTF {file_name}: {e}"
            if pbar:
                pbar.write(f"❌ Error downloading RTF: {file_name} - {e}")
            else:
                logger.error(error_msg)
            # Update progress bar even on failure
            if pbar:
                pbar.update(1)
            return False, None

async def batch_download_files_to_local(unprocessed_files: List[Tuple[uuid.UUID, str, str, str]], config: Dict[str, Any]) -> List[Tuple[uuid.UUID, str, str, str]]:
    """Download RTF versions of unprocessed PDF/RTF files to local storage. 
    
    IMPORTANT: This function NEVER downloads PDF files directly. For any PDF file in the input:
    - The PDF URL is automatically converted to an RTF URL (replacing .pdf with .rtf)
    - Only the RTF content is downloaded
    - The returned file info reflects the RTF URL and mime type
    
    Returns list of successfully downloaded files with updated RTF URLs and mime types."""
    folder_path = config['local_storage']['folder_path']
    ensure_local_folder_exists(folder_path)
    
    # Filter files that are PDF/RTF and aren't already downloaded
    files_to_download = []
    already_downloaded = []
    skipped_other = []
    
    logger.info(f"=== FILE FILTERING FOR DOWNLOAD ===")
    logger.info(f"Starting with {len(unprocessed_files)} unprocessed files")
    
    for file_info in unprocessed_files:
        file_id, file_name, mime_type, cdn_path = file_info
        
        # Check if file is PDF or RTF (by mime type or file extension)
        file_extension = os.path.splitext(file_name)[1].lower()
        is_pdf_or_rtf = (mime_type in ["application/rtf", "application/pdf"] or 
                        file_extension in ['.rtf', '.pdf'])
        
        if not is_pdf_or_rtf:
            skipped_other.append(file_info)
            logger.debug(f"Skipping non-PDF/RTF file: {file_name} (mime: {mime_type})")
            continue
            
        if not is_file_downloaded_locally(folder_path, file_id, file_name):
            files_to_download.append(file_info)
        else:
            already_downloaded.append(file_info)
    
    logger.info(f"PDF/RTF files found: {len(files_to_download) + len(already_downloaded)}")
    logger.info(f"Files already downloaded locally: {len(already_downloaded)}")
    logger.info(f"Files needing download: {len(files_to_download)}")
    logger.info(f"Non-PDF/RTF files skipped: {len(skipped_other)}")
    
    if len(skipped_other) > 0:
        # Show some examples of skipped file types
        mime_types = {}
        for _, _, mime_type, _ in skipped_other[:10]:  # Show first 10
            mime_types[mime_type] = mime_types.get(mime_type, 0) + 1
        logger.info(f"Examples of skipped file types: {dict(list(mime_types.items())[:5])}")
    
    logger.info(f"=== END FILE FILTERING ===")
    
    if not files_to_download:
        logger.info("All PDF/RTF files already downloaded locally")
        return already_downloaded  # Return files that are already downloaded
    
    # Use semaphore for concurrent downloads with higher concurrency
    max_concurrent_downloads = config.get('processing', {}).get('max_concurrent_downloads', 50)  # Default to 50 if not configured
    semaphore = asyncio.Semaphore(max_concurrent_downloads)
    
    successfully_downloaded = []
    failed_downloads = []  # Track failed downloads
    
    # Create overall progress bar for downloads with better formatting
    print("\n" + "="*80)
    print(f"DOWNLOADING {len(files_to_download)} FILES TO LOCAL STORAGE")
    print(f"Max concurrent downloads: {max_concurrent_downloads}")
    print("="*80)
    
    # Temporarily reduce logging level to prevent interference with progress bar
    original_log_level = logger.level
    logger.setLevel(logging.WARNING)  # Only show warnings and errors during downloads
    
    async def download_single_file_with_semaphore(file_info):
        """Download a single file with semaphore control."""
        async with semaphore:
            file_id, file_name, mime_type, cdn_path = file_info
            
            # Convert PDF URL to RTF if needed - handle different URL formats
            download_cdn_path = cdn_path
            original_url = f"https://{cdn_path}"
            
            if mime_type == "application/pdf" or file_name.lower().endswith('.pdf'):
                # More robust URL conversion - handle various formats
                if cdn_path.endswith('.pdf'):
                    download_cdn_path = cdn_path[:-4] + '.rtf'  # Replace .pdf with .rtf
                elif '.pdf' in cdn_path:
                    download_cdn_path = cdn_path.replace('.pdf', '.rtf')
                else:
                    # If no .pdf in URL but file is PDF, try adding .rtf
                    if not cdn_path.endswith('.rtf'):
                        download_cdn_path = cdn_path + '.rtf'
                
                converted_url = f"https://{download_cdn_path}"
                if pbar:
                    pbar.write(f"📄→📝 PDF to RTF conversion:")
                    pbar.write(f"  Original:  {original_url}")
                    pbar.write(f"  Converted: {converted_url}")
                else:
                    logger.info(f"PDF to RTF URL conversion for {file_name}:")
                    logger.info(f"  Original:  {original_url}")
                    logger.info(f"  Converted: {converted_url}")
                
                # Validate the conversion
                if not validate_url_conversion(cdn_path, download_cdn_path, file_name):
                    if pbar:
                        pbar.write(f"⚠️ URL conversion validation failed for {file_name}")
            else:
                if pbar:
                    pbar.write(f"📝 RTF file (no conversion needed): {original_url}")
            
            local_path = get_local_file_path(folder_path, file_id, file_name)
            return await download_file_to_local(download_cdn_path, file_name, local_path, pbar)
    
    try:
        with tqdm(
            total=len(files_to_download),
            desc="Downloading RTF files",
            unit="files",
            ncols=100,
            position=0,
            leave=True,
            bar_format='{l_bar}{bar}| {n_fmt}/{total_fmt} [{elapsed}<{remaining}, {rate_fmt}]'
        ) as pbar:
            # Create download tasks for ALL files at once
            download_tasks = []
            for file_info in files_to_download:
                task = download_single_file_with_semaphore(file_info)
                download_tasks.append((file_info, task))
            
            # Execute ALL downloads concurrently with semaphore limiting concurrency
            results = await asyncio.gather(*[task for _, task in download_tasks], return_exceptions=True)
            
            # Process results
            for (file_info, _), result in zip(download_tasks, results):
                file_id, file_name, mime_type, cdn_path = file_info
                
                if isinstance(result, Exception):
                    error_msg = str(result)
                    pbar.write(f"✗ Exception downloading {file_name}: {error_msg}")
                    log_failed_file(file_id, file_name, cdn_path, error_msg, "download_exception")
                    failed_downloads.append((file_id, file_name, cdn_path, error_msg))
                    continue
                
                success, actual_mime_type = result
                if success:
                    # Convert PDF URL to RTF URL for the returned file info since we downloaded RTF content
                    actual_cdn_path = cdn_path
                    if mime_type == "application/pdf" or file_name.lower().endswith('.pdf'):
                        actual_cdn_path = cdn_path.replace('.pdf', '.rtf')
                    
                    # Always set mime type to RTF and update cdn_path to reflect what was actually downloaded
                    file_info = (file_id, file_name, "application/rtf", actual_cdn_path)
                    successfully_downloaded.append(file_info)
                else:
                    error_msg = "Download failed"
                    # Error already logged in download_file_to_local
                    log_failed_file(file_id, file_name, cdn_path, error_msg, "download_failed")
                    failed_downloads.append((file_id, file_name, cdn_path, error_msg))
    finally:
        # Restore original logging level
        logger.setLevel(original_log_level)
    
    print("\n" + "="*80)
    print(f"DOWNLOAD COMPLETE: {len(successfully_downloaded)}/{len(files_to_download)} files downloaded successfully")
    print(f"Peak concurrency: {max_concurrent_downloads} simultaneous downloads")
    print("\n📄→📝 IMPORTANT: PDF files are downloaded as RTF content")
    print("File names may still show .pdf (original database name) but URLs access .rtf files")
    print("="*80 + "\n")
    
    # Log failed downloads if any
    if failed_downloads:
        logger.error(f"Failed to download {len(failed_downloads)} files:")
        logger.error("=== FAILED DOWNLOAD URLs ===")
        for file_id, file_name, cdn_path, error in failed_downloads:
            # Show the RTF URL that was actually attempted
            attempted_url = cdn_path.replace('.pdf', '.rtf') if '.pdf' in cdn_path else cdn_path
            logger.error(f"  File ID: {file_id}")
            logger.error(f"  File Name: {file_name}")
            logger.error(f"  CDN URL: https://{attempted_url}")
            logger.error(f"  Error: {error}")
            logger.error("  ---")
        logger.error("=== END FAILED DOWNLOADS ===")
        
        # Also create a simple list for easy copying
        failed_urls = [f"https://{cdn_path.replace('.pdf', '.rtf') if '.pdf' in cdn_path else cdn_path}" for _, _, cdn_path, _ in failed_downloads]
        logger.error("Failed CDN URLs (for easy copying):")
        for url in failed_urls:
            logger.error(f"  {url}")
        
        logger.error(f"All failed files have been logged to: {FAILED_FILES_LOG}")
    else:
        logger.info("All downloads completed successfully!")
    
    # Return files that are now available locally (already downloaded + newly downloaded)
    return already_downloaded + successfully_downloaded

def save_downloaded_file_ids(downloaded_file_ids: set):
    """Save downloaded file IDs to a text file."""
    try:
        with open(PROCESSED_FILES_CACHE, 'w') as f:
            for file_id in sorted(downloaded_file_ids):
                f.write(f"{file_id}\n")
        logger.info(f"Saved {len(downloaded_file_ids)} downloaded file IDs to {PROCESSED_FILES_CACHE}")
    except Exception as e:
        logger.error(f"Failed to save downloaded file IDs: {e}")

def load_downloaded_file_ids() -> set:
    """Load downloaded file IDs from text file if it exists."""
    if not USE_DOWNLOADED_FILES_CACHE:
        logger.info("Cache disabled, will check local files")
        return set()
        
    try:
        if not os.path.exists(PROCESSED_FILES_CACHE):
            logger.info(f"Cache file {PROCESSED_FILES_CACHE} not found, will check local files")
            return set()
            
        downloaded_file_ids = set()
        with open(PROCESSED_FILES_CACHE, 'r') as f:
            for line in f:
                file_id = line.strip()
                if file_id:
                    downloaded_file_ids.add(file_id)
        
        logger.info(f"Loaded {len(downloaded_file_ids)} downloaded file IDs from {PROCESSED_FILES_CACHE}")
        return downloaded_file_ids
        
    except Exception as e:
        logger.error(f"Failed to load downloaded file IDs from cache: {e}")
        return set()

async def main():
    # Initialize failed files log with header if it doesn't exist
    if not os.path.exists(FAILED_FILES_LOG):
        try:
            with open(FAILED_FILES_LOG, 'w', encoding='utf-8') as f:
                f.write("timestamp\tfailure_type\tfile_id\tfile_name\tcdn_url\terror_message\n")
            logger.info(f"Created failed files log: {FAILED_FILES_LOG}")
        except Exception as e:
            logger.warning(f"Could not create failed files log: {e}")
    
    config = load_config()
    
    # Get downloaded file IDs from cache
    downloaded_file_ids = load_downloaded_file_ids()
    
    # Continuous downloading loop
    while True:
        try:
            # Get files from Supabase/PostgreSQL
            conn = psycopg2.connect(config['database']['connection_string'])
            try:
                with conn.cursor() as cur:
                    cur.execute("""
                        SELECT f.id, f.file_name, f.mime_type, f.cdn_path 
                        FROM files f 
                        WHERE f.cdn_path IS NOT NULL
                    """)
                    all_files = cur.fetchall()
                    
                    logger.info(f"Found {len(all_files)} total files in database")
                    
                    # Filter out already downloaded files
                    unprocessed_files = []
                    downloaded_count = 0
                    
                    for file_info in all_files:
                        file_id_str = str(file_info[0])
                        if file_id_str in downloaded_file_ids:
                            downloaded_count += 1
                            logger.debug(f"Skipping already downloaded file: {file_id_str} ({file_info[1]})")
                        else:
                            # Also check if file exists locally
                            if is_file_downloaded_locally(config['local_storage']['folder_path'], file_info[0], file_info[1]):
                                downloaded_file_ids.add(file_id_str)
                                downloaded_count += 1
                                logger.debug(f"File exists locally, adding to cache: {file_id_str} ({file_info[1]})")
                            else:
                                unprocessed_files.append(file_info)
                    
                    logger.info(f"Filtered out {downloaded_count} already downloaded files")
                    logger.info(f"Found {len(unprocessed_files)} files to download")
                    
                    if not unprocessed_files:
                        logger.info("No unprocessed files found. Waiting 60 seconds before checking again...")
                        await asyncio.sleep(60)  # Wait 60 seconds before checking again
                        continue
                    
                    # Show breakdown of selected files by type
                    pdf_count = sum(1 for f in unprocessed_files if f[2] == "application/pdf" or f[1].lower().endswith('.pdf'))
                    rtf_count = sum(1 for f in unprocessed_files if f[2] == "application/rtf" or f[1].lower().endswith('.rtf'))
                    other_count = len(unprocessed_files) - pdf_count - rtf_count
                    logger.info(f"File type breakdown: {pdf_count} PDF, {rtf_count} RTF, {other_count} other types")
                    
                    if other_count > 0:
                        logger.info(f"Note: {other_count} non-PDF/RTF files will be skipped during download")
                    
                    # Download files to local storage
                    logger.info("=== STARTING DOWNLOAD PROCESS ===")
                    available_files = await batch_download_files_to_local(unprocessed_files, config)
                    
                    # Update downloaded file IDs
                    for file_info in available_files:
                        downloaded_file_ids.add(str(file_info[0]))
                    
                    # Save updated downloaded file IDs to cache
                    save_downloaded_file_ids(downloaded_file_ids)
                    
                    logger.info(f"=== DOWNLOAD PROCESS COMPLETE ===")
                    logger.info(f"Successfully downloaded {len(available_files)} files")
                    
            finally:
                conn.close()
                
        except Exception as e:
            logger.error(f"Error in download loop: {e}", exc_info=True)
            logger.info("Waiting 60 seconds before retrying...")
            await asyncio.sleep(60)  # Wait before retrying on error
            continue

if __name__ == "__main__":
    asyncio.run(main()) 