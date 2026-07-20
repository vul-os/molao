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
from typing import List, Tuple, Dict, Any
from transformers import AutoTokenizer, AutoModel
from striprtf.striprtf import rtf_to_text
import docx
import fitz
import json

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

def process_file(file_path: str, mime_type: str, tokenizer, config) -> List[Tuple[str, int, int]]:
    text = ""
    try:
        if mime_type == "application/rtf":
            with open(file_path, "rb") as f:
                raw_rtf = f.read()
            try:
                # decode bytes to string first
                rtf_string = raw_rtf.decode('utf-8', errors='ignore')  
                text = rtf_to_text(rtf_string)
            except Exception as e:
                logger.error(f"Failed to parse RTF for file {file_path}: {e}")
                return []
        elif mime_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
            doc = docx.Document(file_path)
            text = "\n\n".join([para.text for para in doc.paragraphs])
        elif mime_type == "application/pdf":
            with fitz.open(file_path) as doc:
                for page in doc:
                    text += page.get_text()
        else:
            with open(file_path, 'r', encoding='utf-8') as f:
                text = f.read()
    except Exception as e:
        logger.error(f"Failed to process file {file_path}: {e}")
        return []

    text = normalize_whitespace(text)

    if not text:
        logger.error(f"File {file_path} resulted in empty text after processing. Skipping.")
        return []

    tokens = tokenizer.encode(text, add_special_tokens=False)
    stride = config['processing']['stride']
    token_limit = config['processing']['token_limit']
    chunks = []

    # Ensure chunks do not exceed token limit
    for start in range(0, len(tokens), stride):
        end = min(start + token_limit, len(tokens))
        chunk_tokens = tokens[start:end]
        chunk_text = tokenizer.decode(chunk_tokens, skip_special_tokens=True)
        chunks.append((chunk_text, start, end))
        if end == len(tokens):  # Stop if we've reached the end of the tokens
            break

    return chunks

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
                INSERT INTO file_vectors_small (file_id, model, embedding, chunk_start, chunk_end, metadata)
                VALUES %s
            """, data)
            conn.commit()
    except Exception as e:
        logger.error(f"Failed saving to database: {e}", exc_info=True)
        conn.rollback()
    finally:
        conn.close()

def get_embeddings_batched(chunks: List[str], tokenizer, model, batch_size: int, device: str) -> List[List[float]]:
    model = model.to(device)
    model.eval()
    embeddings = []
    for i in range(0, len(chunks), batch_size):
        batch = chunks[i:i+batch_size]
        inputs = tokenizer(batch, padding=True, truncation=True, return_tensors="pt", max_length=512)
        inputs = {k: v.to(device) for k, v in inputs.items()}
        with torch.no_grad():
            model_out = model(**inputs)
            pooled = F.normalize(model_out.last_hidden_state[:, 0], p=2, dim=1)
            embeddings.extend(pooled.cpu().tolist())
        del inputs
        torch.cuda.empty_cache()
        gc.collect()
    return embeddings

def main():
    os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "max_split_size_mb:64,expandable_segments:True"
    torch.set_float32_matmul_precision("high")
    torch.cuda.empty_cache()

    config = load_config()
    device = config['embedding']['device']

    model_name = config['embedding']['model_name']
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    model = AutoModel.from_pretrained(model_name)

    priority_file_id = uuid.UUID("85da823b-6474-4b1e-982c-06752b43b327")

    # Step 1: Handle priority file first
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM file_vectors_small WHERE file_id = %s", (str(priority_file_id),))
            exists = cur.fetchone()[0] > 0
    finally:
        conn.close()

    if not exists:
        logger.info(f"Priority file {priority_file_id} not embedded yet. Processing it first...")
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT id, cdn_path, mime_type FROM files WHERE id = %s", (str(priority_file_id),))
                priority_file = cur.fetchone()
        finally:
            conn.close()

        if priority_file:
            file_id, cdn_path, mime_type = priority_file
            local_path = f"temp_{file_id}.bin"

            if download_file(cdn_path, local_path):
                chunks = process_file(local_path, mime_type, tokenizer, config)
                text_chunks = [chunk for chunk, _, _ in chunks]

                embeddings = get_embeddings_batched(
                    [f"search_document: {t}" for t in text_chunks],
                    tokenizer,
                    model,
                    config['processing']['batch_size'],
                    device
                )

                save_to_database(file_id, chunks, embeddings, model_name)
                os.remove(local_path)
                logger.info(f"Priority file {file_id} processed successfully.")
            else:
                logger.error(f"Failed to download priority file {file_id}. Skipping.")
        else:
            logger.error(f"Priority file {priority_file_id} not found in 'files' table.")
    else:
        logger.info(f"Priority file {priority_file_id} already embedded. Skipping.")

    # Step 2: Get all processed file IDs and find files that haven't been processed
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM files")
            files = cur.fetchall()

            cur.execute("SELECT DISTINCT file_id FROM file_vectors_small")
            processed_files = {row[0] for row in cur.fetchall()}
    finally:
        conn.close()

    # Filter files that have not been processed
    unprocessed_files = [file_id for file_id, in files if file_id not in processed_files]

    if not unprocessed_files:
        logger.info("No unprocessed files found.")
        return

    logger.info(f"Found {len(unprocessed_files)} unprocessed files.")

    # Step 3: Process unprocessed files
    for file_id in unprocessed_files:
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT cdn_path, mime_type FROM files WHERE id = %s", (str(file_id),))
                file = cur.fetchone()
        finally:
            conn.close()

        if file:
            cdn_path, mime_type = file
            local_path = f"temp_{file_id}.bin"

            logger.info(f"Processing file {file_id}...")
            if not download_file(cdn_path, local_path):
                logger.error(f"Download failed for file {file_id}. Skipping.")
                continue

            chunks = process_file(local_path, mime_type, tokenizer, config)
            text_chunks = [chunk for chunk, _, _ in chunks]

            embeddings = get_embeddings_batched(
                [f"search_document: {t}" for t in text_chunks],
                tokenizer,
                model,
                config['processing']['batch_size'],
                device
            )

            save_to_database(file_id, chunks, embeddings, model_name)
            os.remove(local_path)
            logger.info(f"File {file_id} processed.")

    logger.info("All unprocessed files processed.")


if __name__ == "__main__":
    main()
