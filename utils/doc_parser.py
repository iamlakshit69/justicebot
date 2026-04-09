import io
import fitz
from docx import Document


def parse_pdf(file_bytes: bytes) -> str:
    """Parse PDF from raw bytes and return extracted text."""
    text = ""
    pdf = fitz.open(stream=file_bytes, filetype="pdf")
    for page in pdf:
        text += page.get_text()
    pdf.close()
    return text.strip()


def parse_docx(file_bytes: bytes) -> str:
    """Parse DOCX from raw bytes and return extracted text."""
    doc = Document(io.BytesIO(file_bytes))
    text = ""
    for paragraph in doc.paragraphs:
        if paragraph.text.strip():
            text += paragraph.text + "\n"
    return text.strip()


def parse_document(file_bytes: bytes, filename: str) -> str:
    """
    Parse a document from raw bytes based on file extension.
    Supports PDF and DOCX formats.
    """
    filename = filename.lower()

    if filename.endswith(".pdf"):
        return parse_pdf(file_bytes)
    elif filename.endswith(".docx"):
        return parse_docx(file_bytes)
    else:
        return ""