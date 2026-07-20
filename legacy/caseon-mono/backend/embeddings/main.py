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
from transformers import AutoTokenizer, AutoModel
from striprtf.striprtf import rtf_to_text
import docx
import json
import tempfile
from pathlib import Path
from optimum.onnxruntime import ORTModelForFeatureExtraction
import asyncio
import multiprocessing as mp
from multiprocessing import Queue, Process
import threading
import queue

# IMPORTANT: Set multiprocessing start method to 'spawn' for CUDA compatibility
if __name__ == "__main__":
    mp.set_start_method('spawn', force=True)

# Setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Constants
PROCESSED_FILES_CACHE = "processed_files.txt"
FAILED_FILES_LOG = "failed_files.txt"
USE_PROCESSED_FILES_CACHE = True  # Set to False to force refresh from Qdrant

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
STATS_INTERVAL = 10  # Print stats every 10 seconds

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

def log_failed_file(file_id: uuid.UUID, file_name: str, cdn_path: str, error: str, failure_type: str = "processing"):
    """Log failed file to text file with timestamp and details."""
    try:
        timestamp = datetime.utcnow().isoformat()
        
        with open(FAILED_FILES_LOG, 'a', encoding='utf-8') as f:
            f.write(f"{timestamp}\t{failure_type}\t{file_id}\t{file_name}\t{cdn_path}\t{error}\n")
        
        print(f"Logged {failure_type} failure for {file_name} to {FAILED_FILES_LOG}")
    except Exception as e:
        print(f"Failed to log failure to file: {e}")

def get_local_file_path(folder_path: str, file_id: uuid.UUID, file_name: str) -> str:
    """Generate a local file path for a given file."""
    # Extract base filename without extension and add .rtf extension
    base_name = os.path.splitext(file_name)[0]  # Remove existing extension
    rtf_filename = f"{base_name}.rtf"
    return os.path.join(folder_path, rtf_filename)

def is_file_available_locally(folder_path: str, file_id: uuid.UUID, file_name: str) -> bool:
    """Check if a file is available locally."""
    local_path = get_local_file_path(folder_path, file_id, file_name)
    exists = os.path.exists(local_path) and os.path.getsize(local_path) > 0
    if exists:
        print(f"File {file_id} available locally: {local_path}")
    return exists

def read_local_file(folder_path: str, file_id: uuid.UUID, file_name: str) -> bytes:
    """Read file content from local storage."""
    local_path = get_local_file_path(folder_path, file_id, file_name)
    
    if not os.path.exists(local_path):
        raise FileNotFoundError(f"Local file not found: {local_path}")
    
    with open(local_path, 'rb') as f:
        content = f.read()
    
    print(f"Read {len(content)} bytes from local file: {local_path}")
    return content

