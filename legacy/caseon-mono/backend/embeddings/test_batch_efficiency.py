#!/usr/bin/env python3
"""
Test script to verify batch efficiency improvements.
This script tests the new batching approach with a small subset of files.
"""

import asyncio
import time
import logging
from main import (
    load_config, 
    get_qdrant_client, 
    ensure_collection_exists,
    process_files_batch_optimized
)
from transformers import AutoTokenizer
from optimum.onnxruntime import ORTModelForFeatureExtraction
from transformers import AutoModel
import torch
import psycopg2

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def test_batch_efficiency():
    """Test the new batch processing efficiency."""
    logger.info("Starting batch efficiency test...")
    
    # Load config
    config = load_config()
    
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

    # Ensure Qdrant collection exists
    ensure_collection_exists()

    # Get a small sample of unprocessed files for testing
    conn = psycopg2.connect(config['database']['connection_string'])
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT f.id, f.file_name, f.mime_type, f.cdn_path 
                FROM files f 
                WHERE f.cdn_path IS NOT NULL
                LIMIT 5
            """)
            test_files = cur.fetchall()
    finally:
        conn.close()

    if not test_files:
        logger.warning("No test files found.")
        return

    logger.info(f"Testing with {len(test_files)} files")

    # Test the optimized batch processing
    start_time = time.time()
    await process_files_batch_optimized(test_files, model, tokenizer, config)
    total_time = time.time() - start_time
    
    logger.info(f"Test completed in {total_time:.2f}s")
    logger.info(f"Average time per file: {total_time/len(test_files):.2f}s")

if __name__ == "__main__":
    asyncio.run(test_batch_efficiency()) 