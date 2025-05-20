import os
import torch
import torch.nn.functional as F
from transformers import AutoTokenizer
from optimum.onnxruntime import ORTModelForFeatureExtraction
import numpy as np

# Configure PyTorch and CUDA
os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "max_split_size_mb:128,expandable_segments:True"
torch.set_float32_matmul_precision("high")
torch.cuda.empty_cache()

def init_model():
    model_name = 'BAAI/bge-large-en-v1.5'
    
    # Initialize tokenizer
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    
    # Initialize ONNX model with CUDA
    model = ORTModelForFeatureExtraction.from_pretrained(
        model_name,
        revision="refs/pr/13",
        file_name="model.onnx",
        provider="CUDAExecutionProvider"
    )
    
    return tokenizer, model

def get_embeddings(texts, tokenizer, model, batch_size=8):
    all_embeddings = []
    
    # Process in batches
    for i in range(0, len(texts), batch_size):
        batch_texts = texts[i:i + batch_size]
        
        # Tokenize
        encoded_input = tokenizer(
            batch_texts,
            padding=True,
            truncation=True,
            max_length=8192,
            return_tensors='pt'
        )
        
        # Move to CUDA
        encoded_input = {k: v.cuda() for k, v in encoded_input.items()}
        
        # Get embeddings
        with torch.no_grad():
            outputs = model(**encoded_input)
            embeddings = outputs.last_hidden_state[:, 0]  # Get CLS token embedding
            # Normalize embeddings
            embeddings = F.normalize(embeddings, p=2, dim=1)
            all_embeddings.append(embeddings.cpu().numpy())
            
        # Clear CUDA cache
        del encoded_input, outputs, embeddings
        torch.cuda.empty_cache()
    
    # Concatenate all batches
    return np.vstack(all_embeddings)

def main():
    # Test sentences
    sentences = [
        "What is the capital of France?",
        "Paris is a beautiful city.",
        "The Eiffel Tower is in Paris.",
        "Machine learning is fascinating.",
        "Python is a great programming language."
    ]
    
    try:
        # Initialize model and tokenizer
        tokenizer, model = init_model()
        
        # Get embeddings
        embeddings = get_embeddings(sentences, tokenizer, model)
        
        # Print results
        print(f"Generated embeddings shape: {embeddings.shape}")
        print(f"First embedding vector (first 5 values): {embeddings[0][:5]}")
        
        # Calculate similarity between first two sentences
        similarity = np.dot(embeddings[0], embeddings[1])
        print(f"Similarity between first two sentences: {similarity:.4f}")
        
    except Exception as e:
        print(f"Error during processing: {str(e)}")
    finally:
        # Clean up
        torch.cuda.empty_cache()

if __name__ == "__main__":
    main()
