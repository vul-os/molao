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
import fitz
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

# Setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Constants
PROCESSED_FILES_CACHE = "processed_files.txt"
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

def load_config() -> Dict[str, Any]:
    with open("config.toml", "rb") as f:
        return tomli.load(f)

def get_qdrant_client():
    config = load_config()
    qdrant_config = config['qdrant']
    
    client = QdrantClient(
        url=qdrant_config['url'],
        api_key=qdrant_config['api_key'] if qdrant_config['api_key'] != "your-qdrant-api-key-here" else None
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

async def download_file_from_cdn(cdn_url: str, file_name: str) -> bytes:
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

def process_file_content(file_content: bytes, file_name: str, mime_type: str, tokenizer) -> str:
    """Process file content based on mime type."""
    try:
        if mime_type == "application/rtf":
            try:
                # Use the simple approach that worked in the old code
                rtf_string = file_content.decode('utf-8', errors='ignore')
                extracted_text = rtf_to_text(rtf_string)
                logger.info(f"RTF file {file_name}: extracted {len(extracted_text)} chars")
                return normalize_whitespace(extracted_text)
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
                    text = normalize_whitespace("\n\n".join([para.text for para in doc.paragraphs]))
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
                        return normalize_whitespace(text)
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

def get_embeddings_batched(chunks: List[str], model, tokenizer_pool: TokenizerPool, config: Dict[str, Any]) -> List[List[float]]:
    embeddings = []
    batch_size = config['processing']['batch_size']
    max_length = config['processing']['token_limit']
    
    logger.info(f"Processing {len(chunks)} chunks in batches of {batch_size}")
    
    # Get a tokenizer from the pool
    tokenizer = tokenizer_pool.get_tokenizer()
    try:
        for i in range(0, len(chunks), batch_size):
            batch = chunks[i:i + batch_size]
            logger.info(f"Processing batch {i//batch_size + 1}/{(len(chunks) + batch_size - 1) // batch_size}")
            
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
                device = "cuda" if torch.cuda.is_available() else "cpu"
                encoded_input = {k: v.to(device) for k, v in encoded_input.items()}
                
                # Generate embeddings
                logger.info(f"Generating embeddings for batch {i//batch_size + 1}")
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
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                gc.collect()
                logger.info(f"Completed batch {i//batch_size + 1}")
                
            except Exception as e:
                logger.error(f"Error processing batch {i//batch_size + 1}: {str(e)}", exc_info=True)
                raise
    finally:
        # Always return the tokenizer to the pool
        tokenizer_pool.return_tokenizer(tokenizer)
    
    logger.info(f"Completed processing all {len(chunks)} chunks")
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

async def process_single_file(file_info: Tuple[uuid.UUID, str, str, str], model, tokenizer_pool: TokenizerPool, config: Dict[str, Any], processed_file_ids: set) -> bool:
    """Process a single file and return success status."""
    global total_chunks_processed, total_tokens_processed
    file_id, file_name, mime_type, cdn_path = file_info
    logger.info(f"Processing file {file_id} ({file_name}) with mime type: {mime_type}")
    
    try:
        # Double-check if this file has already been processed (safety check)
        if str(file_id) in processed_file_ids:
            logger.info(f"File {file_id} already processed (safety check), skipping...")
            return True
        
        # Download file from CDN
        logger.info(f"Downloading file from CDN: {file_name}")
        file_content = await download_file_from_cdn(cdn_path, file_name)
        
        if not file_content:
            logger.error(f"No content downloaded for file {file_id}")
            return False

        # Get a tokenizer from the pool for text processing
        tokenizer = tokenizer_pool.get_tokenizer()
        try:
            # Process the file content to get text (CPU-bound task)
            with ThreadPoolExecutor(max_workers=1) as executor:  # Use single worker since we have tokenizer pool
                loop = asyncio.get_event_loop()
                text = await loop.run_in_executor(
                    executor,
                    partial(process_file_content, file_content, file_name, mime_type, tokenizer)
                )
            
            if not text:
                logger.error(f"No text extracted from file {file_id} ({file_name}, {mime_type})")
                return False
            logger.info(f"Extracted {len(text)} characters from file {file_id}")

            # Chunk the text (CPU-bound task)
            chunks = list(chunk_text(text, tokenizer, config))
            
            if not chunks:
                logger.error(f"No chunks generated for file {file_id}")
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
        
        # Generate embeddings in batches (keeping GPU processing exactly as is)
        logger.info(f"Generating embeddings for file {file_id}")
        try:
            embeddings = get_embeddings_batched(
                text_chunks,
                model,
                tokenizer_pool,
                config
            )
            logger.info(f"Generated {len(embeddings)} embeddings for file {file_id}")
        except Exception as e:
            logger.error(f"Error generating embeddings for file {file_id}: {str(e)}", exc_info=True)
            return False

        # Save to database
        logger.info(f"Saving embeddings to database for file {file_id}")
        try:
            save_to_qdrant(file_id, file_name, chunks, embeddings, config['embedding']['model_name'])
            logger.info(f"Successfully processed file {file_id}")
            print_processing_stats()  # Print stats after each file
            return True
        except Exception as e:
            logger.error(f"Error saving to database for file {file_id}: {str(e)}", exc_info=True)
            return False

    except Exception as e:
        logger.error(f"Error processing file {file_id}: {str(e)}", exc_info=True)
        return False

async def process_files_batch(file_batch: List[Tuple[uuid.UUID, str, str, str]], model, tokenizer_pool: TokenizerPool, config: Dict[str, Any], processed_file_ids: set):
    """Process files sequentially."""
    global total_files_processed
    
    for file_info in file_batch:
        success = await process_single_file(file_info, model, tokenizer_pool, config, processed_file_ids)
        if success:
            total_files_processed += 1
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
    
    # Configure PyTorch (keeping GPU settings exactly as is)
    config = load_config()
    os.environ["PYTORCH_CUDA_ALLOC_CONF"] = f"max_split_size_mb:{config['processing']['cuda_memory_mb']},expandable_segments:True"
    torch.set_float32_matmul_precision("high")
    if torch.cuda.is_available():
        torch.cuda.empty_cache()

    # Initialize model and tokenizer pool
    logger.info("Loading model and initializing tokenizer pool...")
    model_name = 'BAAI/bge-large-en-v1.5'
    tokenizer_pool = TokenizerPool(model_name, pool_size=1)  # Single tokenizer for sequential processing
    
    # Initialize ONNX model (keeping GPU settings exactly as is)
    try:
        model = ORTModelForFeatureExtraction.from_pretrained(
            model_name,
            revision="refs/pr/13",
            file_name="model.onnx",
            provider="CUDAExecutionProvider" if torch.cuda.is_available() else "CPUExecutionProvider"
        )
        logger.info("ONNX model loaded successfully")
    except Exception as e:
        logger.error(f"Failed to load ONNX model: {e}")
        logger.info("Falling back to regular PyTorch model")
        model = AutoModel.from_pretrained(model_name)
        if torch.cuda.is_available():
            model = model.cuda()

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
                    
                    logger.info(f"Found {len(all_files)} total files in database")
                    
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
                    
                    # Get batch size from config
                    max_files_to_process = config.get('processing', {}).get('max_files_per_run', 100)
                    
                    if not unprocessed_files:
                        logger.info("No unprocessed files found. Waiting 60 seconds before checking again...")
                        await asyncio.sleep(60)  # Wait 60 seconds before checking again
                        continue
                    
                    # Take up to max_files_to_process files
                    batch_files = unprocessed_files[:max_files_to_process]
                    logger.info(f"Processing batch of {len(batch_files)} files")
                    
                    # Process the batch
                    await process_files_batch(batch_files, model, tokenizer_pool, config, processed_file_ids)
                    
                    # Update processed file IDs after each batch
                    for file_info in batch_files:
                        processed_file_ids.add(str(file_info[0]))
                    
                    # Save updated processed file IDs to cache
                    save_processed_file_ids(processed_file_ids)
                    
                    logger.info(f"Completed processing batch of {len(batch_files)} files")
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