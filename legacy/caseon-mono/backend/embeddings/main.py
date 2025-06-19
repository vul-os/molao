import os
import tomli
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
import psycopg2
import uuid
import logging
import re
import gc
import torch
import torch.nn.functional as F
from tqdm import tqdm
from datetime import datetime, timedelta
import time
from typing import List, Tuple, Dict, Any, Generator
from transformers import AutoTokenizer
from striprtf.striprtf import rtf_to_text
import docx
import json
import httpx
import tempfile
from pathlib import Path
from optimum.onnxruntime import ORTModelForFeatureExtraction
from transformers import AutoModel
import random  # Add random for file selection
import asyncio
from concurrent.futures import ThreadPoolExecutor
from functools import partial
import threading
from queue import Queue
import shutil  # For file operations

# Setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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

# Constants
PROCESSED_FILES_CACHE = "processed_files.txt"
FAILED_FILES_LOG = "failed_files.txt"
USE_PROCESSED_FILES_CACHE = True  # Set to False to force refresh from Qdrant

# Caching System:
# - On first run, queries Qdrant for all processed file IDs and saves to processed_files.txt
# - On subsequent runs, loads from processed_files.txt (much faster)
# - New processed files are automatically appended to the cache file
# - To refresh cache: set USE_PROCESSED_FILES_CACHE=False or delete processed_files.txt

# Add these variables at the top level after imports
start_time = None
total_files_processed = 0
total_chunks_processed = 0
total_tokens_processed = 0
last_stats_time = None
last_files_processed = 0
last_chunks_processed = 0
last_tokens_processed = 0

# Add these constants after the existing ones
MAX_CONCURRENT_FILES = 4  # Number of files to process concurrently
MAX_CONCURRENT_EMBEDDINGS = 2  # Number of embedding generation tasks to run concurrently
THREAD_POOL_SIZE = 1  # Single thread for sequential processing
STATS_INTERVAL = 10  # Print stats every 10 seconds

class TokenizerPool:
    """Thread-safe pool of tokenizers."""
    def __init__(self, model_name: str, pool_size: int = THREAD_POOL_SIZE):
        self.model_name = model_name
        self.pool_size = pool_size
        self.tokenizers = Queue()
        self._initialize_pool()
        
    def _initialize_pool(self):
        """Initialize the pool with tokenizer instances."""
        for _ in range(self.pool_size):
            tokenizer = AutoTokenizer.from_pretrained(self.model_name, use_fast=True)
            self.tokenizers.put(tokenizer)
    
    def get_tokenizer(self):
        """Get a tokenizer from the pool."""
        return self.tokenizers.get()
    
    def return_tokenizer(self, tokenizer):
        """Return a tokenizer to the pool."""
        self.tokenizers.put(tokenizer)

