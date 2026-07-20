# Document Summarization Scripts

This directory contains two document summarization scripts for processing files stored in Supabase:

## Scripts

### 1. `main.py` - Local LLM Summarization
Uses a local Qwen2.5-1.5B-Instruct model running on GPU/CPU for document summarization.

**Features:**
- Processes files sequentially to avoid GPU memory issues
- Uses local transformers model (no API costs)
- Optimized for GPU memory utilization
- Batch processing with progress tracking

**Requirements:**
- CUDA-capable GPU (recommended) or CPU
- ~6GB+ GPU memory for optimal performance
- Install PyTorch with CUDA support

### 2. `main_gemini.py` - Gemini AI API Summarization
Uses Google's Gemini 1.5 Flash Lite API for document summarization.

**Features:**
- Uses Gemini AI API (requires API key)
- Rate limiting to respect API quotas
- Concurrent file downloads with sequential API processing
- More advanced language understanding
- No local GPU requirements

## Setup

### For Local LLM (`main.py`)
1. Install dependencies:
   ```bash
   pip install torch transformers
   # Install other dependencies from ../embeddings/requirements.txt
   ```

2. Ensure CUDA is available for GPU acceleration (optional but recommended)

### For Gemini API (`main_gemini.py`)
1. Install dependencies:
   ```bash
   pip install -r requirements_gemini.txt
   ```

2. Get a Gemini API key from Google AI Studio

3. Set up your API key (choose one method):
   - **Environment variable (recommended):**
     ```bash
     export GEMINI_API_KEY="your-api-key-here"
     ```
   - **Config file:** Uncomment and set the `api_key` in `config.toml` under `[gemini]` section

## Configuration

Both scripts use `config.toml` for database configuration. The file contains:
- Database connection string for Supabase
- Gemini API configuration (for Gemini script)
- Processing parameters

## Usage

### Run Local LLM Summarization
```bash
python main.py
```

### Run Gemini API Summarization
```bash
python main_gemini.py
```

Both scripts will:
1. Connect to the Supabase database
2. Find files that don't have summaries for their respective models
3. Download files from CDN
4. Extract text content (supports PDF, DOCX, RTF, and text files)
5. Generate summaries
6. Save summaries to `file_summaries` table

## Model Identification

The scripts save summaries with different model identifiers:
- Local LLM: `Qwen/Qwen2.5-1.5B-Instruct`
- Gemini API: `gemini-gemini-1.5-flash`

This allows you to run both scripts and compare results, or choose different models for different use cases.

## Rate Limiting

### Gemini API
- Default: 15 requests per minute
- Configurable batch size (default: 3 files)
- Automatic retry on rate limit errors

### Local LLM
- No API rate limits
- Memory management for GPU usage
- Sequential processing to avoid memory issues

## Monitoring

Both scripts provide:
- Progress bars with ETA
- Detailed logging
- Error handling and reporting
- Processing statistics 