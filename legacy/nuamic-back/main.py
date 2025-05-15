from fastapi import FastAPI
from pydantic import BaseModel
from typing import List, Dict
from transformers import AutoTokenizer, AutoModel, AutoModelForSequenceClassification
import torch
import torch.nn.functional as F
import os
import uvicorn
import logging
from pathlib import Path

# ---------- Logging Setup ----------
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

logger.info("Starting FastAPI service...")

# ---------- Load Environment Variables ----------
# The models are now mounted under /models (Cloud Run mount path)
EMBEDDING_MODEL_PATH = Path("nuamic-models/models/bge-large-en-v1.5").resolve()
RERANKER_MODEL_PATH = Path("nuamic-models/models/bge-reranker-large").resolve()
# EMBEDDING_MODEL_PATH = Path("models/bge-large-en-v1.5").resolve()
# RERANKER_MODEL_PATH = Path("models/bge-reranker-large").resolve()

# ---------- Load Embedding Model ----------
logger.info("Models embedding started.")
embedding_tokenizer = AutoTokenizer.from_pretrained(EMBEDDING_MODEL_PATH)
embedding_model = AutoModel.from_pretrained(EMBEDDING_MODEL_PATH)
embedding_model.eval()

# ---------- Load Reranker Model ----------
logger.info("Models reranker started.")
reranker_tokenizer = AutoTokenizer.from_pretrained(RERANKER_MODEL_PATH)
reranker_model = AutoModelForSequenceClassification.from_pretrained(RERANKER_MODEL_PATH)
reranker_model.eval()

# ---------- Set Device ----------
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
embedding_model.to(device)
reranker_model.to(device)

logger.info("Models loaded successfully.")
logger.info(f"Embedding model path: {EMBEDDING_MODEL_PATH}")
logger.info(f"Reranker model path: {RERANKER_MODEL_PATH}")

# ---------- Debug: Directory Listing ----------
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

# ---------- Embedding Helper ----------
def embed_texts(texts: List[str], prefix: str = "") -> torch.Tensor:
    prefixed = [f"{prefix}{t}" for t in texts]
    inputs = embedding_tokenizer(
        prefixed,
        return_tensors="pt",
        padding=True,
        truncation=True,
        max_length=512,
    )
    inputs = {k: v.to(device) for k, v in inputs.items()}
    with torch.no_grad():
        outputs = embedding_model(**inputs)
        embeddings = outputs.last_hidden_state[:, 0]
        embeddings = F.normalize(embeddings, p=2, dim=1)
    return embeddings.cpu()

# ---------- Reranking Helper ----------
def rerank(query: str, documents: List[Dict[str, str]]) -> List[RerankedDocument]:
    pairs = []
    ids = []
    for doc in documents:
        doc_id = doc["id"]
        file_name = doc.get("file_name", "Unknown Case")
        doc_text = f"{file_name} - Legal Document Section\n\n{doc['text']}"
        pairs.append((query, doc_text))
        ids.append(doc_id)

    inputs = reranker_tokenizer.batch_encode_plus(
        pairs,
        padding=True,
        truncation=True,
        return_tensors="pt",
        max_length=512,
    )
    inputs = {k: v.to(device) for k, v in inputs.items()}

    with torch.no_grad():
        scores = reranker_model(**inputs).logits.squeeze(-1).cpu()

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

# ---------- Entrypoint ----------
# if __name__ == "__main__":
#     port = int(os.getenv("PORT", 8080))
#     import uvicorn
#     uvicorn.run("main:app", host="0.0.0.0", port=port)

@app.get("/")
def read_root():
    return {"message": "Hello from Cloud Run!"}

# if __name__ == "__main__":
#     port = int(os.environ.get("PORT", 8080))  # ✅ Required for Cloud Run
#     uvicorn.run("main:app", host="0.0.0.0", port=port)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)