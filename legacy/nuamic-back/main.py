from fastapi import FastAPI
from pydantic import BaseModel
from typing import List, Dict
import os
import requests

app = FastAPI()

HF_API_KEY = os.getenv("HF_API_KEY")  # Set this as an env variable in Cloud Run
EMBEDDING_MODEL = "BAAI/bge-large-en-v1.5"
RERANKER_MODEL = "BAAI/bge-reranker-large"

HF_HEADERS = {
    "Authorization": f"Bearer {HF_API_KEY}",
    "Content-Type": "application/json"
}

# ---------- Request & Response Models ----------
class EmbeddingRequest(BaseModel):
    input: List[str]

class EmbeddingResponse(BaseModel):
    data: List[Dict[str, List[float]]]

class RerankRequest(BaseModel):
    query: str
    documents: List[Dict[str, str]]  # Each document: {"id": "...", "text": "..."}

class RerankedDocument(BaseModel):
    id: str
    text: str
    score: float

class RerankResponse(BaseModel):
    results: List[RerankedDocument]

# ---------- Embedding ----------
@app.post("/embeddings", response_model=EmbeddingResponse)
async def generate_embeddings(request: EmbeddingRequest):
    response = requests.post(
        f"https://api-inference.huggingface.co/pipeline/feature-extraction/{EMBEDDING_MODEL}",
        headers=HF_HEADERS,
        json={"inputs": request.input}
    )
    if response.status_code != 200:
        return {"data": []}
    data = response.json()
    # Hugging Face returns one embedding if input is single string; normalize to always be list of lists
    embeddings = data if isinstance(data[0], list) else [data]
    return EmbeddingResponse(data=[{"embedding": emb} for emb in embeddings])

# ---------- Reranking ----------
@app.post("/rerank", response_model=RerankResponse)
async def rerank_documents(request: RerankRequest):
    pairs = [
        {"inputs": {"query": request.query, "passage": doc["text"]}}
        for doc in request.documents
    ]

    reranked = []
    for idx, pair in enumerate(pairs):
        response = requests.post(
            f"https://api-inference.huggingface.co/models/{RERANKER_MODEL}",
            headers=HF_HEADERS,
            json=pair
        )
        if response.status_code == 200:
            score = response.json()[0]["score"]
            reranked.append({
                "id": request.documents[idx]["id"],
                "text": request.documents[idx]["text"],
                "score": score
            })
    sorted_docs = sorted(reranked, key=lambda d: d["score"], reverse=True)
    return RerankResponse(results=sorted_docs)
