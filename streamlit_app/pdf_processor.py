import fitz  # PyMuPDF
from typing import List, Union
from pathlib import Path

def extract_text_from_pdf(file: Union[Path, str, "UploadedFile"]) -> str:
    text = []

    if isinstance(file, (str, Path)):
        # Local PDF file
        with fitz.open(file) as doc:
            for page in doc:
                text.append(page.get_text("text"))
    else:
        # Streamlit uploaded file
        pdf_bytes = file.read()
        with fitz.open(stream=pdf_bytes, filetype="pdf") as doc:
            for page in doc:
                text.append(page.get_text("text"))

    return "\n".join(text)


def chunk_text(text: str, chunk_size: int = 500) -> List[str]:
    words = text.split()
    return [" ".join(words[i:i + chunk_size]) for i in range(0, len(words), chunk_size)]


def extract_and_chunk(file: Union[Path, str, "UploadedFile"], chunk_size: int = 500) -> List[str]:
    text = extract_text_from_pdf(file)
    return chunk_text(text, chunk_size)