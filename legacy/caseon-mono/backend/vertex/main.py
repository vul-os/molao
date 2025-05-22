from fastapi import FastAPI, Depends, Header, HTTPException, Response, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel
from typing import List, Dict, Optional
import torch
import torch.nn.functional as F
import os
import logging
from pathlib import Path
from google.cloud import storage
from transformers import AutoTokenizer, AutoModel, AutoModelForSequenceClassification
import uvicorn
import httpx
import json

# Import model loader
from model_loader import ensure_models_available, EMBEDDING_MODEL_PATH, RERANKER_MODEL_PATH, LOCAL_MODEL_DIR, RAW_FILES_DIR

# ---------- Logging Setup ----------
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
logger.info("Starting FastAPI service for Vertex AI...")

# ---------- Environment Setup ----------
# Configure PyTorch for GPU usage if available
cuda_memory_mb = 16384  # 16GB, can be overridden by environment variable
os.environ["PYTORCH_CUDA_ALLOC_CONF"] = f"max_split_size_mb:{os.environ.get('CUDA_MEMORY_MB', cuda_memory_mb)},expandable_segments:True"
torch.set_float32_matmul_precision("high")
if torch.cuda.is_available():
    torch.cuda.empty_cache()
    logger.info("CUDA is available, GPU will be used for computation")
else:
    logger.info("CUDA is not available, using CPU for computation")

# Download models at startup if not available
logger.info("Ensuring models are available...")
ensure_models_available()

# ---------- Device Setup ----------
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
            
            # Try to use ONNX if available for potentially better performance
            try:
                from optimum.onnxruntime import ORTModelForFeatureExtraction
                logger.info("Attempting to use ONNX optimization for embedding model")
                
                provider = "CUDAExecutionProvider" if torch.cuda.is_available() else "CPUExecutionProvider"
                embedding_model = ORTModelForFeatureExtraction.from_pretrained(
                    "BAAI/bge-large-en-v1.5",
                    revision="refs/pr/13",
                    file_name="model.onnx",
                    provider=provider
                )
                logger.info("Successfully loaded ONNX embedding model")
            except Exception as e:
                logger.info(f"Could not use ONNX optimization: {str(e)}. Using PyTorch model instead.")
                # We already have the PyTorch model loaded, so continue with that
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
            
            # Try to use ONNX if available for potentially better performance
            try:
                from optimum.onnxruntime import ORTModelForSequenceClassification
                logger.info("Attempting to use ONNX optimization for reranker model")
                
                provider = "CUDAExecutionProvider" if torch.cuda.is_available() else "CPUExecutionProvider"
                reranker_model = ORTModelForSequenceClassification.from_pretrained(
                    "BAAI/bge-reranker-large",
                    provider=provider
                )
                logger.info("Successfully loaded ONNX reranker model")
            except Exception as e:
                logger.info(f"Could not use ONNX optimization: {str(e)}. Using PyTorch model instead.")
                # We already have the PyTorch model loaded, so continue with that
        except Exception as e:
            logger.error(f"Error loading reranker model: {str(e)}")
            raise
    return reranker_tokenizer, reranker_model

# ---------- FastAPI App ----------
app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

# ---------- Request & Response Models ----------
class EmbeddingRequest(BaseModel):
    input: List[str]

class EmbeddingResponse(BaseModel):
    data: List[Dict[str, List[float]]]

class RerankRequest(BaseModel):
    query: str
    documents: List[Dict[str, str]]

class RerankedDocument(BaseModel):
    id: str
    text: str
    score: float

class RerankResponse(BaseModel):
    results: List[RerankedDocument]

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
def rerank(query: str, documents: List[Dict[str, str]]) -> List[RerankedDocument]:
    tokenizer, model = get_reranker_model()
    pairs = []
    ids = []

    for doc in documents:
        doc_id = doc.get("id", "unknown")
        file_name = doc.get("file_name", "Unknown Document")
        doc_text = doc.get("text", "")
        
        if file_name and doc_text:
            formatted_text = f"{file_name}\n\n{doc_text}"
        else:
            formatted_text = doc_text
            
        pairs.append((query, formatted_text))
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

    sorted_results = sorted(
        zip(ids, [doc.get("text", "") for doc in documents], scores.tolist()),
        key=lambda x: x[2],
        reverse=True,
    )

    return [
        RerankedDocument(id=id_, text=text, score=score)
        for id_, text, score in sorted_results
    ]