def cleanup_local_file(folder_path: str, file_id: uuid.UUID, file_name: str) -> None:
    """Remove local file after processing if cleanup is enabled."""
    local_path = get_local_file_path(folder_path, file_id, file_name)
    try:
        if os.path.exists(local_path):
            os.remove(local_path)
            print(f"Cleaned up local file: {local_path}")
    except Exception as e:
        print(f"Failed to cleanup local file {local_path}: {e}")

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
                print(f"RTF file {file_name} starts with: {file_start[:50]}")
                
                for encoding in encodings_to_try:
                    try:
                        rtf_string = file_content.decode(encoding)
                        successful_encoding = encoding
                        print(f"Successfully decoded RTF file {file_name} using {encoding} encoding")
                        break
                    except UnicodeDecodeError as e:
                        print(f"Failed to decode RTF file {file_name} with {encoding} encoding: {e}")
                        continue
                    except Exception as e:
                        print(f"Unexpected error decoding RTF file {file_name} with {encoding}: {e}")
                        continue
                
                if rtf_string is None:
                    # If all encodings fail, try with different error handling strategies
                    print(f"All encoding attempts failed for {file_name}, trying fallback methods")
                    
                    try:
                        # Try with 'replace' errors
                        rtf_string = file_content.decode('utf-8', errors='replace')
                        successful_encoding = 'utf-8 (with replacement)'
                        print(f"Used UTF-8 with character replacement for {file_name}")
                    except Exception as e:
                        try:
                            # Try with 'ignore' errors
                            rtf_string = file_content.decode('utf-8', errors='ignore')
                            successful_encoding = 'utf-8 (with ignore)'
                            print(f"Used UTF-8 with character ignore for {file_name}")
                        except Exception as e2:
                            # Last resort - treat as latin-1 which can decode any byte sequence
                            rtf_string = file_content.decode('latin-1')
                            successful_encoding = 'latin-1 (last resort)'
                            print(f"Used latin-1 as last resort for {file_name}")
                
                print(f"RTF file {file_name} decoded using: {successful_encoding}")
                
                # # Check if this actually looks like RTF content
                # if not rtf_string.strip().startswith('{\\rtf'):
                #     print(f"File {file_name} doesn't appear to be valid RTF format (doesn't start with {{\\rtf)")
                #     # Try to extract text anyway, but warn about potential issues
                
                # Extract text from RTF
                extracted_text = rtf_to_text(rtf_string)
                
                if not extracted_text or len(extracted_text.strip()) == 0:
                    print(f"RTF file {file_name}: no text extracted, possibly corrupted or empty")
                    return ""
                
                print(f"RTF file {file_name}: extracted {len(extracted_text)} chars")
                return normalize_whitespace(extracted_text)
                
            except Exception as e:
                print(f"Failed to parse RTF for file {file_name}: {e}")
                
                # Log some debug info about the file
                try:
                    print(f"File {file_name} size: {len(file_content)} bytes")
                    print(f"File {file_name} first 50 bytes (hex): {file_content[:50].hex()}")
                    print(f"File {file_name} first 50 bytes (repr): {repr(file_content[:50])}")
                except Exception as debug_e:
                    print(f"Could not log debug info for {file_name}: {debug_e}")
                
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
        print(f"Failed to process file {file_name}: {e}")
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
    print(f"Total tokens in text (after initial truncation): {total_length}")
    
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
        
        print(f"Successfully saved {len(points)} vectors to Qdrant for file {file_id}")
        
        # Update the cache file with the new processed file ID
        if USE_PROCESSED_FILES_CACHE and os.path.exists(PROCESSED_FILES_CACHE):
            try:
                with open(PROCESSED_FILES_CACHE, 'a') as f:
                    f.write(f"{str(file_id)}\n")
                print(f"Added {file_id} to processed files cache")
            except Exception as e:
                print(f"Failed to update processed files cache: {e}")
        
    except Exception as e:
        print(f"Failed saving to Qdrant: {e}")
        raise