class MultiGPUModelManager:
    """Manages multiple model instances across available GPUs."""
    def __init__(self, model_name: str):
        self.model_name = model_name
        self.models = {}
        self.gpu_queue = Queue()
        self._initialize_models()
    
    def _initialize_models(self):
        """Initialize model instances for each available GPU."""
        if not torch.cuda.is_available():
            logger.warning("CUDA not available, using CPU")
            self.models[0] = self._load_model_for_device("cpu")
            self.gpu_queue.put(0)
            return
        
        gpu_count = torch.cuda.device_count()
        logger.info(f"Found {gpu_count} GPU(s), initializing models...")
        
        for gpu_id in range(gpu_count):
            try:
                device = f"cuda:{gpu_id}"
                model = self._load_model_for_device(device)
                self.models[gpu_id] = model
                self.gpu_queue.put(gpu_id)
                logger.info(f"Initialized model on GPU {gpu_id}")
            except Exception as e:
                logger.error(f"Failed to initialize model on GPU {gpu_id}: {e}")
        
        if not self.models:
            logger.warning("No GPU models initialized, falling back to CPU")
            self.models[0] = self._load_model_for_device("cpu")
            self.gpu_queue.put(0)
    
    def _load_model_for_device(self, device: str):
        """Load model for specific device."""
        try:
            if device == "cpu":
                provider = "CPUExecutionProvider"
            else:
                provider = "CUDAExecutionProvider"
                # Set specific GPU device
                gpu_id = int(device.split(':')[1]) if ':' in device else 0
                torch.cuda.set_device(device)
                
                # Set GPU-specific memory limits
                if gpu_id == 0:
                    # GPU 0 is used for display, allocate less memory (4GB instead of 6GB)
                    memory_fraction = 0.5  # About 4GB on an 8GB GPU
                    logger.info(f"Setting GPU {gpu_id} (display GPU) memory fraction to {memory_fraction} (~4GB)")
                else:
                    # GPU 1 can use more memory (6GB)
                    memory_fraction = 0.95  # About 5.8GB on a 6GB GPU
                    logger.info(f"Setting GPU {gpu_id} memory fraction to {memory_fraction} (~5.8GB)")
                
                torch.cuda.set_per_process_memory_fraction(memory_fraction, device=gpu_id)
            
            model = ORTModelForFeatureExtraction.from_pretrained(
                self.model_name,
                revision="refs/pr/13",
                file_name="model.onnx",
                provider=provider
            )
            logger.info(f"ONNX model loaded successfully on {device}")
            return model
        except Exception as e:
            logger.error(f"Failed to load ONNX model on {device}: {e}")
            logger.info(f"Falling back to regular PyTorch model on {device}")
            model = AutoModel.from_pretrained(self.model_name)
            if device != "cpu":
                model = model.to(device)
            return model
    
    def get_model(self) -> Tuple[Any, int]:
        """Get an available model and its GPU ID."""
        gpu_id = self.gpu_queue.get()
        return self.models[gpu_id], gpu_id
    
    def return_model(self, gpu_id: int):
        """Return a model to the pool."""
        self.gpu_queue.put(gpu_id)
    
    def get_device_for_gpu(self, gpu_id: int) -> str:
        """Get device string for GPU ID."""
        if gpu_id == 0 and not torch.cuda.is_available():
            return "cpu"
        return f"cuda:{gpu_id}"

def load_config() -> Dict[str, Any]:
    with open("config.toml", "rb") as f:
        return tomli.load(f)

def get_qdrant_client():
    config = load_config()
    qdrant_config = config['qdrant']
    
    client = QdrantClient(
        url=qdrant_config['url'],
        api_key=qdrant_config['api_key'] if qdrant_config['api_key'] != "your-qdrant-api-key-here" else None,
        timeout=120.0
    )
    
    return client, qdrant_config['collection_name']

def ensure_collection_exists():
    """Ensure the Qdrant collection exists, create it if it doesn't."""
    client, collection_name = get_qdrant_client()
    
    try:
        client.get_collection(collection_name)
        logger.info(f"Collection '{collection_name}' already exists")
    except Exception:
        # Collection doesn't exist, create it
        # We'll use 1024 as the vector size for BAAI/bge-large-en-v1.5
        client.create_collection(
            collection_name=collection_name,
            vectors_config=VectorParams(size=1024, distance=Distance.COSINE)
        )
        logger.info(f"Created collection '{collection_name}'")

def is_text_file(mime_type: str) -> bool:
    return mime_type.startswith("text/")

def normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()

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

async def read_local_file(folder_path: str, file_id: uuid.UUID, file_name: str) -> bytes:
    """Read file content from local storage."""
    local_path = get_local_file_path(folder_path, file_id, file_name)
    
    if not os.path.exists(local_path):
        raise FileNotFoundError(f"Local file not found: {local_path}")
    
    with open(local_path, 'rb') as f:
        content = f.read()
    
    logger.debug(f"Read {len(content)} bytes from local file: {local_path}")
    return content

def cleanup_local_file(folder_path: str, file_id: uuid.UUID, file_name: str) -> None:
    """Remove local file after processing if cleanup is enabled."""
    local_path = get_local_file_path(folder_path, file_id, file_name)
    try:
        if os.path.exists(local_path):
            os.remove(local_path)
            logger.debug(f"Cleaned up local file: {local_path}")
    except Exception as e:
        logger.warning(f"Failed to cleanup local file {local_path}: {e}")

