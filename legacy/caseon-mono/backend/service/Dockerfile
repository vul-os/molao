# Stage 1: Download from bucket
FROM google/cloud-sdk:alpine as downloader
RUN mkdir -p /models
RUN gsutil cp -r gs://caseon-models/* /models/

# Stage 2: Final image
FROM python:3.10-slim
#
# Install LibreOffice (minimal install for headless document conversion)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-writer \
    libreoffice-core \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Create working directory
WORKDIR /app

# Set environment vars (optional, good hygiene)
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=8080

# Copy just requirements first to leverage Docker cache
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy app code (only after installing dependencies)
COPY . .

# Copy models from the downloader stage
COPY --from=downloader /models/ /models/

# Expose port for Cloud Run
EXPOSE 8080

# Entrypoint
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]