def get_embeddings_batched(chunks: List[str], model, tokenizer, config: Dict[str, Any], gpu_id: int = 0) -> List[List[float]]:
    embeddings = []
    
    # Use batch size from config
    batch_size = config['processing']['batch_size']
    is_onnx = isinstance(model, ORTModelForFeatureExtraction)
    
    max_length = config['processing']['token_limit']
    
    # Set device for specific GPU
    device = f"cuda:{gpu_id}" if torch.cuda.is_available() else "cpu"
    print(f"GPU {gpu_id}: Processing {len(chunks)} chunks in batches of {batch_size} on {device}")
    
    print(f"GPU {gpu_id}: Using {'ONNX' if is_onnx else 'PyTorch'} model")
    
    for i in range(0, len(chunks), batch_size):
        batch = chunks[i:i + batch_size]
        batch_num = i//batch_size + 1
        total_batches = (len(chunks) + batch_size - 1) // batch_size
        print(f"GPU {gpu_id}: Processing batch {batch_num}/{total_batches} (size: {len(batch)})")
        
        try:
            # Clear cache before each batch for stability
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
                gc.collect()
            
            # Tokenize with padding and truncation
            encoded_input = tokenizer(
                batch,
                padding=True,
                truncation=True,
                max_length=max_length,
                return_tensors="pt"
            )
            
            # Move to appropriate device
            encoded_input = {k: v.to(device) for k, v in encoded_input.items()}
            
            # Generate embeddings
            with torch.no_grad():
                outputs = model(**encoded_input)
                
                # Handle different output formats for ONNX vs PyTorch
                if is_onnx:
                    # ONNX model might return different output format
                    if isinstance(outputs, dict) and 'last_hidden_state' in outputs:
                        batch_embeddings = outputs['last_hidden_state'][:, 0]
                    else:
                        # If outputs is a tensor directly
                        batch_embeddings = outputs[:, 0] if len(outputs.shape) == 3 else outputs
                    
                    # Convert to torch tensor if it's not already
                    if not isinstance(batch_embeddings, torch.Tensor):
                        batch_embeddings = torch.tensor(batch_embeddings, device=device)
                else:
                    # PyTorch model returns last_hidden_state
                    batch_embeddings = outputs.last_hidden_state[:, 0]
                
                # Normalize embeddings
                batch_embeddings = F.normalize(batch_embeddings, p=2, dim=1)
                embeddings.extend(batch_embeddings.cpu().numpy().tolist())
            
            # Clear memory
            del encoded_input, outputs, batch_embeddings
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            gc.collect()
            
            print(f"GPU {gpu_id}: Completed batch {batch_num}/{total_batches}")
            
        except Exception as e:
            print(f"GPU {gpu_id}: Error processing batch {batch_num}: {str(e)}")
            # For any CUDA errors, try to recover
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
                gc.collect()
            raise
    
    print(f"GPU {gpu_id}: Completed processing all {len(chunks)} chunks")
    return embeddings

def process_single_file_with_model(file_info: Tuple[uuid.UUID, str, str, str], model, tokenizer, config: Dict[str, Any], gpu_id: int = 0) -> bool:
    """Process a single file using pre-loaded model and tokenizer."""
    file_id, file_name, mime_type, cdn_path = file_info
    
    try:
        # Read file from local storage
        folder_path = config['local_storage']['folder_path']
        local_path = get_local_file_path(folder_path, file_id, file_name)
        
        if not os.path.exists(local_path) or os.path.getsize(local_path) == 0:
            error_msg = f"RTF file not found or empty: {local_path}"
            print(f"GPU {gpu_id}: ❌ {error_msg}")
            log_failed_file(file_id, file_name, cdn_path, error_msg, "processing_no_rtf_file")
            return False
        
        file_content = read_local_file(folder_path, file_id, file_name)
        processing_mime_type = "application/rtf"
        
        if not file_content:
            error_msg = "No content read from RTF file"
            print(f"GPU {gpu_id}: ❌ No content read from RTF file {file_id}")
            log_failed_file(file_id, file_name, cdn_path, error_msg, "processing_no_content")
            return False

        # Process the file content to get text
        text = process_file_content(file_content, file_name, processing_mime_type, tokenizer)
        
        if not text:
            error_msg = f"No text extracted from RTF file ({file_name}, {processing_mime_type})"
            print(f"GPU {gpu_id}: ❌ No text extracted from RTF file {file_id}")
            log_failed_file(file_id, file_name, cdn_path, error_msg, "processing_no_text")
            return False
        
        print(f"GPU {gpu_id}: ✓ Extracted {len(text)} characters")

        # Chunk the text
        chunks = list(chunk_text(text, tokenizer, config))
        
        if not chunks:
            error_msg = "No chunks generated for RTF file"
            print(f"GPU {gpu_id}: ❌ No chunks generated for RTF file {file_id}")
            log_failed_file(file_id, file_name, cdn_path, error_msg, "processing_no_chunks")
            return False
        
        print(f"GPU {gpu_id}: ✓ Generated {len(chunks)} chunks")

        # Get text only from chunks
        text_chunks = [chunk[0] for chunk in chunks]
        tokens_count = sum(chunk[2] - chunk[1] for chunk in chunks)
        print(f"GPU {gpu_id}: 📊 Total tokens: {tokens_count:,}")
        
        # Generate embeddings in batches
        try:
            embeddings = get_embeddings_batched(
                text_chunks,
                model,
                tokenizer,
                config,
                gpu_id
            )
            print(f"GPU {gpu_id}: ✅ Generated {len(embeddings)} embeddings")
        except Exception as e:
            error_msg = f"Error generating embeddings: {str(e)}"
            print(f"GPU {gpu_id}: ❌ Error generating embeddings: {str(e)}")
            log_failed_file(file_id, file_name, cdn_path, error_msg, "processing_embeddings")
            return False

        # Save to database
        try:
            save_to_qdrant(file_id, file_name, chunks, embeddings, config['embedding']['model_name'])
            print(f"GPU {gpu_id}: ✅ Saved to database")
            
            # Cleanup local file if configured to do so
            if config['local_storage'].get('cleanup_after_processing', False):
                cleanup_local_file(folder_path, file_id, file_name)
            
            return True
        except Exception as e:
            error_msg = f"Error saving to database: {str(e)}"
            print(f"GPU {gpu_id}: ❌ Error saving to database: {str(e)}")
            log_failed_file(file_id, file_name, cdn_path, error_msg, "processing_database")
            return False

    except Exception as e:
        error_msg = f"Error processing RTF file: {str(e)}"
        print(f"GPU {gpu_id}: ❌ Error processing RTF file {file_id}: {str(e)}")
        log_failed_file(file_id, file_name, cdn_path, error_msg, "processing_general")
        return False

