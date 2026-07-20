"""
Simple Unified PDF Text Search & Highlight
Combines pdfplumber (for finding) + PyMuPDF (for highlighting)
"""

import fitz  # PyMuPDF for highlighting
import pdfplumber  # for text finding
from typing import List, Dict, Tuple, Optional

def find_and_highlight_text(pdf_path: str, search_texts: List[str], output_path: str) -> bool:
    """
    Simple function: find text with pdfplumber, highlight with PyMuPDF
    
    Args:
        pdf_path: Input PDF path
        search_texts: List of texts to find and highlight  
        output_path: Output highlighted PDF path
        
    Returns:
        True if successful
    """
    try:
        print(f"🔍 Processing PDF: {pdf_path}")
        
        # Step 1: Find text using pdfplumber (more reliable text extraction)
        text_locations = {}
        
        with pdfplumber.open(pdf_path) as pdf:
            for search_text in search_texts:
                print(f"\n📝 Searching for: '{search_text[:40]}...'")
                text_locations[search_text] = []
                
                for page_num, page in enumerate(pdf.pages):
                    page_text = page.extract_text()
                    
                    if page_text and search_text.lower() in page_text.lower():
                        # Found on this page - get approximate coordinates
                        words = page.extract_words()
                        search_words = search_text.lower().split()
                        
                        # Look for word sequences that match
                        for i in range(len(words) - len(search_words) + 1):
                            word_sequence = [words[j]['text'].lower() for j in range(i, i + len(search_words))]
                            
                            # Simple matching - check if all search words appear
                            matches = sum(1 for sw in search_words if any(sw in w for w in word_sequence))
                            
                            if matches >= len(search_words) * 0.8:  # 80% match
                                # Get bounding box
                                sequence_words = words[i:i + len(search_words)]
                                
                                x0 = min(word['x0'] for word in sequence_words)
                                y0 = min(word['top'] for word in sequence_words)
                                x1 = max(word['x1'] for word in sequence_words)
                                y1 = max(word['bottom'] for word in sequence_words)
                                
                                text_locations[search_text].append({
                                    'page': page_num + 1,
                                    'bbox': (x0, y0, x1, y1),
                                    'matched_text': ' '.join([w['text'] for w in sequence_words])
                                })
                                print(f"  ✅ Found on page {page_num + 1}")
                                break
                
                if not text_locations[search_text]:
                    print(f"  ❌ Not found: '{search_text[:40]}...'")
        
        # Step 2: Highlight using PyMuPDF (better for annotations)
        doc = fitz.open(pdf_path)
        colors = [(1, 0, 0), (0, 1, 0), (0, 0, 1), (1, 0.5, 0), (1, 0, 1), (0, 1, 1)]
        total_highlights = 0
        
        for i, (search_text, locations) in enumerate(text_locations.items()):
            if not locations:
                continue
                
            color = colors[i % len(colors)]
            print(f"\n🎨 Highlighting '{search_text[:30]}...' in {color}")
            
            for location in locations:
                page_num = location['page'] - 1  # Convert to 0-based
                bbox = location['bbox']
                
                if page_num < len(doc):
                    page = doc[page_num]
                    
                    # Create highlight rectangle
                    rect = fitz.Rect(bbox[0], bbox[1], bbox[2], bbox[3])
                    
                    # Add highlight
                    highlight = page.add_highlight_annot(rect)
                    highlight.set_colors(stroke=color)
                    highlight.update()
                    
                    # Add border for visibility
                    page.draw_rect(rect, color=color, width=2)
                    
                    total_highlights += 1
                    print(f"  📍 Highlighted on page {location['page']}")
        
        # Save result
        doc.save(output_path)
        doc.close()
        
        print(f"\n✅ Success! Created: {output_path}")
        print(f"📊 Total highlights: {total_highlights}")
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

def quick_find_text(pdf_path: str, search_text: str) -> List[Dict]:
    """
    Quick function to just find text coordinates without highlighting
    
    Returns:
        List of locations where text was found
    """
    locations = []
    
    try:
        with pdfplumber.open(pdf_path) as pdf:
            for page_num, page in enumerate(pdf.pages):
                page_text = page.extract_text()
                
                if page_text and search_text.lower() in page_text.lower():
                    # Try to get exact coordinates using built-in search first
                    doc = fitz.open(pdf_path)
                    fitz_page = doc[page_num]
                    
                    # Use PyMuPDF's search for exact coordinates
                    text_instances = fitz_page.search_for(search_text)
                    
                    if text_instances:
                        for rect in text_instances:
                            locations.append({
                                'page': page_num + 1,
                                'coordinates': (rect.x0, rect.y0, rect.x1, rect.y1),
                                'method': 'exact_pymupdf'
                            })
                    else:
                        # Fallback to pdfplumber coordinates
                        words = page.extract_words()
                        search_words = search_text.lower().split()
                        
                        for i in range(len(words) - len(search_words) + 1):
                            word_sequence = [words[j]['text'].lower() for j in range(i, i + len(search_words))]
                            
                            if all(sw in ' '.join(word_sequence) for sw in search_words):
                                sequence_words = words[i:i + len(search_words)]
                                
                                x0 = min(word['x0'] for word in sequence_words)
                                y0 = min(word['top'] for word in sequence_words)
                                x1 = max(word['x1'] for word in sequence_words)
                                y1 = max(word['bottom'] for word in sequence_words)
                                
                                locations.append({
                                    'page': page_num + 1,
                                    'coordinates': (x0, y0, x1, y1),
                                    'method': 'pdfplumber_fallback'
                                })
                                break
                    
                    doc.close()
    
    except Exception as e:
        print(f"Error in quick_find_text: {e}")
    
    return locations

# Super simple interface
def highlight_text_in_pdf(pdf_path: str, texts: List[str], output_path: str = None) -> bool:
    """
    Super simple interface - just provide PDF path and texts to highlight
    """
    if output_path is None:
        output_path = pdf_path.replace('.pdf', '_highlighted.pdf')
    
    return find_and_highlight_text(pdf_path, texts, output_path)

# Test the unified approach
if __name__ == "__main__":
    test_texts = [
        "The high court ordered Datacentrix (Pty) Ltd (the appellant) to pay an amount of R1 936 815 plus interest for breach of contract",
        "breach of contract",
        "Datacentrix", 
        "material breach"
    ]
    
    print("🚀 Testing Unified PDF Search & Highlight")
    print("="*50)
    
    # Test 1: Full highlighting
    success = find_and_highlight_text("162.pdf", test_texts, "unified_highlighted.pdf")
    
    if success:
        print("\n🎉 Unified highlighting completed successfully!")
    else:
        print("\n❌ Unified highlighting failed!")
    
    # Test 2: Quick coordinate finding
    print(f"\n🔍 Quick coordinate test:")
    for text in test_texts[:2]:  # Test first 2 texts
        locations = quick_find_text("162.pdf", text)
        print(f"  '{text[:25]}...': {len(locations)} locations found")
        for loc in locations[:1]:  # Show first location
            print(f"    📍 Page {loc['page']}: {loc['method']}")
    
    print(f"\n📖 Simple Usage:")
    print(f"  highlight_text_in_pdf('input.pdf', ['text1', 'text2'])")
    print(f"  # Creates: input_highlighted.pdf") 