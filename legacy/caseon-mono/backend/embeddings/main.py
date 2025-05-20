import os
import tomli
import psycopg2
from psycopg2.extras import execute_values
import uuid
import logging
import re
import requests
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
from optimum.onnxruntime import ORTModelForFeatureExtraction
from transformers import AutoModel

# Setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def load_config() -> Dict[str, Any]:
    with open("config.toml", "rb") as f:
        return tomli.load(f)

def get_db_connection():
    config = load_config()
    conn = psycopg2.connect(config['database']['connection_string'])
    conn.cursor().execute("SET statement_timeout = 0")
    return conn

def is_text_file(mime_type: str) -> bool:
    return mime_type.startswith("text/")

def normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()

def download_file(cdn_path: str, local_path: str) -> bool:
    try:
        if not cdn_path.startswith(('http://', 'https://')):
            cdn_path = f"https://{cdn_path}"
        resp = requests.get(cdn_path, stream=True)
        resp.raise_for_status()
        with open(local_path, 'wb') as f:
            for chunk in resp.iter_content(8192):
                f.write(chunk)
        return True
    except Exception as e:
        logger.error(f"Failed to download {cdn_path}: {e}")
        return False

def process_file(file_path: str, mime_type: str, tokenizer) -> str:
    try:
        if mime_type == "application/rtf":
            with open(file_path, "rb") as f:
                raw_rtf = f.read()
            try:
                rtf_string = raw_rtf.decode('utf-8', errors='ignore')  
                return normalize_whitespace(rtf_to_text(rtf_string))
            except Exception as e:
                logger.error(f"Failed to parse RTF for file {file_path}: {e}")
                return ""
        elif mime_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
            doc = docx.Document(file_path)
            return normalize_whitespace("\n\n".join([para.text for para in doc.paragraphs]))
        elif mime_type == "application/pdf":
            with fitz.open(file_path) as doc:
                text = "\n\n".join([page.get_text() for page in doc])
                return normalize_whitespace(text)
        else:
            with open(file_path, 'r', encoding='utf-8') as f:
                return normalize_whitespace(f.read())
    except Exception as e:
        logger.error(f"Failed to process file {file_path}: {e}")
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

def save_to_database(file_id: uuid.UUID, chunks: List[Tuple[str, int, int]], embeddings: List[List[float]], model_name: str):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            data = []
            now = datetime.utcnow().isoformat()
            for (chunk_text, start, end), embed in zip(chunks, embeddings):
                metadata = {
                    "tokens": end - start,
                    "chunk_text": chunk_text,
                    "start_token": start,
                    "end_token": end,
                    "created_at": now
                }
                data.append((file_id, model_name, embed, start, end, json.dumps(metadata)))

            execute_values(cur, """
                INSERT INTO file_vectors (file_id, model, embedding, chunk_start, chunk_end, metadata)
                VALUES %s
            """, data)
            conn.commit()
    except Exception as e:
        logger.error(f"Failed saving to database: {e}", exc_info=True)
        conn.rollback()
    finally:
        conn.close()

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
            logger.info(f"Input shape: {encoded_input['input_ids'].shape}")3
            
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

def process_files_batch(file_batch: List[Tuple[uuid.UUID, str, str]], model, tokenizer, config: Dict[str, Any]):
    for file_id, cdn_path, mime_type in file_batch:
        local_path = f"temp_{file_id}.bin"
        logger.info(f"Processing file {file_id} from {cdn_path} (mime type: {mime_type})")
        
        try:
            logger.info(f"Downloading file {file_id}")
            if not download_file(cdn_path, local_path):
                logger.error(f"Failed to download file {file_id}")
                continue

            # Process the file to get text
            logger.info(f"Extracting text from file {file_id}")
            text = process_file(local_path, mime_type, tokenizer)
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
                save_to_database(file_id, chunks, embeddings, config['embedding']['model_name'])
                logger.info(f"Successfully processed file {file_id}")
            except Exception as e:
                logger.error(f"Error saving to database for file {file_id}: {str(e)}", exc_info=True)
                raise

        except Exception as e:
            logger.error(f"Error processing file {file_id}: {str(e)}", exc_info=True)
            continue
        finally:
            if os.path.exists(local_path):
                os.remove(local_path)
                logger.info(f"Cleaned up temporary file for {file_id}")

def main():
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
            file_name="model.onnx",  # Updated path to match example
            provider="CUDAExecutionProvider" if torch.cuda.is_available() else "CPUExecutionProvider"
        )
        logger.info("ONNX model loaded successfully")
    except Exception as e:
        logger.error(f"Failed to load ONNX model: {e}")
        logger.info("Falling back to regular PyTorch model")
        model = AutoModel.from_pretrained(model_name)
        if torch.cuda.is_available():
            model = model.cuda()

    # Get unprocessed files
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT f.id, f.cdn_path, f.mime_type 
                FROM files f 
                LEFT JOIN file_vectors fv ON f.id = fv.file_id 
                WHERE fv.file_id IS NULL
            """)
            unprocessed_files = cur.fetchall()
    finally:
        conn.close()

    if not unprocessed_files:
        logger.info("No unprocessed files found.")
        return

    logger.info(f"Found {len(unprocessed_files)} unprocessed files")

    # Process files in batches
    for i in range(0, len(unprocessed_files), config['processing']['batch_size']):
        file_batch = unprocessed_files[i:i + config['processing']['batch_size']]
        process_files_batch(file_batch, model, tokenizer, config)

    logger.info("All files processed successfully")

if __name__ == "__main__":
    main()