import runpod
import torch
import torch.nn.functional as F
import os
import logging
from transformers import AutoTokenizer, AutoModel, AutoModelForSequenceClassification
from typing import List, Dict, Optional
from pathlib import Path

# ---------- Logging Setup ----------
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
logger.info("Starting RunPod handler...")

# Configure PyTorch for GPU usage if available
cuda_memory_mb = 16384  # 16GB, can be overridden by environment variable
os.environ["PYTORCH_CUDA_ALLOC_CONF"] = f"max_split_size_mb:{os.environ.get('CUDA_MEMORY_MB', cuda_memory_mb)},expandable_segments:True"
torch.set_float32_matmul_precision("high")
if torch.cuda.is_available():
    torch.cuda.empty_cache()
    logger.info("CUDA is available, GPU will be used for computation")
else:
    logger.info("CUDA is not available, using CPU for computation")

# Update model paths to use mounted directory
LOCAL_MODEL_DIR = Path("/models")  # Mounted directory

EMBEDDING_MODEL_PATH = LOCAL_MODEL_DIR / "bge-large-en-v1.5"
RERANKER_MODEL_PATH = LOCAL_MODEL_DIR / "bge-reranker-large"

# Add debug logging for model paths
logger.info(f"Model directory: {LOCAL_MODEL_DIR}")
logger.info(f"Model directory exists: {LOCAL_MODEL_DIR.exists()}")
if LOCAL_MODEL_DIR.exists():
    logger.info(f"Model directory contents: {os.listdir(LOCAL_MODEL_DIR)}")
logger.info(f"Embedding model name: {EMBEDDING_MODEL_PATH}")
logger.info(f"Reranker model name: {RERANKER_MODEL_PATH}")

# ---------- Device ----------
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
logger.info(f"Using device: {device}")

# ---------- Lazy Model Globals ----------
embedding_tokenizer = None
embedding_model = None
reranker_tokenizer = None
reranker_model = None

def get_embedding_model():
    global embedding_tokenizer, embedding_model
    if embedding_tokenizer is None or embedding_model is None:
        logger.info("Loading embedding model...")
        try:
            # Load from local directory if it exists, otherwise download from HuggingFace
            if EMBEDDING_MODEL_PATH.exists():
                logger.info(f"Loading from local path: {EMBEDDING_MODEL_PATH}")
                embedding_tokenizer = AutoTokenizer.from_pretrained(
                    str(EMBEDDING_MODEL_PATH),
                    local_files_only=True,
                    trust_remote_code=True
                )
                embedding_model = AutoModel.from_pretrained(
                    str(EMBEDDING_MODEL_PATH),
                    local_files_only=True,
                    trust_remote_code=True
                ).to(device)
            else:
                logger.info(f"Local path not found, downloading from HuggingFace: BAAI/bge-large-en-v1.5")
                embedding_tokenizer = AutoTokenizer.from_pretrained(
                    "BAAI/bge-large-en-v1.5",
                    trust_remote_code=True
                )
                embedding_model = AutoModel.from_pretrained(
                    "BAAI/bge-large-en-v1.5",
                    trust_remote_code=True
                ).to(device)
            embedding_model.eval()
        except Exception as e:
            logger.error(f"Error loading embedding model: {str(e)}")
            raise
    return embedding_tokenizer, embedding_model

def get_reranker_model():
    global reranker_tokenizer, reranker_model
    if reranker_tokenizer is None or reranker_model is None:
        logger.info("Loading reranker model...")
        try:
            # Load from local directory if it exists, otherwise download from HuggingFace
            if RERANKER_MODEL_PATH.exists():
                logger.info(f"Loading from local path: {RERANKER_MODEL_PATH}")
                reranker_tokenizer = AutoTokenizer.from_pretrained(
                    str(RERANKER_MODEL_PATH),
                    local_files_only=True,
                    trust_remote_code=True
                )
                reranker_model = AutoModelForSequenceClassification.from_pretrained(
                    str(RERANKER_MODEL_PATH),
                    local_files_only=True,
                    trust_remote_code=True
                ).to(device)
            else:
                logger.info(f"Local path not found, downloading from HuggingFace: BAAI/bge-reranker-large")
                reranker_tokenizer = AutoTokenizer.from_pretrained(
                    "BAAI/bge-reranker-large",
                    trust_remote_code=True
                )
                reranker_model = AutoModelForSequenceClassification.from_pretrained(
                    "BAAI/bge-reranker-large",
                    trust_remote_code=True
                ).to(device)
            reranker_model.eval()
        except Exception as e:
            logger.error(f"Error loading reranker model: {str(e)}")
            raise
    return reranker_tokenizer, reranker_model

