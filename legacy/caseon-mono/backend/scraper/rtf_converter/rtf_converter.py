import os
import logging
import subprocess
import tempfile
import time
from io import BytesIO
from pathlib import Path
from typing import Optional

from striprtf.striprtf import rtf_to_text
from reportlab.lib import pagesizes
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_JUSTIFY, TA_CENTER, TA_LEFT
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib import colors
from fastapi import HTTPException

logger = logging.getLogger(__name__)

def convert_rtf_to_pdf(rtf_content: str, output_filename: str) -> bytes:
    """
    Convert RTF content to PDF using LibreOffice for robust conversion with table support.
    
    Args:
        rtf_content: The RTF content as a string
        output_filename: Base filename for the output (without extension)
        
    Returns:
        PDF content as bytes
    """
    # Create a temporary directory for the conversion process
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_dir_path = Path(temp_dir)
        logger.info(f"Created temporary directory: {temp_dir_path}")
        
        # Write RTF content to a temporary file
        rtf_file_path = temp_dir_path / f"{output_filename}.rtf"
        with open(rtf_file_path, 'w', encoding='utf-8') as f:
            f.write(rtf_content)
        logger.info(f"Wrote RTF content to file: {rtf_file_path}")
        
        # Define the output PDF path
        pdf_file_path = temp_dir_path / f"{output_filename}.pdf"
        
        # Convert RTF to PDF using LibreOffice
        try:
            # Use LibreOffice headless mode to convert the document
            cmd = [
                'libreoffice',
                '--headless',
                '--convert-to', 'pdf',
                '--outdir', str(temp_dir_path),
                str(rtf_file_path)
            ]
            
            logger.info(f"Executing LibreOffice command: {' '.join(cmd)}")
            
            # Execute the command
            process = subprocess.run(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                check=False
            )
            
            # Check if conversion was successful
            if process.returncode != 0:
                logger.error(f"LibreOffice conversion failed with code {process.returncode}")
                logger.error(f"STDOUT: {process.stdout}")
                logger.error(f"STDERR: {process.stderr}")
                # Fall back to second method if LibreOffice fails
                return _convert_rtf_to_pdf_fallback(rtf_content, output_filename, temp_dir_path)
            
            logger.info(f"LibreOffice conversion successful")
            
            # Read the PDF content
            if pdf_file_path.exists():
                with open(pdf_file_path, 'rb') as f:
                    pdf_content = f.read()
                logger.info(f"Read {len(pdf_content)} bytes from PDF file")
                return pdf_content
            else:
                logger.error(f"Expected PDF file not found at {pdf_file_path}")
                # Fall back to second method if PDF file not found
                return _convert_rtf_to_pdf_fallback(rtf_content, output_filename, temp_dir_path)
                
        except FileNotFoundError:
            logger.error("LibreOffice not found on the system, falling back to alternative method")
            return _convert_rtf_to_pdf_fallback(rtf_content, output_filename, temp_dir_path)
        except Exception as e:
            logger.error(f"Error during LibreOffice conversion: {str(e)}")
            return _convert_rtf_to_pdf_fallback(rtf_content, output_filename, temp_dir_path)

