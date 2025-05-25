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
from datetime import datetime
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

# Setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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
    
    async with httpx.AsyncClient(timeout=60.0) as client:
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
                rtf_string = file_content.decode('utf-8', errors='ignore')  
                return normalize_whitespace(rtf_to_text(rtf_string))
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
        
    except Exception as e:
        logger.error(f"Failed saving to Qdrant: {e}", exc_info=True)
        raise

def get_embeddings_batched(chunks: List[str], model, tokenizer, config: Dict[str, Any]) -> List[List[float]]:
    embeddings = []
    batch_size = config['processing']['batch_size']
    max_length = config['processing']['token_limit']  # Use from config
    
    logger.info(f"Processing {len(chunks)} chunks in batches of {batch_size}")
    
    # Determine device
    device = "cuda" if torch.cuda.is_available() else "cpu"  
    logger.info(f"Using device: {device}")
    
    # Check if we're using ONNX model
    is_onnx = isinstance(model, ORTModelForFeatureExtraction)
    logger.info(f"Using {'ONNX' if is_onnx else 'PyTorch'} model")
    
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
                max_length=max_length,  # Use config value
                return_tensors="pt"
            )
            logger.info(f"Input shape: {encoded_input['input_ids'].shape}")
            
            # Move to appropriate device
            encoded_input = {k: v.to(device) for k, v in encoded_input.items()}
            
            # Generate embeddings
            logger.info(f"Generating embeddings for batch {i//batch_size + 1}")
            with torch.no_grad():
                outputs = model(**encoded_input)
                logger.info(f"Model output type: {type(outputs)}")
                if isinstance(outputs, dict):
                    logger.info(f"Model output keys: {outputs.keys()}")
                
                # Handle different output formats for ONNX vs PyTorch
                if is_onnx:
                    # ONNX model might return different output format
                    if isinstance(outputs, dict) and 'last_hidden_state' in outputs:
                        logger.info("Using last_hidden_state from ONNX output")
                        batch_embeddings = outputs['last_hidden_state'][:, 0]
                    else:
                        logger.info("Using direct ONNX output")
                        # If outputs is a tensor directly
                        batch_embeddings = outputs[:, 0] if len(outputs.shape) == 3 else outputs
                    
                    # Convert to torch tensor if it's not already
                    if not isinstance(batch_embeddings, torch.Tensor):
                        logger.info("Converting ONNX output to torch tensor")
                        batch_embeddings = torch.tensor(batch_embeddings, device=device)
                else:
                    # PyTorch model returns last_hidden_state
                    logger.info("Using PyTorch model output")
                    batch_embeddings = outputs.last_hidden_state[:, 0]
                
                logger.info(f"Embeddings shape before normalization: {batch_embeddings.shape}")
                # Normalize embeddings
                batch_embeddings = F.normalize(batch_embeddings, p=2, dim=1)
                logger.info(f"Embeddings shape after normalization: {batch_embeddings.shape}")
                # Move embeddings to CPU before converting to numpy
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
    
    logger.info(f"Completed processing all {len(chunks)} chunks")
    return embeddings

async def process_files_batch(file_batch: List[Tuple[uuid.UUID, str, str, str]], model, tokenizer, config: Dict[str, Any]):
    """Process a batch of files by downloading from CDN and generating embeddings."""
    for file_id, file_name, mime_type, cdn_path in file_batch:
        logger.info(f"Processing file {file_id} ({file_name}) with mime type: {mime_type}")
        
        try:
            # Download file from CDN
            logger.info(f"Downloading file from CDN: {file_name}")
            file_content = await download_file_from_cdn(cdn_path, file_name)
            
            if not file_content:
                logger.error(f"No content downloaded for file {file_id}")
                continue

            # Process the file content to get text
            logger.info(f"Extracting text from file {file_id}")
            text = process_file_content(file_content, file_name, mime_type, tokenizer)
            if not text:
                logger.error(f"No text extracted from file {file_id}")
                continue
            logger.info(f"Extracted {len(text)} characters from file {file_id}")

            # Chunk the text
            logger.info(f"Chunking text for file {file_id}")
            chunks = list(chunk_text(text, tokenizer, config))
            
            if not chunks:
                logger.error(f"No chunks generated for file {file_id}")
                continue
            logger.info(f"Generated {len(chunks)} chunks for file {file_id}")

            # Get text only from chunks
            text_chunks = [chunk[0] for chunk in chunks]
            logger.info(f"Average chunk length: {sum(len(c) for c in text_chunks) / len(text_chunks):.2f} characters")
            
            # Generate embeddings in batches
            logger.info(f"Generating embeddings for file {file_id}")
            try:
                embeddings = get_embeddings_batched(
                    text_chunks,
                    model,
                    tokenizer,
                    config
                )
                logger.info(f"Generated {len(embeddings)} embeddings for file {file_id}")
            except Exception as e:
                logger.error(f"Error generating embeddings for file {file_id}: {str(e)}", exc_info=True)
                raise

            # Save to database
            logger.info(f"Saving embeddings to database for file {file_id}")
            try:
                save_to_qdrant(file_id, file_name, chunks, embeddings, config['embedding']['model_name'])
                logger.info(f"Successfully processed file {file_id}")
            except Exception as e:
                logger.error(f"Error saving to database for file {file_id}: {str(e)}", exc_info=True)
                raise

        except Exception as e:
            logger.error(f"Error processing file {file_id}: {str(e)}", exc_info=True)
            continue

async def main():
    # Configure PyTorch
    config = load_config()
    os.environ["PYTORCH_CUDA_ALLOC_CONF"] = f"max_split_size_mb:{config['processing']['cuda_memory_mb']},expandable_segments:True"
    torch.set_float32_matmul_precision("high")
    if torch.cuda.is_available():
        torch.cuda.empty_cache()

    # Initialize model and tokenizer
    logger.info("Loading model and tokenizer...")
    model_name = 'BAAI/bge-large-en-v1.5'
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    
    # Initialize ONNX model
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

    # Get processed file IDs from Qdrant
    client, collection_name = get_qdrant_client()
    
    try:
        processed_file_ids = set()
        scroll_result = client.scroll(
            collection_name=collection_name,
            limit=10000,
            with_payload=["file_id"]
        )
        
        for point in scroll_result[0]:
            if point.payload and "file_id" in point.payload:
                processed_file_ids.add(point.payload["file_id"])
        
        logger.info(f"Found {len(processed_file_ids)} already processed files in Qdrant")
        
    except Exception as e:
        logger.error(f"Error getting processed files from Qdrant: {e}")
        processed_file_ids = set()

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
            
            # Filter out already processed files
            unprocessed_files = [
                file_info for file_info in all_files 
                if str(file_info[0]) not in processed_file_ids
            ]
    finally:
        conn.close()

    if not unprocessed_files:
        logger.info("No unprocessed files found.")
        return

    logger.info(f"Found {len(unprocessed_files)} unprocessed files")

    # Process files in batches
    for i in range(0, len(unprocessed_files), config['processing']['batch_size']):
        file_batch = unprocessed_files[i:i + config['processing']['batch_size']]
        await process_files_batch(file_batch, model, tokenizer, config)

    logger.info("All files processed successfully")

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())