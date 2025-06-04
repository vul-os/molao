#!/usr/bin/env python3
"""
RTF Document Summarizer
Downloads RTF file from CDN, extracts text, and generates summary using local LLM
"""

import requests
import re
from striprtf.striprtf import rtf_to_text
from transformers import AutoTokenizer, AutoModelForCausalLM
import torch
from typing import Optional

class RTFSummarizer:
    def __init__(self, model_name: str = "Qwen/Qwen2.5-7B-Instruct"):
        """
        Initialize the RTF summarizer with specified model
        
        Args:
            model_name: HuggingFace model name (default: Qwen2.5-7B-Instruct)
        """
        self.model_name = model_name
        self.tokenizer = None
        self.model = None
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"Using device: {self.device}")
        
    def load_model(self):
        """Load the tokenizer and model with 4-bit quantization if CUDA available"""
        print(f"Loading model: {self.model_name}")
        
        try:
            # Load tokenizer
            self.tokenizer = AutoTokenizer.from_pretrained(self.model_name)
            
            # Load model with optimization for available hardware
            if self.device == "cuda":
                # Try to use 4-bit quantization for GPU if bitsandbytes is available
                try:
                    from transformers import BitsAndBytesConfig
                    
                    quantization_config = BitsAndBytesConfig(
                        load_in_4bit=True,
                        bnb_4bit_compute_dtype=torch.float16,
                        bnb_4bit_use_double_quant=True,
                        bnb_4bit_quant_type="nf4"
                    )
                    
                    self.model = AutoModelForCausalLM.from_pretrained(
                        self.model_name,
                        quantization_config=quantization_config,
                        device_map="auto",
                        torch_dtype=torch.float16,
                        trust_remote_code=True
                    )
                    print("Model loaded with 4-bit quantization!")
                    
                except (ImportError, Exception) as e:
                    print(f"Warning: Could not load with quantization ({e})")
                    print("Falling back to regular GPU loading...")
                    
                    # Fallback to regular GPU loading without quantization
                    self.model = AutoModelForCausalLM.from_pretrained(
                        self.model_name,
                        device_map="auto",
                        torch_dtype=torch.float16,
                        trust_remote_code=True
                    )
                    print("Model loaded on GPU without quantization!")
            else:
                # CPU fallback
                self.model = AutoModelForCausalLM.from_pretrained(
                    self.model_name,
                    torch_dtype=torch.float32,
                    trust_remote_code=True
                )
                print("Model loaded on CPU!")
                
        except Exception as e:
            print(f"Error loading model: {e}")
            raise
    
    def download_rtf(self, cdn_url: str) -> str:
        """
        Download RTF file from CDN URL
        
        Args:
            cdn_url: URL to RTF file
            
        Returns:
            Raw RTF content as string
        """
        print(f"Downloading RTF from: {cdn_url}")
        
        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
            
            response = requests.get(cdn_url, headers=headers, timeout=30)
            response.raise_for_status()
            
            # Handle different encodings
            if response.encoding:
                rtf_content = response.text
            else:
                # Try common encodings for RTF files
                try:
                    rtf_content = response.content.decode('utf-8')
                except UnicodeDecodeError:
                    rtf_content = response.content.decode('latin1')
            
            print(f"Downloaded {len(rtf_content)} characters")
            return rtf_content
            
        except requests.RequestException as e:
            print(f"Error downloading RTF: {e}")
            raise
    
    def extract_text_from_rtf(self, rtf_content: str) -> str:
        """
        Extract plain text from RTF content
        
        Args:
            rtf_content: Raw RTF content
            
        Returns:
            Plain text content
        """
        print("Extracting text from RTF...")
        
        try:
            # Use striprtf library for primary extraction
            text = rtf_to_text(rtf_content)
            
            # Clean up the extracted text
            text = self.clean_text(text)
            
            print(f"Extracted {len(text)} characters of text")
            return text
            
        except Exception as e:
            print(f"Error extracting text from RTF: {e}")
            # Fallback: basic regex extraction
            return self._fallback_rtf_extraction(rtf_content)
    
    def clean_text(self, text: str) -> str:
        """Clean extracted text"""
        # Remove excessive whitespace
        text = re.sub(r'\n\s*\n', '\n\n', text)  # Normalize paragraph breaks
        text = re.sub(r' +', ' ', text)  # Remove multiple spaces
        text = text.strip()
        
        return text
    
    def _fallback_rtf_extraction(self, rtf_content: str) -> str:
        """Fallback RTF text extraction using regex"""
        print("Using fallback RTF extraction...")
        
        # Remove RTF control codes and formatting
        text = re.sub(r'\\[a-z]+\d*', '', rtf_content)  # Remove control words
        text = re.sub(r'[{}]', '', text)  # Remove braces
        text = re.sub(r'\\[^a-z]', '', text)  # Remove control symbols
        
        return self.clean_text(text)
    
    def chunk_text(self, text: str, max_tokens: int = 3000) -> list:
        """
        Split text into chunks that fit within token limits
        
        Args:
            text: Input text to chunk
            max_tokens: Maximum tokens per chunk
            
        Returns:
            List of text chunks
        """
        if not self.tokenizer:
            raise ValueError("Tokenizer not loaded. Call load_model() first.")
        
        # Split by paragraphs first
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
        
        print(f"Split text into {len(chunks)} chunks")
        return chunks
    
    def generate_summary(self, text: str, max_length: int = 500) -> str:
        """
        Generate summary using the loaded LLM
        
        Args:
            text: Input text to summarize
            max_length: Maximum length of summary in tokens
            
        Returns:
            Generated summary
        """
        if not self.model or not self.tokenizer:
            raise ValueError("Model not loaded. Call load_model() first.")
        
        # Create legal document summarization prompt
        prompt = f"""<|im_start|>system
You are a legal document summarization expert. Create a clear, comprehensive summary that captures the key legal points, obligations, and important details.

Focus on:
- Main legal concepts and provisions
- Key parties and their obligations
- Important dates, amounts, or conditions
- Critical legal implications
- Any risks or notable clauses

Keep the summary professional and accurate.<|im_end|>
<|im_start|>user
Please summarize this legal document:

{text}
<|im_end|>
<|im_start|>assistant"""

        # Tokenize input
        inputs = self.tokenizer(prompt, return_tensors="pt", truncation=True, max_length=4000)
        
        if self.device == "cuda":
            inputs = {k: v.to(self.device) for k, v in inputs.items()}
        
        print("Generating summary...")
        
        # Generate summary
        with torch.no_grad():
            outputs = self.model.generate(
                **inputs,
                max_new_tokens=max_length,
                temperature=0.7,
                do_sample=True,
                top_p=0.9,
                pad_token_id=self.tokenizer.eos_token_id
            )
        
        # Decode response
        full_response = self.tokenizer.decode(outputs[0], skip_special_tokens=True)
        
        # Extract just the summary part
        summary = full_response.split("<|im_start|>assistant")[-1].strip()
        
        return summary
    
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
        
        print(f"Processing {len(chunks)} chunks...")
        chunk_summaries = []
        
        for i, chunk in enumerate(chunks, 1):
            print(f"Summarizing chunk {i}/{len(chunks)}...")
            summary = self.generate_summary(chunk, max_length=300)
            chunk_summaries.append(summary)
        
        # Combine chunk summaries
        combined_text = "\n\n".join(chunk_summaries)
        
        # Generate final summary from chunk summaries
        print("Generating final combined summary...")
        final_summary = self.generate_summary(combined_text, max_length=600)
        
        return final_summary
    
    def process_rtf_url(self, cdn_url: str) -> str:
        """
        Complete pipeline: download RTF, extract text, and generate summary
        
        Args:
            cdn_url: URL to RTF file
            
        Returns:
            Generated summary
        """
        try:
            # Download RTF
            rtf_content = self.download_rtf(cdn_url)
            
            # Extract text
            text = self.extract_text_from_rtf(rtf_content)
            
            if not text.strip():
                raise ValueError("No text content extracted from RTF file")
            
            # Generate summary
            summary = self.summarize_long_document(text)
            
            return summary
            
        except Exception as e:
            print(f"Error processing RTF: {e}")
            raise

# Main execution
def main():
    # Example usage
    cdn_url = "https://github.com/bitfocus/rtf2text/blob/master/sample.rtf"  # Replace with your RTF URL
    
    # Initialize summarizer
    summarizer = RTFSummarizer(model_name="Qwen/Qwen2.5-7B-Instruct")
    
    try:
        # Load model
        summarizer.load_model()
        
        # Process RTF and generate summary
        print("=" * 60)
        print("PROCESSING RTF DOCUMENT")
        print("=" * 60)
        
        summary = summarizer.process_rtf_url(cdn_url)
        
        print("=" * 60)
        print("DOCUMENT SUMMARY")
        print("=" * 60)
        print(summary)
        print("=" * 60)
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()