# FROM python:3.10-slim

# # Set working directory
# WORKDIR /app

# # Install system dependencies (optional: you can skip git if no models need it)
# RUN apt-get update && apt-get install -y git && apt-get clean

# # Copy app files
# COPY . .

# # Install Python dependencies
# RUN pip install --no-cache-dir -r requirements.txt

# # Set environment variable to avoid warnings
# ENV PYTHONUNBUFFERED=1

# EXPOSE 8080

# # Run FastAPI with uvicorn
# CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]

# Use a minimal Python image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy app code
COPY main.py .

# Expose port and run FastAPI
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