async def download_file_from_cdn(cdn_url: str, file_name: str) -> tuple[bytes, str]:
    """Download RTF file content from CDN URL. Note: This function should only be called with RTF URLs, 
    not PDF URLs. Returns (content, actual_mime_type)."""
    logger.info(f"Downloading RTF file from CDN: {file_name}")
    
    # Configure HTTP client for better concurrent performance
    limits = httpx.Limits(max_keepalive_connections=20, max_connections=100)
    timeout = httpx.Timeout(connect=30.0, read=60.0, write=30.0, pool=120.0)
    
    async with httpx.AsyncClient(timeout=timeout, limits=limits) as client:
        try:
            response = await client.get('https://' + cdn_url)
            response.raise_for_status()
            
            logger.info(f"Successfully downloaded RTF {file_name} ({len(response.content)} bytes)")
            return response.content, "application/rtf"
            
        except httpx.HTTPError as e:
            logger.error(f"HTTP error downloading RTF {file_name} from {cdn_url}: {e}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error downloading RTF {file_name}: {e}")
            raise

def process_file_content(file_content: bytes, file_name: str, mime_type: str, tokenizer) -> str:
    """Process file content based on mime type."""
    try:
        if mime_type == "application/rtf":
            try:
                # Try multiple encodings for RTF files with more robust error handling
                encodings_to_try = [
                    'utf-8', 'cp1252', 'cp932', 'shift_jis', 'euc-jp', 'iso-2022-jp',
                    'latin-1', 'iso-8859-1', 'windows-1252', 'ascii'
                ]
                rtf_string = None
                successful_encoding = None
                
                # First, let's check if this looks like an RTF file at all
                file_start = file_content[:100]  # Check first 100 bytes
                logger.debug(f"RTF file {file_name} starts with: {file_start[:50]}")
                
                for encoding in encodings_to_try:
                    try:
                        rtf_string = file_content.decode(encoding)
                        successful_encoding = encoding
                        logger.debug(f"Successfully decoded RTF file {file_name} using {encoding} encoding")
                        break
                    except UnicodeDecodeError as e:
                        logger.debug(f"Failed to decode RTF file {file_name} with {encoding} encoding: {e}")
                        continue
                    except Exception as e:
                        logger.debug(f"Unexpected error decoding RTF file {file_name} with {encoding}: {e}")
                        continue
                
                if rtf_string is None:
                    # If all encodings fail, try with different error handling strategies
                    logger.warning(f"All encoding attempts failed for {file_name}, trying fallback methods")
                    
                    try:
                        # Try with 'replace' errors
                        rtf_string = file_content.decode('utf-8', errors='replace')
                        successful_encoding = 'utf-8 (with replacement)'
                        logger.info(f"Used UTF-8 with character replacement for {file_name}")
                    except Exception as e:
                        try:
                            # Try with 'ignore' errors
                            rtf_string = file_content.decode('utf-8', errors='ignore')
                            successful_encoding = 'utf-8 (with ignore)'
                            logger.info(f"Used UTF-8 with character ignore for {file_name}")
                        except Exception as e2:
                            # Last resort - treat as latin-1 which can decode any byte sequence
                            rtf_string = file_content.decode('latin-1')
                            successful_encoding = 'latin-1 (last resort)'
                            logger.warning(f"Used latin-1 as last resort for {file_name}")
                
                logger.info(f"RTF file {file_name} decoded using: {successful_encoding}")
                
                # Check if this actually looks like RTF content
                if not rtf_string.strip().startswith('{\\rtf'):
                    logger.warning(f"File {file_name} doesn't appear to be valid RTF format (doesn't start with {{\\rtf)")
                    # Try to extract text anyway, but warn about potential issues
                
                # Extract text from RTF
                extracted_text = rtf_to_text(rtf_string)
                
                if not extracted_text or len(extracted_text.strip()) == 0:
                    logger.warning(f"RTF file {file_name}: no text extracted, possibly corrupted or empty")
                    return ""
                
                logger.info(f"RTF file {file_name}: extracted {len(extracted_text)} chars")
                return normalize_whitespace(extracted_text)
                
            except Exception as e:
                logger.error(f"Failed to parse RTF for file {file_name}: {e}")
                logger.debug(f"RTF processing error details for {file_name}", exc_info=True)
                
                # Log some debug info about the file
                try:
                    logger.debug(f"File {file_name} size: {len(file_content)} bytes")
                    logger.debug(f"File {file_name} first 50 bytes (hex): {file_content[:50].hex()}")
                    logger.debug(f"File {file_name} first 50 bytes (repr): {repr(file_content[:50])}")
                except Exception as debug_e:
                    logger.debug(f"Could not log debug info for {file_name}: {debug_e}")
                
                return ""
        elif mime_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
            # Save to temporary file for docx processing
            with tempfile.NamedTemporaryFile(suffix='.docx', delete=False) as temp_file:
                temp_file.write(file_content)
                temp_file.flush()
                
                try:
                    doc = docx.Document(temp_file.name)
                    text = normalize_whitespace("\n\n".join([para.text for para in doc.paragraphs]))
                    return text
                finally:
                    os.unlink(temp_file.name)
        else:
            # Treat as text file
            text = file_content.decode('utf-8', errors='ignore')
            return normalize_whitespace(text)
    except Exception as e:
        logger.error(f"Failed to process file {file_name}: {e}")
        return ""