def _convert_rtf_to_pdf_fallback(rtf_content: str, output_filename: str, temp_dir_path: Path) -> bytes:
    """
    Fallback method using ReportLab for RTF to PDF conversion.
    Not as good with tables, but better than nothing.
    """
    logger.info(f"Using fallback RTF to PDF conversion method")
    
    try:
        from striprtf.striprtf import rtf_to_text
        import reportlab.lib.pagesizes as pagesizes
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.enums import TA_JUSTIFY, TA_CENTER, TA_LEFT
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
        from reportlab.lib import colors
        from io import BytesIO
        import re
        
        # Convert RTF to plain text
        plain_text = rtf_to_text(rtf_content)
        
        # Create a PDF in memory
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=pagesizes.letter)
        
        # Define styles
        styles = getSampleStyleSheet()
        styles.add(ParagraphStyle(
            name='Justify',
            alignment=TA_JUSTIFY,
            fontName='Helvetica',
            fontSize=10,
            leading=12,
            leftIndent=0,
            rightIndent=0
        ))
        
        # Try to identify table structures in the text
        story = []
        
        # Add title if we can detect one (first paragraph, all caps)
        paragraphs = plain_text.split('\n\n')
        if paragraphs and len(paragraphs) > 0:
            potential_title = paragraphs[0].strip()
            if potential_title.isupper() and len(potential_title) < 100:
                title_style = styles['Title']
                story.append(Paragraph(potential_title, title_style))
                story.append(Spacer(1, 12))
        
        # Process text to look for table patterns
        for paragraph in paragraphs:
            if not paragraph.strip():
                continue
                
            lines = paragraph.split('\n')
            
            # Check if this might be a table (multiple lines with similar structure)
            # This is a simple heuristic - look for consistent use of whitespace or separator chars
            potential_table = False
            if len(lines) > 2:
                # Check for lines with multiple spaces or tab characters as column separators
                spaces_pattern = re.compile(r'\s{2,}')
                separator_pattern = re.compile(r'[|│┃║]+')
                
                space_separators = [bool(spaces_pattern.search(line)) for line in lines]
                symbol_separators = [bool(separator_pattern.search(line)) for line in lines]
                
                # Check if most lines have the same separator pattern
                if (sum(space_separators) > len(lines) * 0.7) or (sum(symbol_separators) > len(lines) * 0.7):
                    potential_table = True
            
            if potential_table:
                # Process as table
                try:
                    # Determine the delimiter to use (spaces or symbols)
                    if sum(symbol_separators) > sum(space_separators):
                        # Replace all separator symbols with a standard one
                        processed_lines = [separator_pattern.sub('|', line) for line in lines]
                        delimiter = '|'
                    else:
                        # Replace multiple spaces with a single delimiter
                        processed_lines = [spaces_pattern.sub('|', line) for line in lines]
                        delimiter = '|'
                    
                    # Split each line by the delimiter
                    table_data = [line.split(delimiter) for line in processed_lines]
                    
                    # Ensure all rows have the same number of columns (pad with empty strings if necessary)
                    max_cols = max(len(row) for row in table_data)
                    for i in range(len(table_data)):
                        while len(table_data[i]) < max_cols:
                            table_data[i].append('')
                    
                    # Create the table
                    table = Table(table_data)
                    
                    # Add style to the table
                    style = TableStyle([
                        ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
                        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
                        ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
                        ('GRID', (0, 0), (-1, -1), 1, colors.black),
                    ])
                    table.setStyle(style)
                    
                    story.append(table)
                    story.append(Spacer(1, 12))
                except Exception as e:
                    logger.warning(f"Failed to process table structure: {str(e)}")
                    # Fall back to treating as normal paragraph
                    story.append(Paragraph(paragraph, styles['Justify']))
                    story.append(Spacer(1, 6))
            else:
                # Check if it might be a heading
                if paragraph.isupper() and len(paragraph) < 100:
                    story.append(Paragraph(paragraph, styles['Heading2']))
                # Check if it might be a list item
                elif paragraph.strip().startswith(('•', '-', '*', '1.', '(1)', '1)')):
                    story.append(Paragraph(paragraph, styles['BodyText']))
                # Regular paragraph
                else:
                    story.append(Paragraph(paragraph, styles['Justify']))
                
                story.append(Spacer(1, 6))
        
        # Build PDF
        doc.build(story)
        
        pdf_data = buffer.getvalue()
        buffer.close()
        
        return pdf_data
    except Exception as e:
        logger.error(f"Error in fallback RTF to PDF conversion: {str(e)}")
        
        # Ultimate fallback: the most basic conversion
        try:
            from striprtf.striprtf import rtf_to_text
            import reportlab.lib.pagesizes as pagesizes
            from reportlab.platypus import SimpleDocTemplate, Paragraph
            from reportlab.lib.styles import getSampleStyleSheet
            from io import BytesIO
            
            # Convert RTF to plain text
            plain_text = rtf_to_text(rtf_content)
            
            # Create a PDF in memory
            buffer = BytesIO()
            doc = SimpleDocTemplate(buffer, pagesize=pagesizes.letter)
            
            # Define styles
            styles = getSampleStyleSheet()
            style = styles["Normal"]
            
            # Format content into paragraphs
            paragraphs = []
            for line in plain_text.split('\n'):
                if line.strip():
                    p = Paragraph(line, style)
                    paragraphs.append(p)
                else:
                    paragraphs.append(Paragraph("<br/>", style))
            
            # Build the PDF
            doc.build(paragraphs)
            
            pdf_data = buffer.getvalue()
            buffer.close()
            
            return pdf_data
        except Exception as e:
            logger.error(f"Error in ultimate fallback RTF to PDF conversion: {str(e)}")
            raise Exception(f"All RTF to PDF conversion methods failed: {str(e)}")