def gpu_worker_process(gpu_id: int, input_queue: Queue, progress_queue: Queue, config_dict: dict):
    """Worker process that processes files on a specific GPU."""
    
    try:
        # Set environment variables for CUDA debugging
        os.environ['CUDA_LAUNCH_BLOCKING'] = '1'
        os.environ['TORCH_USE_CUDA_DSA'] = '1'
        
        print(f"🚀 GPU {gpu_id}: Initializing worker process (PID: {os.getpid()})")
        
        # Set GPU device for this process
        if torch.cuda.is_available() and gpu_id < torch.cuda.device_count():
            torch.cuda.set_device(gpu_id)
            print(f"GPU {gpu_id}: Set CUDA device to {gpu_id}")
        
        # Load model and tokenizer for this GPU
        model_name = 'BAAI/bge-large-en-v1.5'
        print(f"GPU {gpu_id}: Loading tokenizer...")
        tokenizer = AutoTokenizer.from_pretrained(model_name, use_fast=True)
        
        # Set device for this GPU
        device = f"cuda:{gpu_id}" if torch.cuda.is_available() and gpu_id < torch.cuda.device_count() else "cpu"
        print(f"GPU {gpu_id}: Loading model on device {device}...")
        
        # Try PyTorch model first (more stable than ONNX in multiprocessing)
        try:
            model = AutoModel.from_pretrained(model_name)
            if "cuda" in device:
                model = model.to(device)
            print(f"GPU {gpu_id}: ✓ PyTorch model loaded successfully")
        except Exception as e:
            print(f"GPU {gpu_id}: ❌ Failed to load PyTorch model: {e}")
            progress_queue.put(('error', gpu_id, f"Failed to load model: {e}"))
            return
        
        print(f"GPU {gpu_id}: ✅ Worker process ready")
        progress_queue.put(('ready', gpu_id, 'Worker process initialized'))
        
        # Process files from queue
        files_processed = 0
        while True:
            try:
                # Get file from queue (blocking)
                try:
                    file_info = input_queue.get(timeout=5.0)
                except:
                    # Check if queue is empty and we should exit
                    if input_queue.empty():
                        print(f"GPU {gpu_id}: No more files to process")
                        break
                    continue
                
                if file_info is None:  # Shutdown signal
                    print(f"GPU {gpu_id}: Received shutdown signal")
                    break
                
                file_id, file_name, mime_type, cdn_path = file_info
                print(f"GPU {gpu_id}: 📄 Processing {file_name}")
                
                # Send progress update
                progress_queue.put(('started', gpu_id, file_name))
                
                # Process the file
                try:
                    success = process_single_file_with_model(
                        file_info, model, tokenizer, config_dict, gpu_id
                    )
                    
                    files_processed += 1
                    
                    if success:
                        print(f"GPU {gpu_id}: ✅ Completed {file_name}")
                        progress_queue.put(('completed', gpu_id, file_info))
                    else:
                        print(f"GPU {gpu_id}: ❌ Failed {file_name}")
                        progress_queue.put(('failed', gpu_id, file_info))
                        
                except Exception as e:
                    print(f"GPU {gpu_id}: ❌ Error processing {file_name}: {e}")
                    progress_queue.put(('failed', gpu_id, file_info))
                
                # Clear memory after each file
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                    gc.collect()
                
            except Exception as e:
                print(f"GPU {gpu_id}: ❌ Worker process error: {e}")
                progress_queue.put(('error', gpu_id, str(e)))
        
        print(f"GPU {gpu_id}: 🏁 Worker process shutting down (processed {files_processed} files)")
        progress_queue.put(('shutdown', gpu_id, files_processed))
        
    except Exception as e:
        print(f"GPU {gpu_id}: ❌ Worker process setup failed: {e}")
        progress_queue.put(('error', gpu_id, f"Process setup failed: {e}"))