def chunk_text(text: str, tokenizer, config: Dict[str, Any]) -> Generator[Tuple[str, int, int], None, None]:
    max_length = config['processing']['token_limit']  # Use from config
    stride = config['processing']['stride']
    
    # First encode the text with truncation to avoid the warning
    encoded = tokenizer.encode(
        text,
        add_special_tokens=False,
        truncation=True,
        max_length=max_length * 100  # Allow for multiple chunks but prevent excessive memory usage
    )
    
    total_length = len(encoded)
    logger.info(f"Total tokens in text (after initial truncation): {total_length}")
    
    # Generate chunks with overlap
    for start in range(0, total_length, stride):
        end = min(start + max_length, total_length)
        chunk_tokens = encoded[start:end]
        chunk_text = tokenizer.decode(chunk_tokens, skip_special_tokens=True)
        yield (chunk_text, start, end)
        
        if end == total_length:
            break

def save_to_qdrant(file_id: uuid.UUID, file_name: str, chunks: List[Tuple[str, int, int]], embeddings: List[List[float]], model_name: str):
    client, collection_name = get_qdrant_client()
    
    try:
        points = []
        now = datetime.utcnow().isoformat()
        
        for i, ((chunk_text, start, end), embed) in enumerate(zip(chunks, embeddings)):
            point_id = str(uuid.uuid4())
            
            payload = {
                "file_id": str(file_id),
                "file_name": file_name,
                "model": model_name,
                "chunk_index": i,
                "chunk_start": start,
                "chunk_end": end,
                "tokens": end - start,
                "chunk_text": chunk_text,
                "created_at": now
            }
            
            point = PointStruct(
                id=point_id,
                vector=embed,
                payload=payload
            )
            points.append(point)
        
        # Upload points to Qdrant
        client.upsert(
            collection_name=collection_name,
            points=points
        )
        
        logger.info(f"Successfully saved {len(points)} vectors to Qdrant for file {file_id}")
        
        # Update the cache file with the new processed file ID
        if USE_PROCESSED_FILES_CACHE and os.path.exists(PROCESSED_FILES_CACHE):
            try:
                with open(PROCESSED_FILES_CACHE, 'a') as f:
                    f.write(f"{str(file_id)}\n")
                logger.debug(f"Added {file_id} to processed files cache")
            except Exception as e:
                logger.warning(f"Failed to update processed files cache: {e}")
        
    except Exception as e:
        logger.error(f"Failed saving to Qdrant: {e}", exc_info=True)
        raise