def detect_tables_in_text(text: str):
    """
    Attempt to detect tables in plain text.
    Returns list of tables with their rows and columns.
    """
    tables = []
    
    # First pass: look for lines with multiple spaces or tabs that could indicate table structure
    lines = text.split('\n')
    potential_table_start = None
    current_table = []
    
    for i, line in enumerate(lines):
        stripped = line.strip()
        
        # Check for potential table identifiers
        has_multiple_spaces = "  " in stripped
        has_tabs = "\t" in stripped
        has_pipe_separators = "|" in stripped
        
        # Columns should be separated by consistent whitespace or pipe characters
        if has_multiple_spaces or has_tabs or has_pipe_separators:
            # Start tracking a potential table if not already
            if potential_table_start is None:
                potential_table_start = i
            
            # Add this line to the current table
            if has_pipe_separators:
                # Split by pipe for tables that use pipe separators
                cells = [cell.strip() for cell in stripped.split('|')]
                current_table.append(cells)
            else:
                # Split by whitespace for space-separated tables
                # Use a more sophisticated approach to handle multiple spaces
                import re
                cells = re.split(r' {2,}|\t+', stripped)
                cells = [cell.strip() for cell in cells if cell.strip()]
                current_table.append(cells)
        
        elif potential_table_start is not None:
            # End of a potential table
            # Only save if we found at least 2 rows and 2 columns
            if len(current_table) >= 2 and all(len(row) >= 2 for row in current_table):
                # Standardize the table dimensions by filling in empty cells
                max_cols = max(len(row) for row in current_table)
                for j, row in enumerate(current_table):
                    if len(row) < max_cols:
                        current_table[j] = row + [''] * (max_cols - len(row))
                
                tables.append(current_table)
            
            # Reset for next potential table
            potential_table_start = None
            current_table = []
    
    # Check for a table at the end of the document
    if potential_table_start is not None and len(current_table) >= 2:
        max_cols = max(len(row) for row in current_table)
        for j, row in enumerate(current_table):
            if len(row) < max_cols:
                current_table[j] = row + [''] * (max_cols - len(row))
        
        tables.append(current_table)
    
    return tables

def convert_with_reportlab_enhanced(rtf_content: str, filename: str) -> bytes:
    """Convert RTF to PDF using ReportLab with enhanced formatting and table detection"""
    plain_text = rtf_to_text(rtf_content)
    
    # Create a PDF in memory
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=pagesizes.letter)
    
    # Define styles
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(
        name='Justify',
        alignment=TA_JUSTIFY,
        fontName='Helvetica',
        fontSize=10,
        leading=12,
        leftIndent=0,
        rightIndent=0
    ))
    
    # Detect tables in the text
    tables = detect_tables_in_text(plain_text)
    
    # Process the document into paragraphs and tables
    story = []
    
    # Add title if we can detect one (first paragraph, all caps)
    paragraphs = plain_text.split('\n\n')
    if paragraphs and len(paragraphs) > 0:
        potential_title = paragraphs[0].strip()
        if potential_title.isupper() and len(potential_title) < 100:
            title_style = styles['Title']
            story.append(Paragraph(potential_title, title_style))
            story.append(Spacer(1, 12))
    
    # Convert detected tables into ReportLab Table objects
    table_texts = ['\n'.join('\t'.join(row) for row in table) for table in tables]
    
    # Process the document paragraph by paragraph
    current_position = 0
    for paragraph in paragraphs:
        if not paragraph.strip():
            continue
        
        # Check if this paragraph is part of a table
        is_table = False
        for table_text in table_texts:
            if paragraph in table_text:
                is_table = True
                break
        
        if is_table:
            # Skip paragraphs that are part of tables
            continue
        
        # Check if it might be a heading
        if paragraph.isupper() and len(paragraph) < 100:
            story.append(Paragraph(paragraph, styles['Heading2']))
        # Check if it might be a list item
        elif paragraph.strip().startswith(('•', '-', '*', '1.', '(1)', '1)')):
            story.append(Paragraph(paragraph, styles['BodyText']))
        # Regular paragraph
        else:
            story.append(Paragraph(paragraph.replace("\n", " "), styles['Justify']))
        
        story.append(Spacer(1, 6))
    
    # Add the tables at appropriate positions
    for table_data in tables:
        # Create ReportLab Table
        rl_table = Table(table_data)
        
        # Add basic styling
        rl_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.lightgrey),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.black),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ]))
        
        story.append(rl_table)
        story.append(Spacer(1, 12))
    
    # Build the PDF
    doc.build(story)
    
    pdf_data = buffer.getvalue()
    buffer.close()
    
    return pdf_data

def convert_with_reportlab_basic(rtf_content: str, filename: str) -> bytes:
    """
    Basic fallback conversion. Converts RTF to plain text and creates a 
    simple PDF without attempting to preserve formatting.
    """
    plain_text = rtf_to_text(rtf_content)
    
    # Create a PDF in memory
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=pagesizes.letter)
    
    # Define styles
    styles = getSampleStyleSheet()
    style = styles["Normal"]
    
    # Split into paragraphs and create a simple PDF
    paragraphs = []
    for line in plain_text.split('\n'):
        if line.strip():
            paragraphs.append(Paragraph(line, style))
        else:
            paragraphs.append(Paragraph("<br/>", style))
    
    # Build PDF
    doc.build(paragraphs)
    
    pdf_data = buffer.getvalue()
    buffer.close()
    
    return pdf_data 