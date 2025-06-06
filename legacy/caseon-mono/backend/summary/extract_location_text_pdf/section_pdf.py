import fitz  # PyMuPDF
import re
from fuzzywuzzy import fuzz
from typing import List, Dict, Tuple, Optional

class TextToCoordinatesFinder:
    def __init__(self, pdf_path: str):
        self.pdf_path = pdf_path
        self.pdf_text_blocks = []
        self.page_texts = {}  # Store full page text for long string searches
        self.load_pdf()
    
    def load_pdf(self):
        """Load PDF and extract all text with coordinates"""
        doc = fitz.open(self.pdf_path)
        
        for page_num in range(len(doc)):
            page = doc[page_num]
            
            # Store full page text for long string matching
            full_page_text = page.get_text()
            self.page_texts[page_num + 1] = {
                'text': full_page_text,
                'blocks': page.get_text("dict")
            }
            
            # Method 1: Get text blocks with better sorting by position
            blocks = page.get_text("dict")
            page_blocks = []
            
            for block in blocks["blocks"]:
                if "lines" in block:
                    for line in block["lines"]:
                        for span in line["spans"]:
                            text = span["text"].strip()
                            if text and len(text) > 2:
                                page_blocks.append({
                                    "text": text,
                                    "bbox": span["bbox"],
                                    "page": page_num + 1,
                                    "type": "span"
                                })
            
            # Sort blocks by reading order (top to bottom, left to right)
            page_blocks.sort(key=lambda x: (x["bbox"][1], x["bbox"][0]))
            self.pdf_text_blocks.extend(page_blocks)
            
            # Method 2: Get larger text blocks (paragraphs)
            text_blocks = page.get_text("blocks")
            for block in text_blocks:
                if len(block) >= 5:
                    text = block[4].strip()
                    bbox = block[:4]
                    if text and len(text) > 10:
                        self.pdf_text_blocks.append({
                            "text": text,
                            "bbox": bbox,
                            "page": page_num + 1,
                            "type": "block"
                        })
        
        doc.close()
        print(f"Loaded {len(self.pdf_text_blocks)} text elements from PDF")
        print(f"Loaded {len(self.page_texts)} pages of full text")
    
    def normalize_text(self, text: str) -> str:
        """Enhanced text normalization for better matching"""
        # Handle line breaks and multiple spaces
        text = re.sub(r'\s*\n\s*', ' ', text)  # Replace line breaks with spaces
        text = re.sub(r'\s+', ' ', text.strip())  # Normalize whitespace
        
        # Handle common PDF artifacts
        text = re.sub(r'-\s+', '', text)  # Remove hyphenation at line breaks
        text = re.sub(r'[^\w\s.,!?;:\-()"\']', ' ', text)  # Replace special chars with space
        text = re.sub(r'\s+', ' ', text.strip())  # Clean up again
        
        return text.lower()

    def find_in_full_page_text(self, search_text: str, similarity_threshold: int = 80) -> List[Dict]:
        """Search for long strings across full page text"""
        normalized_search = self.normalize_text(search_text)
        matches = []
        
        for page_num, page_data in self.page_texts.items():
            normalized_page = self.normalize_text(page_data['text'])
            
            # Check if the search text appears in the full page
            if normalized_search in normalized_page or fuzz.partial_ratio(normalized_search, normalized_page) >= similarity_threshold:
                # Try to find the approximate location by searching in blocks
                best_block_match = None
                best_similarity = 0
                
                # Look for the best matching block within this page
                page_blocks = [b for b in self.pdf_text_blocks if b['page'] == page_num]
                
                for block in page_blocks:
                    block_text = self.normalize_text(block['text'])
                    
                    # Check various similarity measures
                    partial_ratio = fuzz.partial_ratio(normalized_search, block_text)
                    token_ratio = fuzz.token_set_ratio(normalized_search, block_text)
                    ratio = fuzz.ratio(normalized_search, block_text)
                    
                    block_similarity = max(partial_ratio, token_ratio, ratio)
                    
                    if block_similarity > best_similarity:
                        best_similarity = block_similarity
                        best_block_match = block
                
                if best_block_match and best_similarity >= similarity_threshold:
                    matches.append({
                        "text": best_block_match["text"],
                        "coordinates": best_block_match["bbox"],
                        "page": page_num,
                        "similarity": best_similarity,
                        "match_type": "page_search",
                        "search_method": "full_page"
                    })
        
        return matches

    def find_with_sliding_window(self, search_text: str, window_size: int = 3) -> List[Dict]:
        """Search using sliding window of adjacent text blocks"""
        normalized_search = self.normalize_text(search_text)
        matches = []
        
        # Group blocks by page
        pages = {}
        for block in self.pdf_text_blocks:
            page = block['page']
            if page not in pages:
                pages[page] = []
            pages[page].append(block)
        
        # Search with sliding window within each page
        for page_num, page_blocks in pages.items():
            for i in range(len(page_blocks) - window_size + 1):
                window_blocks = page_blocks[i:i + window_size]
                
                # Combine text from window
                combined_text = ' '.join([block['text'] for block in window_blocks])
                normalized_combined = self.normalize_text(combined_text)
                
                # Check similarity
                partial_ratio = fuzz.partial_ratio(normalized_search, normalized_combined)
                token_ratio = fuzz.token_set_ratio(normalized_search, normalized_combined)
                
                similarity = max(partial_ratio, token_ratio)
                
                if similarity >= 70:  # Lower threshold for sliding window
                    # Use the bounding box of the first block (could be improved)
                    first_block = window_blocks[0]
                    last_block = window_blocks[-1]
                    
                    # Create combined bounding box
                    min_x0 = min(b['bbox'][0] for b in window_blocks)
                    min_y0 = min(b['bbox'][1] for b in window_blocks)
                    max_x1 = max(b['bbox'][2] for b in window_blocks)
                    max_y1 = max(b['bbox'][3] for b in window_blocks)
                    
                    matches.append({
                        "text": combined_text[:100] + "..." if len(combined_text) > 100 else combined_text,
                        "coordinates": (min_x0, min_y0, max_x1, max_y1),
                        "page": page_num,
                        "similarity": similarity,
                        "match_type": "sliding_window",
                        "window_size": window_size
                    })
        
        return matches

    def find_text_coordinates(self, search_text: str, similarity_threshold: int = 80) -> List[Dict]:
        """
        Enhanced text finding with multiple strategies for long strings
        """
        normalized_search = self.normalize_text(search_text)
        all_matches = []
        
        # Strategy 1: Original block-by-block search (good for short text)
        for block in self.pdf_text_blocks:
            normalized_block = self.normalize_text(block["text"])
            
            exact_match = normalized_search in normalized_block
            fuzzy_ratio = fuzz.ratio(normalized_search, normalized_block)
            partial_ratio = fuzz.partial_ratio(normalized_search, normalized_block)
            token_ratio = fuzz.token_set_ratio(normalized_search, normalized_block)
            
            best_similarity = max(fuzzy_ratio, partial_ratio, token_ratio)
            
            if exact_match or best_similarity >= similarity_threshold:
                all_matches.append({
                    "text": block["text"],
                    "coordinates": block["bbox"],
                    "page": block["page"],
                    "similarity": 100 if exact_match else best_similarity,
                    "match_type": "exact" if exact_match else "fuzzy",
                    "search_method": "block"
                })
        
        # Strategy 2: Full page search (good for long strings)
        if len(normalized_search.split()) > 5:  # Use for longer text
            page_matches = self.find_in_full_page_text(search_text, similarity_threshold - 10)
            all_matches.extend(page_matches)
        
        # Strategy 3: Sliding window search (good for medium strings)
        if len(normalized_search.split()) > 3:
            window_matches = self.find_with_sliding_window(search_text)
            all_matches.extend(window_matches)
        
        # Remove duplicates and sort by similarity
        seen_coords = set()
        unique_matches = []
        
        for match in all_matches:
            coord_key = (match["page"], tuple(match["coordinates"]))
            if coord_key not in seen_coords:
                seen_coords.add(coord_key)
                unique_matches.append(match)
        
        unique_matches.sort(key=lambda x: x["similarity"], reverse=True)
        return unique_matches
    
    def get_coordinates(self, text: str) -> Optional[Tuple[float, float, float, float, int]]:
        """
        Simple function: give text, get coordinates
        
        Args:
            text: Text to find
            
        Returns:
            (x0, y0, x1, y1, page) or None if not found
        """
        matches = self.find_text_coordinates(text, similarity_threshold=70)
        
        if matches:
            best_match = matches[0]
            coords = best_match["coordinates"]
            page = best_match["page"]
            return (coords[0], coords[1], coords[2], coords[3], page)
        
        return None
    
    def find_multiple_texts(self, text_list: List[str]) -> Dict[str, List[Dict]]:
        """
        Find coordinates for multiple texts at once
        
        Args:
            text_list: List of texts to search for
            
        Returns:
            Dictionary mapping each text to its matches
        """
        results = {}
        for text in text_list:
            results[text] = self.find_text_coordinates(text)
        return results

    def find_long_text_smart(self, search_text: str, min_chunk_words: int = 4) -> List[Dict]:
        """
        Smart search for very long text by breaking it into chunks and finding the best matches
        
        Args:
            search_text: Long text to search for
            min_chunk_words: Minimum words per chunk
            
        Returns:
            List of matches for the text or its best-matching parts
        """
        # First try to find the complete text
        complete_matches = self.find_text_coordinates(search_text, similarity_threshold=70)
        
        if complete_matches:
            return complete_matches
            
        # If no complete match, break into meaningful chunks
        words = search_text.split()
        if len(words) <= min_chunk_words:
            return []
            
        chunks = []
        chunk_size = max(min_chunk_words, len(words) // 4)  # Adaptive chunk size
        
        for i in range(0, len(words), chunk_size):
            chunk = ' '.join(words[i:i + chunk_size])
            if len(chunk.split()) >= min_chunk_words:
                chunks.append(chunk)
        
        # Find matches for each chunk
        all_chunk_matches = []
        for chunk in chunks:
            chunk_matches = self.find_text_coordinates(chunk, similarity_threshold=70)
            for match in chunk_matches:
                match['chunk_text'] = chunk
                match['original_text'] = search_text
                all_chunk_matches.append(match)
        
        # Sort by similarity and return best matches
        all_chunk_matches.sort(key=lambda x: x['similarity'], reverse=True)
        return all_chunk_matches[:3]  # Return top 3 chunk matches

# Simple usage functions
def find_text_in_pdf(pdf_path: str, text: str) -> Optional[Tuple[float, float, float, float, int]]:
    """
    Simplest usage: find text in PDF and return coordinates
    
    Args:
        pdf_path: Path to PDF file
        text: Text to search for
        
    Returns:
        (x0, y0, x1, y1, page_number) or None if not found
    """
    finder = TextToCoordinatesFinder(pdf_path)
    return finder.get_coordinates(text)

def find_multiple_texts_in_pdf(pdf_path: str, texts: List[str]) -> Dict[str, Optional[Tuple]]:
    """
    Find multiple texts and return their coordinates
    
    Args:
        pdf_path: Path to PDF file
        texts: List of texts to search for
        
    Returns:
        Dictionary mapping text to coordinates
    """
    finder = TextToCoordinatesFinder(pdf_path)
    results = {}
    
    for text in texts:
        coords = finder.get_coordinates(text)
        results[text] = coords
    
    return results

def highlight_text_in_pdf(pdf_path: str, texts: List[str], output_path: str, 
                         colors: Optional[List[Tuple[float, float, float]]] = None) -> bool:
    """
    Find texts in PDF, draw rectangles around them, and save as new file
    Enhanced to handle long strings better
    
    Args:
        pdf_path: Input PDF path
        texts: List of texts to find and highlight
        output_path: Output PDF path
        colors: List of RGB colors (0-1) for each text. Default: different colors for each
        
    Returns:
        True if successful, False otherwise
    """
    try:
        finder = TextToCoordinatesFinder(pdf_path)
        doc = fitz.open(pdf_path)
        
        # Default colors if not provided
        if colors is None:
            colors = [
                (1, 0, 0),      # Red
                (0, 1, 0),      # Green  
                (0, 0, 1),      # Blue
                (1, 0.5, 0),    # Orange
                (1, 0, 1),      # Magenta
                (0, 1, 1),      # Cyan
                (0.5, 0, 0.5),  # Purple
                (0.8, 0.8, 0),  # Yellow
            ]
        
        annotations_added = 0
        
        for i, text in enumerate(texts):
            color = colors[i % len(colors)]  # Cycle through colors
            
            # Use smart search for long texts
            if len(text.split()) > 10:  # Long text
                print(f"\nUsing smart search for long text: '{text[:50]}...'")
                matches = finder.find_long_text_smart(text)
                if not matches:
                    # Fallback to regular search with lower threshold
                    matches = finder.find_text_coordinates(text, similarity_threshold=60)
            else:
                matches = finder.find_text_coordinates(text, similarity_threshold=70)
            
            if not matches:
                print(f"❌ No matches found for: '{text[:50]}...'")
                continue
                
            print(f"✅ Found {len(matches)} matches for: '{text[:50]}...'")
            
            # Highlight all matches (or just the best ones for long text)
            matches_to_highlight = matches[:2] if len(text.split()) > 10 else matches
            
            for match in matches_to_highlight:
                page_num = match["page"] - 1  # Convert to 0-based
                coords = match["coordinates"]
                
                if page_num < len(doc):
                    page = doc[page_num]
                    
                    # Create rectangle annotation
                    rect = fitz.Rect(coords[0], coords[1], coords[2], coords[3])
                    
                    # Add highlight annotation
                    highlight = page.add_highlight_annot(rect)
                    highlight.set_colors(stroke=color)
                    highlight.update()
                    
                    # Also add a border rectangle for better visibility
                    page.draw_rect(rect, color=color, width=2)
                    
                    annotations_added += 1
                    search_method = match.get('search_method', 'unknown')
                    similarity = match.get('similarity', 0)
                    print(f"  📍 Highlighted on page {match['page']} (similarity: {similarity}%, method: {search_method})")
        
        # Save the modified PDF
        doc.save(output_path)
        doc.close()
        
        print(f"\n🎉 Saved highlighted PDF to: {output_path}")
        print(f"📊 Total annotations added: {annotations_added}")
        return True
        
    except Exception as e:
        print(f"❌ Error highlighting PDF: {e}")
        import traceback
        traceback.print_exc()
        return False

def draw_rectangles_on_pdf(pdf_path: str, texts: List[str], output_path: str) -> bool:
    """
    Simpler version: just draw colored rectangles around found text
    
    Args:
        pdf_path: Input PDF path  
        texts: List of texts to find and mark
        output_path: Output PDF path
        
    Returns:
        True if successful
    """
    try:
        finder = TextToCoordinatesFinder(pdf_path)
        doc = fitz.open(pdf_path)
        
        colors = [(1, 0, 0), (0, 1, 0), (0, 0, 1), (1, 0.5, 0), (1, 0, 1)]
        
        for i, text in enumerate(texts):
            color = colors[i % len(colors)]
            matches = finder.find_text_coordinates(text)
            
            for match in matches[:1]:  # Only highlight best match
                page_num = match["page"] - 1
                coords = match["coordinates"]
                
                if page_num < len(doc):
                    page = doc[page_num]
                    rect = fitz.Rect(coords[0], coords[1], coords[2], coords[3])
                    
                    # Draw rectangle border
                    page.draw_rect(rect, color=color, width=3)
                    
                    # Add text label
                    label_point = fitz.Point(coords[0], coords[1] - 5)
                    page.insert_text(label_point, f"Found: {text[:20]}...", 
                                   fontsize=8, color=color)
                    
                    print(f"Marked '{text}' on page {match['page']}")
        
        doc.save(output_path)
        doc.close()
        print(f"Saved marked PDF to: {output_path}")
        return True
        
    except Exception as e:
        print(f"Error: {e}")
        return False

# Example usage
if __name__ == "__main__":
    # Test the enhanced long string search
    search_texts = [
        # Long strings from the legal document (these should now work better)
        "The high court ordered Datacentrix (Pty) Ltd (the appellant) to pay an amount of R1 936 815 plus interest for breach of contract",
        "On 25 November 2013, the parties concluded a written Implementation and Support Services Agreement",
        "should a party to the agreement commit a material breach of the agreement and fails to remedy such breach within 30 days",
        
          
        # Medium strings  
        "The respondent provides various services including manufacturing, warehousing, distributing and marketing",
        "Contracts frequently provide that in the event of breach the aggrieved party should give the party in breach notice"
    ]
    
    print("🔍 Testing Enhanced PDF Text Highlighter with Long Strings!")
    print("=" * 60)
    
    # Test function for the new capabilities
    def test_long_string_search(pdf_file, test_texts):
        print(f"\n📋 Testing with PDF: {pdf_file}")
        print(f"📝 Number of test strings: {len(test_texts)}")
        
        try:
            finder = TextToCoordinatesFinder(pdf_file)
            
            for i, text in enumerate(test_texts):
                word_count = len(text.split())
                print(f"\n{i+1}. Testing text ({word_count} words): '{text[:60]}...'")
                
                if word_count > 10:
                    # Use smart search for long text
                    matches = finder.find_long_text_smart(text)
                    print(f"   🧠 Used smart search")
                else:
                    # Regular search
                    matches = finder.find_text_coordinates(text)
                    print(f"   🔍 Used regular search")
                
                if matches:
                    print(f"   ✅ Found {len(matches)} matches:")
                    for j, match in enumerate(matches[:2]):  # Show top 2
                        method = match.get('search_method', 'unknown')
                        similarity = match.get('similarity', 0)
                        page = match['page']
                        print(f"      {j+1}. Page {page}, Similarity: {similarity}%, Method: {method}")
                else:
                    print(f"   ❌ No matches found")
                
        except Exception as e:
            print(f"❌ Error during testing: {e}")
    
    # Run the test
    test_long_string_search("162.pdf", search_texts)
    
    print("\n" + "="*60)
    print("🎨 Now highlighting the text in PDF...")
    
    # Method 1: Enhanced highlighting with long string support
    success = highlight_text_in_pdf(
        pdf_path="162.pdf",
        texts=search_texts,
        output_path="enhanced_highlighted_document.pdf"
    )
    
    if success:
        print("✅ Enhanced highlighting completed successfully!")
    else:
        print("❌ Enhanced highlighting failed!")
    
    print("\n" + "="*60)
    print("📖 Usage Instructions:")
    print("For long strings: The system now uses multiple search strategies:")
    print("  • Full page text search")
    print("  • Sliding window search")  
    print("  • Smart chunking for very long text")
    print("  • Enhanced text normalization")
    print("\nRecommended functions:")
    print("  highlight_text_in_pdf('input.pdf', ['long text...'], 'output.pdf')")
    print("  finder.find_long_text_smart('very long text...')")
    
    # Quick test function
    def test_highlight(pdf_file, texts_to_find):
        print(f"\n🧪 Quick Test with: {len(texts_to_find)} texts")
        success = highlight_text_in_pdf(pdf_file, texts_to_find, "quick_test_output.pdf")
        if success:
            print("✓ Successfully created highlighted PDF!")
        else:
            print("✗ Failed to create highlighted PDF")
        return success