def get_embeddings_batched(chunks: List[str], model, gpu_id: int, tokenizer_pool: TokenizerPool, config: Dict[str, Any]) -> List[List[float]]:
    embeddings = []
    batch_size = config['processing']['batch_size']
    max_length = config['processing']['token_limit']
    
    # Determine device
    device = f"cuda:{gpu_id}" if torch.cuda.is_available() and gpu_id is not None else "cpu"
    logger.info(f"Processing {len(chunks)} chunks in batches of {batch_size} on {device}")
    
    # Get a tokenizer from the pool
    tokenizer = tokenizer_pool.get_tokenizer()
    try:
        for i in range(0, len(chunks), batch_size):
            batch = chunks[i:i + batch_size]
            logger.info(f"Processing batch {i//batch_size + 1}/{(len(chunks) + batch_size - 1) // batch_size} on {device}")
            
            try:
                # Tokenize with padding and truncation
                logger.info(f"Tokenizing batch {i//batch_size + 1}")
                encoded_input = tokenizer(
                    batch,
                    padding=True,
                    truncation=True,
                    max_length=max_length,
                    return_tensors="pt"
                )
                logger.info(f"Input shape: {encoded_input['input_ids'].shape}")
                
                # Move to appropriate device
                encoded_input = {k: v.to(device) for k, v in encoded_input.items()}
                
                # Generate embeddings
                logger.info(f"Generating embeddings for batch {i//batch_size + 1} on {device}")
                with torch.no_grad():
                    outputs = model(**encoded_input)
                    if isinstance(outputs, dict) and 'last_hidden_state' in outputs:
                        batch_embeddings = outputs['last_hidden_state'][:, 0]
                    else:
                        batch_embeddings = outputs[:, 0] if len(outputs.shape) == 3 else outputs
                    
                    if not isinstance(batch_embeddings, torch.Tensor):
                        batch_embeddings = torch.tensor(batch_embeddings, device=device)
                    
                    batch_embeddings = F.normalize(batch_embeddings, p=2, dim=1)
                    embeddings.extend(batch_embeddings.cpu().numpy().tolist())
                
                # Clear memory
                del encoded_input, outputs, batch_embeddings
                if torch.cuda.is_available() and device != "cpu":
                    torch.cuda.empty_cache()
                gc.collect()
                logger.info(f"Completed batch {i//batch_size + 1}")
                
            except Exception as e:
                logger.error(f"Error processing batch {i//batch_size + 1} on {device}: {str(e)}", exc_info=True)
                raise
    finally:
        # Always return the tokenizer to the pool
        tokenizer_pool.return_tokenizer(tokenizer)
    
    logger.info(f"Completed processing all {len(chunks)} chunks on {device}")
    return embeddings

def print_processing_stats():
    """Print current processing statistics."""
    global start_time, total_files_processed, last_stats_time, last_files_processed
    
    if start_time is None:
        return
        
    current_time = time.time()
    elapsed_minutes = (current_time - start_time) / 60
    
    if last_stats_time is None or (current_time - last_stats_time) >= STATS_INTERVAL:
        # Calculate rates
        time_since_last = (current_time - last_stats_time) if last_stats_time else elapsed_minutes * 60
        files_per_minute = total_files_processed / elapsed_minutes if elapsed_minutes > 0 else 0
        recent_files_per_minute = (total_files_processed - last_files_processed) / (time_since_last / 60) if time_since_last > 0 else 0
        
        logger.info(f"Files/minute: {files_per_minute:.1f} (recent: {recent_files_per_minute:.1f}) - Total files: {total_files_processed}")
        
        # Update last stats
        last_stats_time = current_time
        last_files_processed = total_files_processed

