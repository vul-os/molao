import pdfplumber
import re
from typing import List, Dict, Tuple, Optional

def find_text_with_pdfplumber(pdf_path: str, search_text: str) -> List[Dict]:
    """
    Use pdfplumber to find text - often more accurate than PyMuPDF
    """
    matches = []
    
    with pdfplumber.open(pdf_path) as pdf:
        for page_num, page in enumerate(pdf.pages):
            # Get all text with coordinates
            chars = page.chars
            
            # Combine characters into words
            page_text = page.extract_text()
            
            if not page_text:
                continue
                
            # Simple search for exact text
            if search_text.lower() in page_text.lower():
                # Find the position using character-level search
                search_lower = search_text.lower()
                text_lower = page_text.lower()
                
                start_idx = text_lower.find(search_lower)
                if start_idx != -1:
                    end_idx = start_idx + len(search_text)
                    
                    # Try to find approximate coordinates
                    # This is a simplified approach - pdfplumber can be more precise
                    if chars:
                        # Get bounding box from characters in the range
                        relevant_chars = chars[start_idx:end_idx] if end_idx < len(chars) else chars[start_idx:]
                        
                        if relevant_chars:
                            x0 = min(char['x0'] for char in relevant_chars)
                            y0 = min(char['top'] for char in relevant_chars)
                            x1 = max(char['x1'] for char in relevant_chars)
                            y1 = max(char['bottom'] for char in relevant_chars)
                            
                            matches.append({
                                "text": search_text,
                                "coordinates": (x0, y0, x1, y1),
                                "page": page_num + 1,
                                "method": "pdfplumber_exact"
                            })
    
    return matches

def find_text_fuzzy_pdfplumber(pdf_path: str, search_text: str) -> List[Dict]:
    """
    Fuzzy search using pdfplumber with word-level matching
    """
    matches = []
    search_words = search_text.lower().split()
    
    with pdfplumber.open(pdf_path) as pdf:
        for page_num, page in enumerate(pdf.pages):
            words = page.extract_words()
            
            if not words:
                continue
            
            # Look for sequences of words that match
            for i in range(len(words) - len(search_words) + 1):
                word_sequence = [words[j]['text'].lower() for j in range(i, i + len(search_words))]
                
                # Check similarity
                matches_count = 0
                for search_word in search_words:
                    for word in word_sequence:
                        if search_word in word or word in search_word:
                            matches_count += 1
                            break
                
                similarity = matches_count / len(search_words)
                
                if similarity >= 0.7:  # 70% match threshold
                    # Get bounding box for the sequence
                    sequence_words = words[i:i + len(search_words)]
                    
                    x0 = min(word['x0'] for word in sequence_words)
                    y0 = min(word['top'] for word in sequence_words)
                    x1 = max(word['x1'] for word in sequence_words)
                    y1 = max(word['bottom'] for word in sequence_words)
                    
                    matched_text = " ".join(word_sequence)
                    
                    matches.append({
                        "text": matched_text,
                        "coordinates": (x0, y0, x1, y1),
                        "page": page_num + 1,
                        "method": "pdfplumber_fuzzy",
                        "similarity": similarity * 100
                    })
    
    return matches

# Test function
def test_pdfplumber_search(pdf_path: str, test_texts: List[str]):
    """
    Test pdfplumber search methods
    """
    print("🔍 Testing pdfplumber search methods")
    print("="*50)
    
    for text in test_texts:
        print(f"\n📝 Testing: '{text[:40]}...'")
        
        # Exact search
        exact_matches = find_text_with_pdfplumber(pdf_path, text)
        print(f"  Exact matches: {len(exact_matches)}")
        
        # Fuzzy search
        fuzzy_matches = find_text_fuzzy_pdfplumber(pdf_path, text)
        print(f"  Fuzzy matches: {len(fuzzy_matches)}")
        
        # Show results
        all_matches = exact_matches + fuzzy_matches
        for match in all_matches[:2]:  # Show first 2
            print(f"    📍 Page {match['page']}: {match['method']}")

if __name__ == "__main__":
    test_texts = [
        "The high court ordered Datacentrix",
        "breach of contract", 
        "Datacentrix",
        "material breach"
    ]
    
    try:
        test_pdfplumber_search("162.pdf", test_texts)
    except ImportError:
        print("❌ pdfplumber not installed. Install with: pip install pdfplumber")
    except Exception as e:
        print(f"❌ Error: {e}") 