import httpx
import fitz  # PyMuPDF
import logging
import asyncio
import sys
import gc  # Added for garbage collection

# Setup logging
logging.basicConfig(level=logging.INFO, stream=sys.stdout)
logger = logging.getLogger(__name__)


async def download_pdf(cdn_url: str) -> bytes:
    """Download PDF content from a URL."""
    file_name = cdn_url.split("/")[-1]
    logger.info(f"Downloading PDF from: {cdn_url}")

    async with httpx.AsyncClient(timeout=120.0) as client:
        try:
            response = await client.get(cdn_url)
            response.raise_for_status()
            logger.info(f"Successfully downloaded {file_name} ({len(response.content)} bytes)")
            return response.content
        except httpx.HTTPError as e:
            logger.error(f"HTTP error downloading {file_name} from {cdn_url}: {e}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error downloading {file_name}: {e}")
            raise


def pdf_to_text_sync(pdf_content: bytes, file_name: str) -> str:
    """Convert PDF content to text using PyMuPDF (synchronous)"""
    pdf_document = None
    try:
        pdf_document = fitz.open(stream=pdf_content, filetype="pdf")
        
        if pdf_document.is_repaired:
            logger.warning(f"PDF {file_name} was corrupted and has been repaired.")

        text_pages = []
        # Redirect PyMuPDF warnings to logs
        fitz.TOOLS.mupdf_display_errors(False)
        fitz.TOOLS.mupdf_warnings(reset=True)  # Clear previous warnings

        for page_num in range(len(pdf_document)):
            try:
                page = pdf_document.load_page(page_num)
                text = page.get_text()
                if text.strip():
                    text_pages.append(f"--- Page {page_num + 1} ---\n{text}")
            except Exception as e:
                logger.error(f"Error processing page {page_num + 1} of {file_name}: {e}")
                continue
        
        warnings = fitz.TOOLS.mupdf_warnings()
        if warnings:
            logger.warning(f"MuPDF warnings for {file_name}:\n{warnings}")

        full_text = "\n\n".join(text_pages)
        logger.info(f"Extracted {len(full_text)} characters from PDF {file_name}")
        return full_text
        
    except Exception as e:
        logger.error(f"Failed to process PDF {file_name}: {e}")
        return ""
    finally:
        # Ensure PDF document is always closed
        if pdf_document:
            try:
                pdf_document.close()
            except Exception as e:
                logger.error(f"Error closing PDF document {file_name}: {e}")
        
        # Force garbage collection to free memory
        gc.collect()


async def main():
    pdf_url = "https://cdn.caseon.io/ZAWCPrGaz-2024-1.pdf"
    
    try:
        pdf_content = await download_pdf(pdf_url)
        if pdf_content:
            file_name = pdf_url.split("/")[-1]
            text_content = pdf_to_text_sync(pdf_content, file_name)
            
            if text_content:
                print("\n--- EXTRACTED TEXT ---")
                print(text_content)
                print("--- END OF TEXT ---\n")
            else:
                print("No text content extracted from PDF")

    except Exception as e:
        logger.error(f"An error occurred during the process: {e}")


if __name__ == "__main__":
    asyncio.run(main()) 