# ---------- Embedding Logic ----------
def embed_texts(texts: List[str], prefix: str = "") -> torch.Tensor:
    tokenizer, model = get_embedding_model()
    prefixed = [f"{prefix}{t}" for t in texts]
    inputs = tokenizer(
        prefixed,
        return_tensors="pt",
        padding=True,
        truncation=True,
        max_length=512,
    )
    inputs = {k: v.to(device) for k, v in inputs.items()}
    with torch.no_grad():
        outputs = model(**inputs)
        embeddings = outputs.last_hidden_state[:, 0]
        embeddings = F.normalize(embeddings, p=2, dim=1)
    return embeddings.cpu()

# ---------- Rerank Logic ----------
def rerank(query: str, documents: List[Dict[str, str]]):
    tokenizer, model = get_reranker_model()
    pairs = []
    ids = []

    for doc in documents:
        doc_id = doc.get("id", "")
        doc_text = doc.get("text", "")
        pairs.append((query, doc_text))
        ids.append(doc_id)

    inputs = tokenizer.batch_encode_plus(
        pairs,
        padding=True,
        truncation=True,
        return_tensors="pt",
        max_length=512,
    )
    inputs = {k: v.to(device) for k, v in inputs.items()}
    with torch.no_grad():
        logits = model(**inputs).logits.squeeze(-1)
        # Apply sigmoid to convert logits to probabilities (0-1 range)
        # Then scale to 0-100 range for better readability
        scores = (torch.sigmoid(logits) * 100).cpu()

    results = []
    for i, (id_, text, score) in enumerate(zip(ids, [doc.get("text", "") for doc in documents], scores.tolist())):
        results.append({
            "id": id_,
            "text": text,
            "score": score
        })
    
    # Sort by score descending
    results = sorted(results, key=lambda x: x["score"], reverse=True)
    return results

def handler(event):
    """
    This function processes incoming requests to the RunPod endpoint.
    
    Args:
        event (dict): Contains the input data and request metadata
       
    Returns:
       dict: The result to be returned to the client
    """
    
    # Extract input data
    print(f"Worker Start")
    input_data = event.get('input', {})
    
    # Determine operation
    operation = input_data.get('operation', 'embed')
    
    try:
        if operation == 'embed':
            # Handle embedding request
            texts = input_data.get('texts', [])
            prefix = input_data.get('prefix', '')
            
            if not texts:
                return {"error": "No texts provided for embedding"}
            
            logger.info(f"Generating embeddings for {len(texts)} texts")
            embeddings = embed_texts(texts, prefix)
            
            # Convert to list of lists
            embeddings_list = embeddings.tolist()
            
            return {
                "embeddings": embeddings_list,
                "count": len(embeddings_list)
            }
            
        elif operation == 'rerank':
            # Handle reranking request
            query = input_data.get('query', '')
            documents = input_data.get('documents', [])
            
            if not query:
                return {"error": "No query provided for reranking"}
                
            if not documents:
                return {"error": "No documents provided for reranking"}
                
            logger.info(f"Reranking {len(documents)} documents for query: {query}")
            reranked_results = rerank(query, documents)
            
            return {
                "results": reranked_results,
                "count": len(reranked_results)
            }
            
        else:
            return {"error": f"Unknown operation: {operation}"}
            
    except Exception as e:
        logger.error(f"Error processing request: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return {"error": str(e)}

# Start the Serverless function when the script is run
if __name__ == '__main__':
    runpod.serverless.start({'handler': handler})