# ---------- Endpoints ----------
@app.post("/embeddings", response_model=EmbeddingResponse)
async def create_embeddings(request: EmbeddingRequest):
    """Generate embeddings for a list of texts."""
    embeddings = embed_texts(request.input)
    return EmbeddingResponse(
        data=[{"embedding": embedding.tolist()} for embedding in embeddings]
    )

@app.post("/rerank", response_model=RerankResponse)
async def rerank_documents(request: RerankRequest):
    """Rerank documents based on a query."""
    reranked_docs = rerank(request.query, request.documents)
    return RerankResponse(results=reranked_docs)

@app.post("/predict")
async def predict(request: dict):
    """
    Handle Vertex AI prediction requests.
    This endpoint accepts different types of requests:
    - Embedding requests
    - Reranking requests
    """
    try:
        # Handle the case where Vertex AI wraps the request
        if "instances" in request:
            # Vertex AI sends a list of instances, but we'll process just the first one
            instance = request["instances"][0] if isinstance(request["instances"], list) else request["instances"]
            request_type = instance.get("type", "embedding")
            
            if request_type == "embedding":
                # Handle embedding request
                texts = instance.get("texts", [])
                if not texts:
                    return {"error": "No input texts provided"}
                
                embeddings = embed_texts(texts).tolist()
                return {
                    "predictions": [
                        {"embedding": emb} for emb in embeddings
                    ]
                }
                
            elif request_type == "rerank":
                # Handle reranking request
                query = instance.get("query", "")
                documents = instance.get("documents", [])
                
                if not query or not documents:
                    return {"error": "Missing query or documents"}
                    
                reranked_docs = rerank(query, documents)
                return {
                    "predictions": [
                        {"id": doc.id, "text": doc.text, "score": float(doc.score)}
                        for doc in reranked_docs
                    ]
                }
        else:
            # Direct API call
            request_type = request.get("type", "embedding")
            
            if request_type == "embedding":
                texts = request.get("texts", [])
                if not texts:
                    return {"error": "No input texts provided"}
                
                embeddings = embed_texts(texts).tolist()
                return {
                    "data": [
                        {"embedding": emb} for emb in embeddings
                    ]
                }
                
            elif request_type == "rerank":
                query = request.get("query", "")
                documents = request.get("documents", [])
                
                if not query or not documents:
                    return {"error": "Missing query or documents"}
                    
                reranked_docs = rerank(query, documents)
                return {
                    "results": [
                        {"id": doc.id, "text": doc.text, "score": float(doc.score)}
                        for doc in reranked_docs
                    ]
                }
                
            return {"error": f"Unknown request type: {request_type}"}
            
    except Exception as e:
        logger.error(f"Error in predict endpoint: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return {"error": str(e)}

@app.get("/health")
def health_check():
    """Health check endpoint for Vertex AI."""
    return {"status": "healthy"}

@app.get("/")
def read_root():
    return {
        "message": "Embedding and Reranking API", 
        "endpoints": [
            "/embeddings - Generate embeddings for text",
            "/rerank - Rerank documents based on a query",
            "/predict - Vertex AI prediction endpoint",
            "/health - Health check endpoint"
        ]
    }

# ---------- Entrypoint ----------
if __name__ == "__main__":
    # Load models at startup to warm up
    logger.info("Warming up models...")
    try:
        get_embedding_model()
        get_reranker_model()
        logger.info("Models successfully loaded")
    except Exception as e:
        logger.error(f"Error during model warmup: {str(e)}")
        # Continue anyway, as models will be lazy-loaded when needed
    
    # Start the server
    port = int(os.environ.get("PORT", 8080))
    logger.info(f"Starting server on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)