async def process_single_file(file_info: Tuple[uuid.UUID, str, str, str], model_manager: MultiGPUModelManager, tokenizer_pool: TokenizerPool, config: Dict[str, Any], processed_file_ids: set) -> bool:
    """Process a single file and return success status."""
    global total_chunks_processed, total_tokens_processed
    file_id, file_name, mime_type, cdn_path = file_info
    logger.info(f"Processing file {file_id} ({file_name}) with mime type: {mime_type}")
    
    # Get model and GPU assignment
    model, gpu_id = model_manager.get_model()
    device = model_manager.get_device_for_gpu(gpu_id)
    
    try:
        # Double-check if this file has already been processed (safety check)
        if str(file_id) in processed_file_ids:
            logger.info(f"File {file_id} already processed (safety check), skipping...")
            return True
        
        logger.info(f"Processing file {file_id} on {device}")
        
        # Read file from local storage instead of downloading from CDN
        folder_path = config['local_storage']['folder_path']
        logger.info(f"Reading file from local storage: {file_name}")
        file_content = await read_local_file(folder_path, file_id, file_name)
        
        # Use the mime type from the file info (already updated during download)
        processing_mime_type = mime_type
        
        if not file_content:
            error_msg = "No content read from local file"
            logger.error(f"No content read from local file {file_id}")
            log_failed_file(file_id, file_name, cdn_path, error_msg, "processing_no_content")
            return False

        # Get a tokenizer from the pool for text processing
        tokenizer = tokenizer_pool.get_tokenizer()
        try:
            # Process the file content to get text (CPU-bound task)
            with ThreadPoolExecutor(max_workers=1) as executor:  # Use single worker since we have tokenizer pool
                loop = asyncio.get_event_loop()
                text = await loop.run_in_executor(
                    executor,
                    partial(process_file_content, file_content, file_name, processing_mime_type, tokenizer)
                )
            
            if not text:
                error_msg = f"No text extracted from file ({file_name}, {processing_mime_type})"
                logger.error(f"No text extracted from file {file_id} ({file_name}, {processing_mime_type})")
                log_failed_file(file_id, file_name, cdn_path, error_msg, "processing_no_text")
                return False
            logger.info(f"Extracted {len(text)} characters from file {file_id}")

            # Chunk the text (CPU-bound task)
            chunks = list(chunk_text(text, tokenizer, config))
            
            if not chunks:
                error_msg = "No chunks generated for file"
                logger.error(f"No chunks generated for file {file_id}")
                log_failed_file(file_id, file_name, cdn_path, error_msg, "processing_no_chunks")
                return False
            logger.info(f"Generated {len(chunks)} chunks for file {file_id}")
        finally:
            # Return the tokenizer to the pool
            tokenizer_pool.return_tokenizer(tokenizer)

        # Get text only from chunks
        text_chunks = [chunk[0] for chunk in chunks]
        chunks_count = len(chunks)
        tokens_count = sum(chunk[2] - chunk[1] for chunk in chunks)  # Sum of token counts from chunk ranges
        total_chunks_processed += chunks_count
        total_tokens_processed += tokens_count
        logger.info(f"Average chunk length: {sum(len(c) for c in text_chunks) / len(text_chunks):.2f} characters")
        logger.info(f"Total tokens in file: {tokens_count:,}")
        
        # Print stats after each file
        print_processing_stats()
        
        # Generate embeddings in batches (using assigned GPU)
        logger.info(f"Generating embeddings for file {file_id} on {device}")
        try:
            embeddings = get_embeddings_batched(
                text_chunks,
                model,
                gpu_id,
                tokenizer_pool,
                config
            )
            logger.info(f"Generated {len(embeddings)} embeddings for file {file_id} on {device}")
        except Exception as e:
            error_msg = f"Error generating embeddings: {str(e)}"
            logger.error(f"Error generating embeddings for file {file_id}: {str(e)}", exc_info=True)
            log_failed_file(file_id, file_name, cdn_path, error_msg, "processing_embeddings")
            return False

        # Save to database
        logger.info(f"Saving embeddings to database for file {file_id}")
        try:
            save_to_qdrant(file_id, file_name, chunks, embeddings, config['embedding']['model_name'])
            logger.info(f"Successfully processed file {file_id}")
            
            # Cleanup local file if configured to do so
            if config['local_storage'].get('cleanup_after_processing', True):
                cleanup_local_file(folder_path, file_id, file_name)
            
            print_processing_stats()  # Print stats after each file
            return True
        except Exception as e:
            error_msg = f"Error saving to database: {str(e)}"
            logger.error(f"Error saving to database for file {file_id}: {str(e)}", exc_info=True)
            log_failed_file(file_id, file_name, cdn_path, error_msg, "processing_database")
            return False

    except Exception as e:
        error_msg = f"Error processing file: {str(e)}"
        logger.error(f"Error processing file {file_id}: {str(e)}", exc_info=True)
        log_failed_file(file_id, file_name, cdn_path, error_msg, "processing_general")
        return False
    finally:
        # Always return the model to the pool
        model_manager.return_model(gpu_id)

async def process_files_batch(file_batch: List[Tuple[uuid.UUID, str, str, str]], model_manager: MultiGPUModelManager, tokenizer_pool: TokenizerPool, config: Dict[str, Any], processed_file_ids: set):
    """Process files in parallel across available GPUs."""
    global total_files_processed
    
    # Create tasks for parallel processing
    tasks = []
    for file_info in file_batch:
        task = process_single_file(file_info, model_manager, tokenizer_pool, config, processed_file_ids)
        tasks.append(task)
    
    # Process files in parallel (limited by available models/GPUs)
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    # Count successful processes
    successful_count = 0
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            logger.error(f"Error processing file {file_batch[i][0]}: {result}")
        elif result:
            successful_count += 1
    
    total_files_processed += successful_count
    logger.info(f"Batch completed: {successful_count}/{len(file_batch)} files processed successfully")
    print_processing_stats()