async def process_files_dual_gpu_multiprocessing(unprocessed_files: List[Tuple[uuid.UUID, str, str, str]], processed_file_ids: set):
    """Process files using both GPUs with separate processes and progress tracking."""
    global total_files_processed
    
    print(f"=== DUAL GPU MULTIPROCESSING ===")
    
    # Check GPU availability
    if not torch.cuda.is_available():
        print("No CUDA available, falling back to sequential processing")
        await process_files_sequentially(unprocessed_files, processed_file_ids)
        return
    
    gpu_count = torch.cuda.device_count()
    print(f"Found {gpu_count} GPU(s) available")
    
    if gpu_count < 2:
        print("Less than 2 GPUs available, falling back to sequential processing")
        await process_files_sequentially(unprocessed_files, processed_file_ids)
        return
    
    # Load config
    config = load_config()
    
    # Create multiprocessing queues
    input_queue = Queue()
    progress_queue = Queue()
    
    # Add all files to the input queue
    for file_info in unprocessed_files:
        input_queue.put(file_info)
    
    print(f"Added {len(unprocessed_files)} files to processing queue")
    
    # Start worker processes for GPU 0 and GPU 1
    processes = []
    for gpu_id in [0, 1]:
        process = Process(
            target=gpu_worker_process,
            args=(gpu_id, input_queue, progress_queue, config),
            name=f"GPU-{gpu_id}-Worker"
        )
        process.start()
        processes.append((process, gpu_id))
        print(f"Started worker process for GPU {gpu_id} (PID: {process.pid})")
    
    # Monitor progress with tqdm
    completed_files = 0
    failed_files = 0
    active_workers = len(processes)
    
    # Create progress bar
    pbar = tqdm(total=len(unprocessed_files), desc="Processing files", unit="files")
    
    print(f"Monitoring progress...")
    
    while completed_files + failed_files < len(unprocessed_files) and active_workers > 0:
        try:
            # Get progress update (non-blocking with timeout)
            try:
                message_type, gpu_id, data = progress_queue.get(timeout=2.0)
            except:
                # Check if processes are still alive
                alive_count = sum(1 for proc, _ in processes if proc.is_alive())
                if alive_count == 0:
                    print("All worker processes have terminated")
                    break
                continue
            
            if message_type == 'ready':
                print(f"✅ GPU {gpu_id}: {data}")
            
            elif message_type == 'started':
                file_name = data
                pbar.set_description(f"Processing {file_name[:30]}...")
            
            elif message_type == 'completed':
                file_info = data
                completed_files += 1
                total_files_processed += 1
                processed_file_ids.add(str(file_info[0]))
                pbar.update(1)
                pbar.set_description(f"Completed: {completed_files}, Failed: {failed_files}")
                print_processing_stats()
            
            elif message_type == 'failed':
                file_info = data
                failed_files += 1
                pbar.update(1)
                pbar.set_description(f"Completed: {completed_files}, Failed: {failed_files}")
            
            elif message_type == 'shutdown':
                files_count = data
                print(f"✅ GPU {gpu_id}: Processed {files_count} files, shutting down")
                active_workers -= 1
            
            elif message_type == 'error':
                error_msg = data
                print(f"❌ GPU {gpu_id}: Error - {error_msg}")
                # Don't reduce active workers for errors, let them retry
                
        except KeyboardInterrupt:
            print("Received interrupt signal, shutting down...")
            break
    
    pbar.close()
    
    # Signal processes to shutdown by adding None to queue
    for _ in processes:
        input_queue.put(None)
    
    # Wait for all processes to complete
    for process, gpu_id in processes:
        process.join(timeout=30.0)
        if process.is_alive():
            print(f"Warning: GPU {gpu_id} process did not shut down gracefully, terminating...")
            process.terminate()
            process.join(timeout=5.0)
        print(f"GPU {gpu_id} process finished with exit code: {process.exitcode}")
    
    print(f"🎉 DUAL GPU PROCESSING COMPLETED")
    print(f"Successfully processed: {completed_files}/{len(unprocessed_files)} files")
    print(f"Failed: {failed_files}/{len(unprocessed_files)} files")

