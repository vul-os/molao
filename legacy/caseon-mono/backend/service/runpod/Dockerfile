FROM python:3.9-slim

WORKDIR /app

# Install system dependencies including gcsfuse
RUN apt-get update && apt-get install -y \
    build-essential \
    git \
    curl \
    gnupg \
    lsb-release \
    && echo "deb https://packages.cloud.google.com/apt gcsfuse-$(lsb_release -cs) main" | tee /etc/apt/sources.list.d/gcsfuse.list \
    && curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | apt-key add - \
    && apt-get update \
    && apt-get install -y gcsfuse \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Copy the keyfile
COPY /keyfile.json /keyfile.json

# Setup model directories
RUN mkdir -p /models /raw

ENV GOOGLE_APPLICATION_CREDENTIALS=/keyfile.json

# Create a startup script to mount gcsfuse and start the application
RUN echo '#!/bin/bash\n\
gcsfuse --key-file=/keyfile.json caseon-files /raw\n\
python main.py' > /app/start.sh \
    && chmod +x /app/start.sh

# Start the service using the startup script
CMD ["/app/start.sh"]