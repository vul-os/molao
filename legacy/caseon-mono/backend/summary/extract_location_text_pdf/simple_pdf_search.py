import fitz  # PyMuPDF
from typing import List, Dict, Tuple, Optional

def find_text_simple(pdf_path: str, search_text: str) -> List[Dict]:
    """
    Simplest method using PyMuPDF's built-in search
    
    Args:
        pdf_path: Path to PDF file
        search_text: Text to search for
        
    Returns:
        List of matches with coordinates
    """
    doc = fitz.open(pdf_path)
    matches = []
    
    for page_num in range(len(doc)):
        page = doc[page_num]
        
        # Use PyMuPDF's built-in search - this is very reliable
        text_instances = page.search_for(search_text)
        
        for rect in text_instances:
            matches.append({
                "text": search_text,
                "coordinates": (rect.x0, rect.y0, rect.x1, rect.y1),
                "page": page_num + 1,
                "method": "built_in_search"
            })
    
    doc.close()
    return matches

def find_text_fuzzy_simple(pdf_path: str, search_text: str) -> List[Dict]:
    """
    Simple fuzzy search by extracting words and finding partial matches
    """
    doc = fitz.open(pdf_path)
    matches = []
    search_words = search_text.lower().split()
    
    for page_num in range(len(doc)):
        page = doc[page_num]
        
        # Get all text with coordinates
        words = page.get_text("words")  # Returns list of (x0, y0, x1, y1, "word", block_no, line_no, word_no)
        
        # Look for sequences of words that match our search
        for i in range(len(words) - len(search_words) + 1):
            word_sequence = [words[j][4].lower() for j in range(i, i + len(search_words))]
            
            # Check if this sequence matches our search words
            matches_count = sum(1 for search_word in search_words if any(search_word in word for word in word_sequence))
            
            if matches_count >= len(search_words) * 0.7:  # 70% of words match
                # Calculate bounding box for the sequence
                first_word = words[i]
                last_word = words[i + len(search_words) - 1]
                
                x0 = min(words[j][0] for j in range(i, i + len(search_words)))
                y0 = min(words[j][1] for j in range(i, i + len(search_words)))
                x1 = max(words[j][2] for j in range(i, i + len(search_words)))
                y1 = max(words[j][3] for j in range(i, i + len(search_words)))
                
                matched_text = " ".join(word_sequence)
                
                matches.append({
                    "text": matched_text,
                    "coordinates": (x0, y0, x1, y1),
                    "page": page_num + 1,
                    "method": "fuzzy_word_match",
                    "similarity": matches_count / len(search_words) * 100
                })
    
    doc.close()
    return matches

def highlight_found_text(pdf_path: str, texts: List[str], output_path: str) -> bool:
    """
    Simple highlighting using built-in search
    """
    try:
        doc = fitz.open(pdf_path)
        colors = [(1, 0, 0), (0, 1, 0), (0, 0, 1), (1, 0.5, 0), (1, 0, 1)]
        
        for i, text in enumerate(texts):
            color = colors[i % len(colors)]
            print(f"\n🔍 Searching for: '{text[:50]}...'")
            
            found_any = False
            
            for page_num in range(len(doc)):
                page = doc[page_num]
                
                # Try exact search first
                text_instances = page.search_for(text)
                
                if text_instances:
                    for rect in text_instances:
                        highlight = page.add_highlight_annot(rect)
                        highlight.set_colors(stroke=color)
                        highlight.update()
                        found_any = True
                        print(f"  ✅ Found exact match on page {page_num + 1}")
                else:
                    # Try partial search for long text
                    words = text.split()
                    if len(words) > 3:
                        # Search for smaller chunks
                        chunk_size = max(2, len(words) // 3)
                        for j in range(0, len(words), chunk_size):
                            chunk = " ".join(words[j:j + chunk_size])
                            chunk_instances = page.search_for(chunk)
                            
                            for rect in chunk_instances:
                                highlight = page.add_highlight_annot(rect)
                                highlight.set_colors(stroke=color)
                                highlight.update()
                                found_any = True
                                print(f"  ✅ Found chunk '{chunk}' on page {page_num + 1}")
            
            if not found_any:
                print(f"  ❌ No matches found for: '{text[:50]}...'")
        
        doc.save(output_path)
        doc.close()
        print(f"\n💾 Saved to: {output_path}")
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

# Test the simple methods
if __name__ == "__main__":
    test_texts = [
        "The high court ordered Datacentrix (Pty) Ltd (the appellant) to pay an amount of R1 936 815 plus interest for breach of contract",
        "breach of contract",
        "Datacentrix",
        "material breach"
    ]
    
    print("🔍 Testing Simple PDF Text Search Methods")
    print("="*50)
    
    for text in test_texts:
        print(f"\n📝 Testing: '{text[:30]}...'")
        
        # Method 1: Built-in search
        matches1 = find_text_simple("162.pdf", text)
        print(f"  Built-in search: {len(matches1)} matches")
        
        # Method 2: Fuzzy word search  
        matches2 = find_text_fuzzy_simple("162.pdf", text)
        print(f"  Fuzzy search: {len(matches2)} matches")
    
    # Test highlighting
    print(f"\n🎨 Creating highlighted PDF...")
    success = highlight_found_text("162.pdf", test_texts, "simple_highlighted.pdf")
    
    if success:
        print("✅ Simple highlighting completed!")
    else:
        print("❌ Simple highlighting failed!") 