# Remove the old threading function and replace with multiprocessing
async def process_files_dual_gpu_threaded(unprocessed_files: List[Tuple[uuid.UUID, str, str, str]], processed_file_ids: set):
    """Redirect to multiprocessing implementation."""
    await process_files_dual_gpu_multiprocessing(unprocessed_files, processed_file_ids)

async def process_files_sequentially(unprocessed_files: List[Tuple[uuid.UUID, str, str, str]], processed_file_ids: set):
    """Process files sequentially with single model loading (fallback)."""
    global total_files_processed
    
    print(f"=== PROCESSING {len(unprocessed_files)} FILES SEQUENTIALLY ===")
    
    # Load config once
    config = load_config()
    
    # Load model and tokenizer once for the entire session
    model_name = 'BAAI/bge-large-en-v1.5'
    print(f"Loading tokenizer...")
    tokenizer = AutoTokenizer.from_pretrained(model_name, use_fast=True)
    
    # Initialize model
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Loading model on device {device}...")
    
    try:
        model = ORTModelForFeatureExtraction.from_pretrained(
            model_name,
            revision="refs/pr/13",
            file_name="model.onnx",
            provider="CUDAExecutionProvider" if torch.cuda.is_available() else "CPUExecutionProvider"
        )
        print(f"✓ ONNX model loaded successfully on {device}")
    except Exception as e:
        print(f"⚠️ Failed to load ONNX model on {device}: {e}")
        print(f"Falling back to regular PyTorch model on {device}")
        model = AutoModel.from_pretrained(model_name)
        if torch.cuda.is_available():
            model = model.to(device)
        print(f"✓ PyTorch model loaded on {device}")
    
    print(f"✅ Setup complete, starting file processing...")
    print(f"")
    
    # Process all files sequentially
    for file_idx, file_info in enumerate(unprocessed_files):
        file_id, file_name, mime_type, cdn_path = file_info
        
        print(f"📄 Processing file {file_idx + 1}/{len(unprocessed_files)}: {file_name}")
        
        try:
            result = process_single_file_with_model(
                file_info, model, tokenizer, config, 0  # Use GPU 0 for sequential
            )
            
            if result:
                total_files_processed += 1
                processed_file_ids.add(str(file_id))
                print(f"✅ File {file_idx + 1}/{len(unprocessed_files)} completed successfully")
            else:
                print(f"❌ File {file_idx + 1}/{len(unprocessed_files)} failed")
                
            print_processing_stats()
                
        except Exception as e:
            print(f"❌ Error processing file {file_name}: {e}")
            log_failed_file(file_id, file_name, cdn_path, str(e), "processing_general")
        
        print(f"")
    
    print(f"🎉 SEQUENTIAL PROCESSING COMPLETED")
    print(f"Successfully processed: {total_files_processed} files")

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
                f.write("timestamp\tfailure_type\tfile_id\tfile_name\tcdn_path\terror_message\n")
            logger.info(f"Created failed files log: {FAILED_FILES_LOG}")
        except Exception as e:
            logger.warning(f"Could not create failed files log: {e}")
    
    # Configure PyTorch
    config = load_config()
    torch.set_float32_matmul_precision("high")
    
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
                    
                    # Filter files that are available locally and not yet processed
                    folder_path = config['local_storage']['folder_path']
                    locally_available_files = []
                    unprocessed_files = []
                    processed_count = 0
                    not_local_count = 0
                    
                    # Add progress bar for checking local file availability
                    print("Checking local file availability...")
                    for file_info in tqdm(all_files, desc="Checking files", unit="files"):
                        file_id_str = str(file_info[0])
                        
                        # Check if RTF file exists locally
                        local_path = get_local_file_path(folder_path, file_info[0], file_info[1])
                        if not os.path.exists(local_path) or os.path.getsize(local_path) == 0:
                            not_local_count += 1
                            continue
                        
                        locally_available_files.append(file_info)
                        
                        # Check if already processed
                        if file_id_str in processed_file_ids:
                            processed_count += 1
                        else:
                            unprocessed_files.append(file_info)
                    
                    logger.info(f"Files available locally: {len(locally_available_files)}")
                    logger.info(f"Files not available locally (no RTF file): {not_local_count}")
                    logger.info(f"Locally available files already processed: {processed_count}")
                    logger.info(f"Locally available files needing processing: {len(unprocessed_files)}")
                    
                    if not unprocessed_files:
                        if not_local_count > 0:
                            logger.info(f"No unprocessed files found. {not_local_count} files need RTF files in local storage.")
                            logger.info("Run download_files.py to download files and convert to RTF format.")
                        else:
                            logger.info("No unprocessed files found. All local RTF files have been processed.")
                        logger.info("Waiting 60 seconds before checking again...")
                        await asyncio.sleep(60)  # Wait 60 seconds before checking again
                        continue
                    
                    logger.info(f"=== PROCESSING {len(unprocessed_files)} FILES WITH DUAL GPU MULTIPROCESSING ===")
                    
                    # Check available GPUs
                    if torch.cuda.is_available():
                        gpu_count = torch.cuda.device_count()
                        logger.info(f"Found {gpu_count} GPU(s) available")
                        if gpu_count >= 2:
                            logger.info("Using dual GPU multiprocessing with progress tracking")
                        else:
                            logger.info("Only 1 GPU available, using sequential processing")
                    else:
                        logger.info("No CUDA GPUs available, using CPU")
                    
                    # Process files with dual GPU multiprocessing
                    await process_files_dual_gpu_multiprocessing(unprocessed_files, processed_file_ids)
                    
                    # Save updated processed file IDs to cache
                    save_processed_file_ids(processed_file_ids)
                    
                    logger.info(f"Completed processing all {len(unprocessed_files)} files")
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