from fastapi import FastAPI
from pydantic import BaseModel
from typing import List, Dict
from transformers import AutoTokenizer, AutoModel, AutoModelForSequenceClassification
import torch
import torch.nn.functional as F
import os
import logging
from pathlib import Path
from google.cloud import storage

# ---------- Logging Setup ----------
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
logger.info("Starting FastAPI service...")

# ---------- Environment Variables ----------
BUCKET_NAME = os.environ.get("MODEL_BUCKET_NAME", "nuamic-models")
EMBEDDING_MODEL_GCS_PATH = "models/bge-large-en-v1.5"
RERANKER_MODEL_GCS_PATH = "models/bge-reranker-large"
LOCAL_MODEL_DIR = Path("/tmp/models")  # Cloud Run writable directory

# ---------- GCS Download Logic ----------
def download_gcs_folder(bucket_name: str, prefix: str, local_path: Path):
    client = storage.Client()
    bucket = client.bucket(bucket_name)
    blobs = bucket.list_blobs(prefix=prefix)

    for blob in blobs:
        rel_path = Path(blob.name).relative_to(prefix)
        dest_path = local_path / rel_path
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        blob.download_to_filename(dest_path)
        logger.info(f"Downloaded {blob.name} to {dest_path}")

# Download models on container start
logger.info("Downloading embedding model...")
download_gcs_folder(BUCKET_NAME, EMBEDDING_MODEL_GCS_PATH, LOCAL_MODEL_DIR / "bge-large-en-v1.5")

logger.info("Downloading reranker model...")
download_gcs_folder(BUCKET_NAME, RERANKER_MODEL_GCS_PATH, LOCAL_MODEL_DIR / "bge-reranker-large")

EMBEDDING_MODEL_PATH = LOCAL_MODEL_DIR / "bge-large-en-v1.5"
RERANKER_MODEL_PATH = LOCAL_MODEL_DIR / "bge-reranker-large"

# ---------- Device ----------
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# ---------- Lazy Model Globals ----------
embedding_tokenizer = None
embedding_model = None
reranker_tokenizer = None
reranker_model = None

def get_embedding_model():
    global embedding_tokenizer, embedding_model
    if embedding_tokenizer is None or embedding_model is None:
        logger.info("Loading embedding model...")
        embedding_tokenizer = AutoTokenizer.from_pretrained(EMBEDDING_MODEL_PATH)
        embedding_model = AutoModel.from_pretrained(EMBEDDING_MODEL_PATH).to(device)
        embedding_model.eval()
    return embedding_tokenizer, embedding_model

def get_reranker_model():
    global reranker_tokenizer, reranker_model
    if reranker_tokenizer is None or reranker_model is None:
        logger.info("Loading reranker model...")
        reranker_tokenizer = AutoTokenizer.from_pretrained(RERANKER_MODEL_PATH)
        reranker_model = AutoModelForSequenceClassification.from_pretrained(RERANKER_MODEL_PATH).to(device)
        reranker_model.eval()
    return reranker_tokenizer, reranker_model

# ---------- Debug: Confirm Contents ----------
if EMBEDDING_MODEL_PATH.exists():
    logger.info("Embedding model directory contents:")
    logger.info(os.listdir(EMBEDDING_MODEL_PATH))
else:
    logger.error("Embedding model path does not exist!")

if RERANKER_MODEL_PATH.exists():
    logger.info("Reranker model directory contents:")
    logger.info(os.listdir(RERANKER_MODEL_PATH))
else:
    logger.error("Reranker model path does not exist!")

# ---------- FastAPI App ----------
app = FastAPI()

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
        doc_id = doc["id"]
        file_name = doc.get("file_name", "Unknown Case")
        doc_text = f"{file_name} - Legal Document Section\n\n{doc['text']}"
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
        scores = model(**inputs).logits.squeeze(-1).cpu()

    sorted_results = sorted(
        zip(ids, [doc["text"] for doc in documents], scores.tolist()),
        key=lambda x: x[2],
        reverse=True,
    )

    return [
        RerankedDocument(id=id_, text=text, score=score)
        for id_, text, score in sorted_results
    ]

# ---------- API Endpoints ----------
@app.post("/embeddings", response_model=EmbeddingResponse)
async def generate_embeddings(request: EmbeddingRequest):
    embeddings = embed_texts(request.input, prefix="search_query: ")
    return EmbeddingResponse(data=[{"embedding": emb.tolist()} for emb in embeddings])

@app.post("/rerank", response_model=RerankResponse)
async def rerank_documents(request: RerankRequest):
    results = rerank(request.query, request.documents)
    return RerankResponse(results=results)

@app.get("/")
def read_root():
    return {"message": "Hello from Cloud Run!"}

# ---------- Entrypoint ----------
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
