import os
import torch
from pathlib import Path
import logging
from google.cloud import storage

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Model paths
LOCAL_MODEL_DIR = Path("/models")
RAW_FILES_DIR = Path("/raw")

EMBEDDING_MODEL_NAME = "bge-large-en-v1.5"
RERANKER_MODEL_NAME = "bge-reranker-large"

EMBEDDING_MODEL_PATH = LOCAL_MODEL_DIR / EMBEDDING_MODEL_NAME
RERANKER_MODEL_PATH = LOCAL_MODEL_DIR / RERANKER_MODEL_NAME

def download_model_from_gcs(bucket_name, model_name, local_path):
    """Download model files from GCS bucket to local directory."""
    os.makedirs(local_path, exist_ok=True)
    client = storage.Client()
    bucket = client.bucket(bucket_name)
    
    logger.info(f"Downloading {model_name} from GCS bucket {bucket_name} to {local_path}")
    
    # List all blobs with the model prefix
    blobs = list(bucket.list_blobs(prefix=f"models/{model_name}/"))
    
    if not blobs:
        logger.warning(f"No files found for {model_name} in bucket {bucket_name}")
        return False
    
    # Download each file
    for blob in blobs:
        # Remove the "models/" prefix to get the local path
        destination_path = os.path.join(local_path, os.path.relpath(blob.name, f"models/{model_name}"))
        os.makedirs(os.path.dirname(destination_path), exist_ok=True)
        
        logger.info(f"Downloading {blob.name} to {destination_path}")
        blob.download_to_filename(destination_path)
    
    logger.info(f"Downloaded {len(blobs)} files for {model_name}")
    return True

def ensure_models_available():
    """Ensure models are available, downloading from GCS if necessary."""
    # GCS bucket where models are stored
    bucket_name = os.environ.get("MODEL_BUCKET", "your-model-bucket")
    
    # Check and download embedding model if needed
    if not EMBEDDING_MODEL_PATH.exists():
        logger.info(f"Embedding model not found locally, downloading from GCS")
        success = download_model_from_gcs(bucket_name, EMBEDDING_MODEL_NAME, EMBEDDING_MODEL_PATH)
        if not success:
            logger.warning(f"Failed to download embedding model, will use HuggingFace as fallback")
    
    # Check and download reranker model if needed
    if not RERANKER_MODEL_PATH.exists():
        logger.info(f"Reranker model not found locally, downloading from GCS")
        success = download_model_from_gcs(bucket_name, RERANKER_MODEL_NAME, RERANKER_MODEL_PATH)
        if not success:
            logger.warning(f"Failed to download reranker model, will use HuggingFace as fallback")
    
    # Create raw files directory
    os.makedirs(RAW_FILES_DIR, exist_ok=True)