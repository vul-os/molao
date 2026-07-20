"""
OCR-based PDF text search - Most reliable for complex PDFs
Requires: pip install pdf2image pillow pytesseract
"""

from pdf2image import convert_from_path
import pytesseract
from PIL import Image
import re
from typing import List, Dict, Tuple, Optional
import os

def find_text_with_ocr(pdf_path: str, search_text: str, dpi: int = 200) -> List[Dict]:
    """
    Use OCR to find text in PDF - most reliable method
    
    Args:
        pdf_path: Path to PDF
        search_text: Text to find
        dpi: Image resolution (higher = more accurate but slower)
    
    Returns:
        List of matches with coordinates
    """
    matches = []
    
    try:
        # Convert PDF to images
        pages = convert_from_path(pdf_path, dpi=dpi)
        
        for page_num, page_image in enumerate(pages):
            # Get OCR data with bounding boxes
            ocr_data = pytesseract.image_to_data(page_image, output_type=pytesseract.Output.DICT)
            
            # Extract text and coordinates
            page_text = ""
            word_boxes = []
            
            for i in range(len(ocr_data['text'])):
                word = ocr_data['text'][i].strip()
                if word:
                    x = ocr_data['left'][i]
                    y = ocr_data['top'][i] 
                    w = ocr_data['width'][i]
                    h = ocr_data['height'][i]
                    
                    word_boxes.append({
                        'text': word,
                        'bbox': (x, y, x + w, y + h),
                        'confidence': ocr_data['conf'][i]
                    })
                    page_text += word + " "
            
            # Search for text in the page
            if search_text.lower() in page_text.lower():
                # Find word-level matches
                search_words = search_text.lower().split()
                
                for i in range(len(word_boxes) - len(search_words) + 1):
                    sequence = word_boxes[i:i + len(search_words)]
                    sequence_text = " ".join([w['text'].lower() for w in sequence])
                    
                    # Check if this sequence matches our search
                    if all(sword in sequence_text for sword in search_words):
                        # Calculate bounding box for the sequence
                        x0 = min(w['bbox'][0] for w in sequence)
                        y0 = min(w['bbox'][1] for w in sequence)
                        x1 = max(w['bbox'][2] for w in sequence)
                        y1 = max(w['bbox'][3] for w in sequence)
                        
                        # Convert back to PDF coordinates (approximate)
                        # This is a simplified conversion - more precise methods exist
                        pdf_scale = 72 / dpi  # Convert from image pixels to PDF points
                        
                        matches.append({
                            "text": " ".join([w['text'] for w in sequence]),
                            "coordinates": (x0 * pdf_scale, y0 * pdf_scale, 
                                          x1 * pdf_scale, y1 * pdf_scale),
                            "page": page_num + 1,
                            "method": "ocr_search",
                            "confidence": sum(w['confidence'] for w in sequence) / len(sequence)
                        })
                        break  # Found one match, move to next position
    
    except Exception as e:
        print(f"OCR Error: {e}")
        return []
    
    return matches

def simple_ocr_search(pdf_path: str, search_texts: List[str]) -> Dict[str, List[Dict]]:
    """
    Simple OCR search for multiple texts
    """
    results = {}
    
    try:
        print("🔄 Converting PDF to images...")
        pages = convert_from_path(pdf_path, dpi=150)  # Lower DPI for speed
        
        for text in search_texts:
            print(f"🔍 OCR searching for: '{text[:30]}...'")
            results[text] = []
            
            for page_num, page_image in enumerate(pages):
                # Extract all text from the page
                page_text = pytesseract.image_to_string(page_image)
                
                # Simple text search
                if text.lower() in page_text.lower():
                    # Get more detailed data for coordinates
                    data = pytesseract.image_to_data(page_image, output_type=pytesseract.Output.DICT)
                    
                    # This is a simplified coordinate extraction
                    # For precise coordinates, you'd need more complex text matching
                    results[text].append({
                        "text": text,
                        "page": page_num + 1,
                        "method": "simple_ocr",
                        "found": True
                    })
                    print(f"  ✅ Found on page {page_num + 1}")
                    break
            
            if not results[text]:
                print(f"  ❌ Not found: '{text[:30]}...'")
    
    except Exception as e:
        print(f"❌ OCR Error: {e}")
        for text in search_texts:
            results[text] = []
    
    return results

# Test function
def test_ocr_methods(pdf_path: str, test_texts: List[str]):
    """
    Test OCR-based search methods
    """
    print("👁️ Testing OCR-based PDF search")
    print("="*50)
    
    # Simple OCR test
    print("\n1️⃣ Simple OCR Search:")
    simple_results = simple_ocr_search(pdf_path, test_texts)
    
    for text, matches in simple_results.items():
        print(f"  '{text[:20]}...': {len(matches)} matches")
    
    # Detailed OCR test (slower but more precise)
    print("\n2️⃣ Detailed OCR Search (first text only):")
    if test_texts:
        detailed_matches = find_text_with_ocr(pdf_path, test_texts[0])
        print(f"  Found {len(detailed_matches)} detailed matches")
        for match in detailed_matches[:2]:
            print(f"    📍 Page {match['page']}, Confidence: {match.get('confidence', 0):.1f}%")

if __name__ == "__main__":
    test_texts = [
        "The high court ordered Datacentrix",
        "breach of contract",
        "Datacentrix", 
        "material breach"
    ]
    
    try:
        test_ocr_methods("162.pdf", test_texts)
    except ImportError as e:
        print(f"❌ Missing dependency: {e}")
        print("Install with: pip install pdf2image pillow pytesseract")
        print("Also install poppler-utils (apt-get install poppler-utils)")
    except Exception as e:
        print(f"❌ Error: {e}") 