#!/usr/bin/env python3
"""
Document Summarizer for Supabase Files
Downloads files from CDN, extracts text, and generates summaries using local LLM
Saves summaries to file_summaries table in Supabase
"""

import os
# Set CUDA memory allocation config before importing torch
os.environ['PYTORCH_CUDA_ALLOC_CONF'] = 'expandable_segments:True'

import requests
import re
import tomli
import psycopg2
import uuid
import logging
import httpx
import asyncio
import tempfile
from pathlib import Path
from striprtf.striprtf import rtf_to_text
from transformers import AutoTokenizer, AutoModelForCausalLM
import torch
import gc
import docx
import fitz
import time
from typing import Optional, Dict, Any, List, Tuple
from datetime import datetime
from tqdm.asyncio import tqdm
import concurrent.futures

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class DocumentSummarizer:
    def __init__(self, model_name: str = "Qwen/Qwen2.5-1.5B-Instruct", batch_size: int = 1):
        """
        Initialize the document summarizer with specified model
        
        Args:
            model_name: HuggingFace model name (default: Qwen2.5-1.5B-Instruct for better performance)
            batch_size: Number of files to process concurrently (set to 1 for sequential LLM processing)
        """
        self.model_name = model_name
        self.batch_size = batch_size  # Set to 1 for no concurrent LLM processing
        self.tokenizer = None
        self.model = None
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.config = self.load_config()
        
        logger.info(f"Using device: {self.device}")
        logger.info(f"Processing files sequentially (batch_size: {self.batch_size})")
        
        # Clear GPU cache if available
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            gc.collect()
            self._print_gpu_memory()
        
    def load_config(self) -> Dict[str, Any]:
        """Load configuration from config.toml"""
        try:
            with open("config.toml", "rb") as f:
                return tomli.load(f)
        except FileNotFoundError:
            logger.error("config.toml not found. Please create it with database configuration.")
            raise
        
    def _print_gpu_memory(self):
        """Print current GPU memory usage for all available GPUs"""
        if torch.cuda.is_available():
            num_gpus = torch.cuda.device_count()
            logger.info(f"Found {num_gpus} GPU(s):")
            
            total_memory = 0
            for i in range(num_gpus):
                allocated = torch.cuda.memory_allocated(i) / 1024**3
                cached = torch.cuda.memory_reserved(i) / 1024**3
                device_total = torch.cuda.get_device_properties(i).total_memory / 1024**3
                total_memory += device_total
                logger.info(f"  GPU {i}: Allocated: {allocated:.2f}GB, Cached: {cached:.2f}GB, Total: {device_total:.2f}GB")
            
            logger.info(f"Total GPU Memory Available: {total_memory:.2f}GB")
            return total_memory
        return 0
    
    def _clear_gpu_memory(self):
        """Clear GPU memory cache for all available GPUs"""
        if torch.cuda.is_available():
            num_gpus = torch.cuda.device_count()
            for i in range(num_gpus):
                with torch.cuda.device(i):
                    torch.cuda.empty_cache()
            gc.collect()
            logger.info(f"GPU memory cache cleared for {num_gpus} GPU(s)")
    
    def load_model(self):
        """Load Qwen2.5-1.5B-Instruct model for document summarization"""
        logger.info(f"Loading model: {self.model_name}")
        
        # Clear memory before loading
        self._clear_gpu_memory()
        
        try:
            # Load tokenizer
            self.tokenizer = AutoTokenizer.from_pretrained(self.model_name)
            if self.tokenizer.pad_token is None:
                self.tokenizer.pad_token = self.tokenizer.eos_token
            
            # Load model with optimized settings for multi-GPU
            if self.device == "cuda":
                self.model = AutoModelForCausalLM.from_pretrained(
                    self.model_name,
                    torch_dtype=torch.float16,
                    device_map="auto",  # This will automatically use both GPUs
                    low_cpu_mem_usage=True,
                    trust_remote_code=True,
                    use_cache=True  # Enable KV cache for efficiency
                )
                logger.info("Qwen2.5-1.5B model loaded on GPU(s) successfully!")
                self._print_gpu_memory()
            else:
                self.model = AutoModelForCausalLM.from_pretrained(
                    self.model_name,
                    torch_dtype=torch.float32,
                    low_cpu_mem_usage=True,
                    trust_remote_code=True
                )
                logger.info("Qwen2.5-1.5B model loaded on CPU!")
                
        except Exception as e:
            logger.error(f"Error loading model: {e}")
            raise

    async def download_file_from_cdn(self, cdn_url: str, file_name: str) -> bytes:
        """Download file content from CDN URL."""
        logger.info(f"Downloading file from CDN: {file_name}")
        
        async with httpx.AsyncClient(timeout=120.0) as client:
            try:
                response = await client.get('https://' + cdn_url)
                response.raise_for_status()
                
                logger.info(f"Successfully downloaded {file_name} ({len(response.content)} bytes)")
                return response.content
                
            except httpx.HTTPError as e:
                logger.error(f"HTTP error downloading {file_name} from {cdn_url}: {e}")
                raise
            except Exception as e:
                logger.error(f"Unexpected error downloading {file_name}: {e}")
                raise

    def process_file_content(self, file_content: bytes, file_name: str, mime_type: str) -> str:
        """Process file content based on mime type."""
        try:
            if mime_type == "application/rtf":
                try:
                    # Use the simple approach that worked in the old code
                    rtf_string = file_content.decode('utf-8', errors='ignore')
                    extracted_text = rtf_to_text(rtf_string)
                    logger.info(f"RTF file {file_name}: extracted {len(extracted_text)} chars")
                    return self.normalize_whitespace(extracted_text)
                except Exception as e:
                    logger.error(f"Failed to parse RTF for file {file_name}: {e}")
                    return ""
            elif mime_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
                # Save to temporary file for docx processing
                with tempfile.NamedTemporaryFile(suffix='.docx', delete=False) as temp_file:
                    temp_file.write(file_content)
                    temp_file.flush()
                    
                    try:
                        doc = docx.Document(temp_file.name)
                        text = self.normalize_whitespace("\n\n".join([para.text for para in doc.paragraphs]))
                        return text
                    finally:
                        os.unlink(temp_file.name)
            elif mime_type == "application/pdf":
                # Save to temporary file for PDF processing
                with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as temp_file:
                    temp_file.write(file_content)
                    temp_file.flush()
                    
                    try:
                        with fitz.open(temp_file.name) as doc:
                            text = "\n\n".join([page.get_text() for page in doc])
                            return self.normalize_whitespace(text)
                    finally:
                        os.unlink(temp_file.name)
            else:
                # Treat as text file
                text = file_content.decode('utf-8', errors='ignore')
                return self.normalize_whitespace(text)
        except Exception as e:
            logger.error(f"Failed to process file {file_name}: {e}")
            return ""

    def normalize_whitespace(self, text: str) -> str:
        """Normalize whitespace in text"""
        return re.sub(r"\s+", " ", text).strip()

    def chunk_text(self, text: str, max_tokens: int = 30000) -> list:
        """
        Split text into chunks that fit within token limits
        
        Args:
            text: Input text to chunk
            max_tokens: Maximum tokens per chunk (increased to use more GPU memory efficiently)
            
        Returns:
            List of text chunks
        """
        if not self.tokenizer:
            raise ValueError("Tokenizer not loaded. Call load_model() first.")
        
        # For most documents, we can fit much more in a single chunk now
        total_tokens = len(self.tokenizer.encode(text))
        logger.info(f"Total document tokens: {total_tokens}")
        
        if total_tokens <= max_tokens:
            logger.info("Document fits in single chunk - no splitting needed!")
            return [text]
        
        # If we need to split, do it by paragraphs
        paragraphs = text.split('\n\n')
        chunks = []
        current_chunk = ""
        
        for paragraph in paragraphs:
            test_chunk = current_chunk + "\n\n" + paragraph if current_chunk else paragraph
            
            # Check token count
            tokens = len(self.tokenizer.encode(test_chunk))
            
            if tokens <= max_tokens:
                current_chunk = test_chunk
            else:
                if current_chunk:
                    chunks.append(current_chunk.strip())
                current_chunk = paragraph
        
        if current_chunk:
            chunks.append(current_chunk.strip())
        
        logger.info(f"Split text into {len(chunks)} chunks")
        return chunks

    def generate_summary(self, text: str, max_length: int = 2000) -> str:
        """
        Generate summary using Qwen2.5 model with optimized settings for better GPU utilization
        
        Args:
            text: Input text to summarize
            max_length: Maximum length of summary in tokens (increased for better GPU utilization)
            
        Returns:
            Generated summary
        """
        if not self.model or not self.tokenizer:
            raise ValueError("Model not loaded. Call load_model() first.")
        
        logger.info(f"Generating summary for text with {len(text)} characters")
        
        # Use Qwen's chat format for better results
        messages = [
            {
                "role": "system", 
                "content": "You are a legal document expert. Create comprehensive, accurate summaries that capture all key legal points, obligations, parties, dates, amounts, and important clauses. Focus on legally significant information."
            },
            {
                "role": "user", 
                "content": f"Please provide a detailed summary of this legal document, the summary is for a legal practitioner, so it should be concise and to the point with relevant facts highlighting key points:\n\n{text}"
            }
        ]
        
        # Apply chat template
        prompt = self.tokenizer.apply_chat_template(
            messages, 
            tokenize=False, 
            add_generation_prompt=True
        )
        
        try:
            # Tokenize input with increased max length to use more GPU memory
            inputs = self.tokenizer(
                prompt,
                return_tensors="pt",
                truncation=True,
                max_length=32000,  # Increased to use more GPU memory efficiently
                padding=False
            )
            
            # Move to appropriate device (let device_map handle GPU selection)
            if self.device == "cuda":
                if not all(v.is_cuda for v in inputs.values()):
                    inputs = {k: v.to(self.model.device) for k, v in inputs.items()}
            
            logger.info(f"Input tokens: {inputs['input_ids'].shape[-1]}")
            
            # Generate summary with higher parameters to use more GPU memory efficiently
            with torch.no_grad():
                outputs = self.model.generate(
                    **inputs,
                    max_new_tokens=max_length,
                    temperature=0.3,
                    do_sample=True,
                    top_p=0.85,
                    repetition_penalty=1.1,
                    pad_token_id=self.tokenizer.eos_token_id,
                    eos_token_id=self.tokenizer.eos_token_id,
                    use_cache=True,
                    num_beams=1,
                    early_stopping=False,  # Disable early stopping to prevent the warning
                    return_dict_in_generate=False
                )
            
            # Decode response
            full_response = self.tokenizer.decode(outputs[0], skip_special_tokens=True)
            
            # Extract just the assistant's response
            if "<|im_start|>assistant" in full_response:
                summary = full_response.split("<|im_start|>assistant")[-1].replace("<|im_end|>", "").strip()
            else:
                # Fallback: extract everything after the prompt
                prompt_length = len(self.tokenizer.encode(prompt))
                summary_tokens = outputs[0][prompt_length:]
                summary = self.tokenizer.decode(summary_tokens, skip_special_tokens=True).strip()
            
            logger.info(f"Generated summary with {len(summary)} characters")
            
            # Clear memory after generation
            del outputs, inputs
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            
            return summary
            
        except torch.cuda.OutOfMemoryError as e:
            logger.error(f"GPU memory error during generation: {e}")
            logger.info("Clearing cache and retrying with reduced parameters...")
            self._clear_gpu_memory()
            
            try:
                # Retry with more conservative parameters
                inputs = self.tokenizer(
                    prompt,
                    return_tensors="pt",
                    truncation=True,
                    max_length=16000,  # Reduced for retry
                    padding=False
                )
                
                if self.device == "cuda":
                    inputs = {k: v.to(self.model.device) for k, v in inputs.items()}
                
                with torch.no_grad():
                    outputs = self.model.generate(
                        **inputs,
                        max_new_tokens=max_length // 2,
                        temperature=0.1,
                        do_sample=False,
                        pad_token_id=self.tokenizer.eos_token_id,
                        eos_token_id=self.tokenizer.eos_token_id,
                        use_cache=False,
                        num_beams=1,
                        early_stopping=False
                    )
                
                full_response = self.tokenizer.decode(outputs[0], skip_special_tokens=True)
                if "<|im_start|>assistant" in full_response:
                    summary = full_response.split("<|im_start|>assistant")[-1].replace("<|im_end|>", "").strip()
                else:
                    prompt_length = len(self.tokenizer.encode(prompt))
                    summary_tokens = outputs[0][prompt_length:]
                    summary = self.tokenizer.decode(summary_tokens, skip_special_tokens=True).strip()
                
                # Clear memory after generation
                del outputs, inputs
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                
                return summary
                
            except Exception as retry_error:
                logger.error(f"Retry also failed: {retry_error}")
                raise retry_error
        except Exception as e:
            logger.error(f"Unexpected error during generation: {e}")
            raise e

    def summarize_long_document(self, text: str) -> str:
        """
        Summarize long documents by chunking and combining summaries
        
        Args:
            text: Full document text
            
        Returns:
            Combined summary
        """
        chunks = self.chunk_text(text)
        
        if len(chunks) == 1:
            return self.generate_summary(chunks[0])
        
        logger.info(f"Processing {len(chunks)} chunks sequentially...")
        chunk_summaries = []
        
        # Process chunks sequentially (no tqdm nested progress bar)
        for i, chunk in enumerate(chunks, 1):
            try:
                logger.info(f"Processing chunk {i}/{len(chunks)}")
                summary = self.generate_summary(chunk, max_length=800)
                chunk_summaries.append(summary)
                
                # Clear memory after each chunk to prevent accumulation
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                    gc.collect()
                    
            except Exception as e:
                logger.error(f"Error summarizing chunk {i}: {e}")
                chunk_summaries.append(f"[Error summarizing chunk {i}]")
        
        # Combine chunk summaries
        combined_text = "\n\n".join(chunk_summaries)
        
        # Generate final summary from chunk summaries
        logger.info("Generating final combined summary...")
        final_summary = self.generate_summary(combined_text, max_length=1200)
        
        return final_summary

    async def process_file(self, file_id: uuid.UUID, file_name: str, mime_type: str, cdn_path: str) -> str:
        """
        Complete pipeline: download file, extract text, and generate summary
        
        Args:
            file_id: File ID from database
            file_name: Name of the file
            mime_type: MIME type of the file
            cdn_path: CDN path to download file
            
        Returns:
            Generated summary
        """
        try:
            # Download file
            file_content = await self.download_file_from_cdn(cdn_path, file_name)
            
            # Extract text
            text = self.process_file_content(file_content, file_name, mime_type)
            
            if not text.strip():
                raise ValueError("No text content extracted from file")
            
            # Generate summary
            summary = self.summarize_long_document(text)
            
            return summary
            
        except Exception as e:
            logger.error(f"Error processing file {file_id}: {e}")
            raise

    def get_database_connection(self):
        """Get database connection using config"""
        return psycopg2.connect(self.config['database']['connection_string'])

    def save_summary_to_database(self, file_id: uuid.UUID, summary: str):
        """Save summary to file_summaries table"""
        try:
            conn = self.get_database_connection()
            try:
                with conn.cursor() as cur:
                    # Insert or update summary
                    cur.execute("""
                        INSERT INTO file_summaries (file_id, model, content)
                        VALUES (%s, %s, %s)
                        ON CONFLICT (file_id, model) 
                        DO UPDATE SET content = EXCLUDED.content
                    """, (str(file_id), self.model_name, summary))
                    
                    conn.commit()
                    logger.info(f"Saved summary for file {file_id} to database")
                    
            finally:
                conn.close()
                
        except Exception as e:
            logger.error(f"Error saving summary to database: {e}")
            raise

    def get_files_to_process(self):
        """Get files that need summaries generated"""
        conn = self.get_database_connection()
        try:
            with conn.cursor() as cur:
                # Get files that don't have summaries for this model
                cur.execute("""
                    SELECT f.id, f.file_name, f.mime_type, f.cdn_path 
                    FROM files f 
                    LEFT JOIN file_summaries fs ON f.id = fs.file_id AND fs.model = %s
                    WHERE f.cdn_path IS NOT NULL 
                    AND fs.id IS NULL
                    ORDER BY f.created_at DESC
                """, (self.model_name,))
                
                files = cur.fetchall()
                return files
                
        finally:
            conn.close()

    async def process_files_batch(self, files_batch: List[Tuple]) -> List[Tuple[str, str]]:
        """Process a batch of files - downloads concurrently but processes LLM sequentially"""
        results = []
        
        # Download all files in the batch concurrently
        download_tasks = []
        for file_info in files_batch:
            file_id, file_name, mime_type, cdn_path = file_info
            download_tasks.append(self.download_file_from_cdn(cdn_path, file_name))
        
        logger.info(f"Downloading {len(files_batch)} files concurrently...")
        downloaded_files = await asyncio.gather(*download_tasks, return_exceptions=True)
        
        # Process each file sequentially for LLM generation
        for i, (file_info, file_content) in enumerate(zip(files_batch, downloaded_files)):
            file_id, file_name, mime_type, cdn_path = file_info
            
            if isinstance(file_content, Exception):
                logger.error(f"Failed to download {file_name}: {file_content}")
                results.append((file_id, None, str(file_content)))
                continue
            
            try:
                logger.info(f"Processing file {i+1}/{len(files_batch)}: {file_name}")
                
                # Extract text
                text = self.process_file_content(file_content, file_name, mime_type)
                
                if not text.strip():
                    raise ValueError("No text content extracted from file")
                
                # Generate summary (sequential processing)
                summary = self.summarize_long_document(text)
                
                results.append((file_id, summary, None))  # success
                logger.info(f"Successfully processed {file_name}")
                
                # Clear memory between files
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                gc.collect()
                
            except Exception as e:
                logger.error(f"Error processing {file_name}: {e}")
                results.append((file_id, None, str(e)))  # error
        
        return results

    async def process_all_files(self):
        """Process all files in the database that don't have summaries with batch processing and progress tracking"""
        logger.info("Starting batch processing of all files...")
        
        # Get files to process
        files_to_process = self.get_files_to_process()
        total_files = len(files_to_process)
        logger.info(f"Found {total_files} files to process")
        
        if not files_to_process:
            logger.info("No files need processing")
            return
        
        processed_count = 0
        error_count = 0
        start_time = time.time()
        
        # Create batches
        batches = [files_to_process[i:i + self.batch_size] 
                  for i in range(0, len(files_to_process), self.batch_size)]
        
        logger.info(f"Processing {len(batches)} batches of {self.batch_size} files each")
        
        # Process batches with progress bar
        with tqdm(total=total_files, desc="Processing files", unit="files") as pbar:
            for batch_idx, batch in enumerate(batches):
                try:
                    logger.info(f"Processing batch {batch_idx + 1}/{len(batches)} ({len(batch)} files)")
                    batch_start_time = time.time()
                    
                    # Process batch concurrently
                    results = await self.process_files_batch(batch)
                    
                    # Save results to database
                    batch_processed = 0
                    batch_errors = 0
                    
                    for result in results:
                        if isinstance(result, Exception):
                            error_count += 1
                            batch_errors += 1
                            continue
                            
                        file_id, summary, error = result
                        
                        if error:
                            error_count += 1
                            batch_errors += 1
                            logger.error(f"Failed to process file {file_id}: {error}")
                        else:
                            try:
                                self.save_summary_to_database(file_id, summary)
                                processed_count += 1
                                batch_processed += 1
                            except Exception as e:
                                error_count += 1
                                batch_errors += 1
                                logger.error(f"Failed to save summary for {file_id}: {e}")
                    
                    # Update progress bar
                    pbar.update(len(batch))
                    
                    # Calculate and display statistics
                    batch_time = time.time() - batch_start_time
                    elapsed_time = time.time() - start_time
                    avg_time_per_file = elapsed_time / max(processed_count + error_count, 1)
                    remaining_files = total_files - (processed_count + error_count)
                    estimated_remaining_time = remaining_files * avg_time_per_file
                    
                    # Update progress bar description with ETA
                    eta_minutes = estimated_remaining_time / 60
                    pbar.set_description(f"Processing files (ETA: {eta_minutes:.1f}min)")
                    
                    logger.info(f"Batch {batch_idx + 1} completed in {batch_time:.1f}s: "
                              f"{batch_processed} processed, {batch_errors} errors")
                    logger.info(f"Overall progress: {processed_count}/{total_files} processed, "
                              f"ETA: {eta_minutes:.1f} minutes")
                    
                    # Force garbage collection between batches
                    gc.collect()
                    if torch.cuda.is_available():
                        torch.cuda.empty_cache()
                        
                except Exception as e:
                    logger.error(f"Error processing batch {batch_idx + 1}: {e}")
                    error_count += len(batch)
                    pbar.update(len(batch))
        
        total_time = time.time() - start_time
        logger.info(f"Batch processing completed in {total_time/60:.1f} minutes")
        logger.info(f"Results: {processed_count} processed, {error_count} errors")
        logger.info(f"Average time per file: {total_time/max(total_files, 1):.2f} seconds")

# Main execution
async def main():
    """Main function to process all files"""
    
    # Initialize summarizer for sequential processing with efficient GPU utilization
    summarizer = DocumentSummarizer(
        model_name="Qwen/Qwen2.5-1.5B-Instruct",  # Using 3B model for better GPU utilization
        batch_size=1  # Process files sequentially to avoid LLM concurrency issues
    )
    
    try:
        # Load model
        logger.info("Loading model...")
        summarizer.load_model()
        
        # Print current GPU utilization
        summarizer._print_gpu_memory()
        
        # Process all files
        logger.info("=" * 60)
        logger.info("PROCESSING ALL FILES IN SUPABASE (SEQUENTIAL)")
        logger.info("Files will be downloaded concurrently but processed sequentially")
        logger.info("GPU memory will be used efficiently with larger context windows")
        logger.info("=" * 60)
        
        await summarizer.process_all_files()
        
        logger.info("=" * 60)
        logger.info("PROCESSING COMPLETED")
        logger.info("=" * 60)
        
    except Exception as e:
        logger.error(f"Error: {e}")
        raise e

if __name__ == "__main__":
    asyncio.run(main())
