from fastapi import FastAPI
from pydantic import BaseModel
from typing import List, Dict
from transformers import AutoTokenizer, AutoModel, AutoModelForSequenceClassification
import torch
import torch.nn.functional as F

app = FastAPI()

# ---------- Load Models ----------
embedding_model_name = "BAAI/bge-large-en-v1.5"
reranker_model_name = "BAAI/bge-reranker-large"
#  test comment
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

embedding_tokenizer = AutoTokenizer.from_pretrained(embedding_model_name)
embedding_model = AutoModel.from_pretrained(embedding_model_name).to(device).eval()

reranker_tokenizer = AutoTokenizer.from_pretrained(reranker_model_name)
reranker_model = AutoModelForSequenceClassification.from_pretrained(reranker_model_name).to(device).eval()

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
        embeddings = outputs.last_hidden_state[:, 0]  # CLS token
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
        scores = reranker_model(**inputs).logits.squeeze(-1)

    sorted_results = sorted(
        zip(ids, [doc["text"] for doc in documents], scores.tolist()),
        key=lambda x: x[2],
        reverse=True,
    )

    return [
        RerankedDocument(id=id_, text=text, score=score)
        for id_, text, score in sorted_results
    ]

# ---------- Endpoints ----------
@app.post("/embeddings", response_model=EmbeddingResponse)
async def generate_embeddings(request: EmbeddingRequest):
    embeddings = embed_texts(request.input, prefix="search_query: ")
    return EmbeddingResponse(
        data=[{"embedding": emb.tolist()} for emb in embeddings]
    )

@app.post("/rerank", response_model=RerankResponse)
async def rerank_documents(request: RerankRequest):
    results = rerank(request.query, request.documents)
    return RerankResponse(results=results)