FROM python:3.9-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Setup model directories
RUN mkdir -p /models /raw

# Set environment variables
ENV PORT=8080
ENV PYTORCH_CUDA_ALLOC_CONF="max_split_size_mb:16384,expandable_segments:True"
ENV AIP_HTTP_PORT=8080
ENV AIP_HEALTH_ROUTE="/health"
ENV AIP_PREDICT_ROUTE="/predict"

# Add health endpoint 
RUN echo 'from fastapi import APIRouter\nhealth_router = APIRouter()\n@health_router.get("/health")\ndef health():\n    return {"status": "healthy"}\n' > health_routes.py
RUN echo 'from health_routes import health_router\napp.include_router(health_router)' >> main.py

# Start the service
CMD ["python", "main.py"]