async def main():
    global start_time, total_files_processed, last_stats_time, last_files_processed
    
    # Reset stats
    start_time = time.time()
    total_files_processed = 0
    total_chunks_processed = 0
    total_tokens_processed = 0
    last_stats_time = None
    last_files_processed = 0
    last_chunks_processed = 0
    last_tokens_processed = 0
    
    # Initialize failed files log with header if it doesn't exist
    if not os.path.exists(FAILED_FILES_LOG):
        try:
            with open(FAILED_FILES_LOG, 'w', encoding='utf-8') as f:
                f.write("timestamp\tfailure_type\tfile_id\tfile_name\tcdn_url\terror_message\n")
            logger.info(f"Created failed files log: {FAILED_FILES_LOG}")
        except Exception as e:
            logger.warning(f"Could not create failed files log: {e}")
    
    # Configure PyTorch
    config = load_config()
    torch.set_float32_matmul_precision("high")
    if torch.cuda.is_available():
        torch.cuda.empty_cache()

    # Initialize model manager and tokenizer pool
    logger.info("Loading models and initializing tokenizer pool...")
    model_name = 'BAAI/bge-large-en-v1.5'
    
    # Create multi-GPU model manager
    model_manager = MultiGPUModelManager(model_name)
    
    # Initialize tokenizer pool (size based on number of GPUs)
    num_gpus = len(model_manager.models)
    tokenizer_pool = TokenizerPool(model_name, pool_size=num_gpus * 2)  # 2x tokenizers per GPU
    
    logger.info(f"Initialized {num_gpus} model instance(s) and {num_gpus * 2} tokenizers")

    # Ensure Qdrant collection exists (only once at startup)
    logger.info("Ensuring Qdrant collection exists...")
    ensure_collection_exists()

    # Get processed file IDs (from cache or Qdrant)
    processed_file_ids = load_processed_file_ids()
    if processed_file_ids is None:
        # Cache miss or disabled, query Qdrant
        processed_file_ids = get_processed_file_ids_from_qdrant()
    else:
        logger.info("Using cached processed file IDs (set USE_PROCESSED_FILES_CACHE=False to refresh)")

    # Continuous processing loop
    while True:
        try:
            # Get unprocessed files from Supabase/PostgreSQL
            conn = psycopg2.connect(config['database']['connection_string'])
            try:
                with conn.cursor() as cur:
                    cur.execute("""
                        SELECT f.id, f.file_name, f.mime_type, f.cdn_path 
                        FROM files f 
                        WHERE f.cdn_path IS NOT NULL
                    """)
                    all_files = cur.fetchall()
                    
                    logger.info(f"Found {len(all_files)} total PDF/RTF files in database")
                    
                    # Filter out already processed files
                    unprocessed_files = []
                    processed_count = 0
                    
                    for file_info in all_files:
                        file_id_str = str(file_info[0])
                        if file_id_str in processed_file_ids:
                            processed_count += 1
                            logger.debug(f"Skipping already processed file: {file_id_str} ({file_info[1]})")
                        else:
                            unprocessed_files.append(file_info)
                    
                    logger.info(f"Filtered out {processed_count} already processed files")
                    logger.info(f"Found {len(unprocessed_files)} unprocessed files to process")
                    
                    
                    if not unprocessed_files:
                        logger.info("No unprocessed files found. Waiting 60 seconds before checking again...")
                        await asyncio.sleep(60)  # Wait 60 seconds before checking again
                        continue
                    
                    # Take up to max_files_to_process files
                    batch_files = unprocessed_files
                  
                    # Show breakdown of selected files by type
                    pdf_count = sum(1 for f in batch_files if f[2] == "application/pdf" or f[1].lower().endswith('.pdf'))
                    rtf_count = sum(1 for f in batch_files if f[2] == "application/rtf" or f[1].lower().endswith('.rtf'))
                    other_count = len(batch_files) - pdf_count - rtf_count
                    logger.info(f"File type breakdown in selected batch: {pdf_count} PDF, {rtf_count} RTF, {other_count} other types")
                    
                    if other_count > 0:
                        logger.info(f"Note: {other_count} non-PDF/RTF files will be skipped during download phase")
                    
                    # Download all files to local storage first
                    logger.info("=== DOWNLOADING FILES TO LOCAL STORAGE ===")
                    available_files = await batch_download_files_to_local(batch_files, config)
                    
                    if not available_files:
                        logger.error("No files available for processing after download step")
                        continue
                    
                    logger.info(f"=== PROCESSING {len(available_files)} PDF/RTF FILES (AS RTF CONTENT) FROM LOCAL STORAGE ===")
                    
                    # Process files in batches that utilize all GPUs
                    files_per_gpu = config['processing']['batch_size']  # Use config batch size per GPU
                    batch_size = num_gpus * files_per_gpu  # Total batch size = files_per_gpu * number of GPUs
                    
                    logger.info(f"Processing {files_per_gpu} files per GPU across {num_gpus} GPU(s) = {batch_size} files per batch")
                    
                    for i in range(0, len(available_files), batch_size):
                        current_batch = available_files[i:i + batch_size]
                        logger.info(f"Processing batch {i//batch_size + 1} with {len(current_batch)} files ({len(current_batch)//num_gpus} files per GPU average)")
                        
                        # Process the batch in parallel
                        await process_files_batch(current_batch, model_manager, tokenizer_pool, config, processed_file_ids)
                        
                        # Update processed file IDs after each batch
                        for file_info in current_batch:
                            processed_file_ids.add(str(file_info[0]))
                        
                        # Save updated processed file IDs to cache
                        save_processed_file_ids(processed_file_ids)
                        
                        logger.info(f"Completed processing batch {i//batch_size + 1}")
                    
                    logger.info(f"Completed processing all {len(available_files)} files")
                    print_processing_stats()
                    
            finally:
                conn.close()
                
        except Exception as e:
            logger.error(f"Error in processing loop: {e}", exc_info=True)
            logger.info("Waiting 60 seconds before retrying...")
            await asyncio.sleep(60)  # Wait before retrying on error
            continue

def save_processed_file_ids(processed_file_ids: set):
    """Save processed file IDs to a text file."""
    try:
        with open(PROCESSED_FILES_CACHE, 'w') as f:
            for file_id in sorted(processed_file_ids):
                f.write(f"{file_id}\n")
        logger.info(f"Saved {len(processed_file_ids)} processed file IDs to {PROCESSED_FILES_CACHE}")
    except Exception as e:
        logger.error(f"Failed to save processed file IDs: {e}")

def load_processed_file_ids() -> set:
    """Load processed file IDs from text file if it exists."""
    if not USE_PROCESSED_FILES_CACHE:
        logger.info("Cache disabled, will query Qdrant")
        return None
        
    try:
        if not os.path.exists(PROCESSED_FILES_CACHE):
            logger.info(f"Cache file {PROCESSED_FILES_CACHE} not found, will query Qdrant")
            return None
            
        processed_file_ids = set()
        with open(PROCESSED_FILES_CACHE, 'r') as f:
            for line in f:
                file_id = line.strip()
                if file_id:
                    processed_file_ids.add(file_id)
        
        logger.info(f"Loaded {len(processed_file_ids)} processed file IDs from {PROCESSED_FILES_CACHE}")
        return processed_file_ids
        
    except Exception as e:
        logger.error(f"Failed to load processed file IDs from cache: {e}")
        return None

def get_processed_file_ids_from_qdrant() -> set:
    """Get processed file IDs from Qdrant (the original expensive operation)."""
    client, collection_name = get_qdrant_client()
    
    try:
        processed_file_ids = set()
        offset = None
        
        logger.info("Retrieving processed file IDs from Qdrant...")
        
        # Scroll through all points to get all processed file IDs
        while True:
            scroll_result = client.scroll(
                collection_name=collection_name,
                limit=120000,
                offset=offset,
                with_payload=["file_id"],
                with_vectors=False  # We don't need vectors, just payload
            )
            
            points, next_offset = scroll_result
            
            for point in points:
                if point.payload and "file_id" in point.payload:
                    processed_file_ids.add(point.payload["file_id"])
            
            # If no next_offset, we've retrieved all points
            if next_offset is None:
                break
            
            offset = next_offset
            logger.info(f"Retrieved {len(processed_file_ids)} processed file IDs so far...")
        
        logger.info(f"Found {len(processed_file_ids)} already processed files in Qdrant")
        
        # Save to cache for next time
        save_processed_file_ids(processed_file_ids)
        
        return processed_file_ids
        
    except Exception as e:
        logger.error(f"Error getting processed files from Qdrant: {e}")
        return set()

if __name__ == "__main__":
    asyncio.run(main())