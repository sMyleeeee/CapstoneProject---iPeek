"""
ingestor.py
-----------
PDF ingestion pipeline:
  1. Validate + save uploaded PDF to PENDING_DIR (raw, no watermark)
  2. Extract text PER PAGE with PyMuPDF (required for page-level citations)
  3. Extract metadata (title, authors, year, college) via Groq LLM
  4. Split each page's text into 800-token chunks with 150-token overlap
     (splitting happens per-page, NOT across the whole document, so every
     chunk maps to exactly one unambiguous page number)
  5. Index into ChromaDB with metadata — including page number — attached
     to every chunk

WATERMARKING:
  When a librarian approves a submission, watermark_pdf(source_stem) is called.
  It reads the raw original from PENDING_DIR, applies a diagonal text watermark
  using PyMuPDF on every page, and saves the result to PUBLIC_DIR.
  Students only ever receive the watermarked copy from PUBLIC_DIR.
  ChromaDB ingestion always runs on the original (no watermark text in chunks).

FOLDER LAYOUT:
  papers/pending/   — raw originals, never served to students
  papers/public/    — watermarked copies, served by /api/pdf/<source>

NOTE: Any PDFs ingested before this change have no "page" metadata and must be
re-ingested for page citations to work on them.
"""

import json
import logging
import math
from pathlib import Path
from werkzeug.utils import secure_filename
import fitz  # PyMuPDF

from langchain_groq import ChatGroq
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document

from config import (
    GROQ_API_KEY, LLM_MODEL, CHUNK_SIZE,
    CHUNK_OVERLAP, ALLOWED_EXTENSIONS, PAPERS_DIR
)
from services.vectorstore import get_vectorstore

logger = logging.getLogger(__name__)

# ── Folder setup ──────────────────────────────────────────────────────────────
# PENDING_DIR — raw originals uploaded by students, never served publicly
# PUBLIC_DIR  — watermarked copies served to authenticated viewers
PENDING_DIR = PAPERS_DIR / "pending"
PUBLIC_DIR  = PAPERS_DIR / "public"
PENDING_DIR.mkdir(parents=True, exist_ok=True)
PUBLIC_DIR.mkdir(parents=True, exist_ok=True)

# LLM for metadata extraction — low temp for consistent JSON output
llm = ChatGroq(model=LLM_MODEL, api_key=GROQ_API_KEY, temperature=0.1)

# Text splitter — tries paragraph breaks first, then sentences, then words.
# Applied PER PAGE (see ingest_pdf below), not across the whole document.
splitter = RecursiveCharacterTextSplitter(
    chunk_size=CHUNK_SIZE,
    chunk_overlap=CHUNK_OVERLAP,
)


def _allowed(filename: str) -> bool:
    """Returns True if file extension is in ALLOWED_EXTENSIONS."""
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def _extract_pages(path: str) -> list[dict]:
    """
    Extracts text from a PDF page by page using PyMuPDF.

    Unlike whole-document extraction, this preserves page boundaries so
    every chunk can later be tagged with an unambiguous page number —
    required for inline (p. X) citations in the RAG responses.

    Args:
        path: Absolute path to the saved PDF file

    Returns:
        List of dicts, one per non-blank page:
            [{"page": 1, "text": "..."}, {"page": 2, "text": "..."}, ...]
        Page numbers are 1-indexed (page 1 = first page of the PDF).
        Returns an empty list if extraction fails or the PDF has no text
        (e.g. a scanned/image-only PDF).
    """
    try:
        doc   = fitz.open(path)
        pages = []
        for i, page in enumerate(doc, start=1):
            text = page.get_text()
            # Skip pages with no extractable text (blank pages, pure images)
            if text.strip():
                pages.append({"page": i, "text": text})
        logger.info(f"Extracted {len(pages)} pages with text from {Path(path).name}")
        return pages
    except Exception as e:
        logger.error(f"Page extraction failed: {e}")
        return []


def _extract_metadata(pages: list[dict], fallback_name: str) -> dict:
    """
    Sends the first 3000 characters (reconstructed from the pages list,
    in page order) to Groq LLM to extract structured metadata.

    Only the first 3000 chars are used — this covers the title page and
    abstract for most theses, and keeps the metadata-extraction prompt cheap.

    Falls back to safe defaults if the LLM call or JSON parsing fails.

    Args:
        pages:         List of per-page dicts from _extract_pages()
        fallback_name: Filename stem used as the title if extraction fails

    Returns:
        dict with keys: title, authors, year, college, abstract, keywords
    """
    # Reconstruct a single "head of document" string from the first pages,
    # since metadata extraction doesn't need page boundaries — only ingestion does.
    combined_head = "\n".join(p["text"] for p in pages)[:3000]

    prompt = f"""
Extract metadata from this ISAT-U academic thesis document.
Return ONLY valid JSON with these exact keys. Use "Unknown" if not found.

{{
  "title":    "Full research title",
  "authors":  "All authors comma-separated",
  "year":     "4-digit year",
  "college":  "College name e.g. College of Engineering",
  "abstract": "First 2 sentences of abstract",
  "keywords": "Keywords comma-separated"
}}

Document (first 3000 characters):
{combined_head}
"""
    try:
        resp = llm.invoke(prompt).content.strip()
        # Strip markdown fences if present
        if "```" in resp:
            resp = resp.split("```")[1]
            if resp.startswith("json"):
                resp = resp[4:]
        return json.loads(resp.strip())
    except Exception as e:
        logger.warning(f"Metadata extraction failed, using defaults: {e}")
        return {
            "title": fallback_name, "authors": "Unknown",
            "year": "Unknown", "college": "Unknown",
            "abstract": combined_head[:200], "keywords": "Unknown",
        }


def ingest_pdf(file) -> dict:
    """
    Main entry point for PDF ingestion.
    Called by the /api/ingest route when a student submits a paper.

    Saves the raw PDF to PENDING_DIR (not served to students).
    ChromaDB ingestion runs on the original so watermark text never
    pollutes chunk content.

    Args:
        file: Flask file object from request.files

    Returns:
        { success, message, metadata, chunks, source }

    Raises:
        ValueError: Invalid file type or no extractable text
    """
    # Validate file type
    if not _allowed(file.filename):
        raise ValueError("Only PDF files are accepted.")

    # Sanitize filename — prevents directory traversal attacks
    filename  = secure_filename(file.filename)
    stem      = Path(filename).stem
    save_path = str(PENDING_DIR / filename)

    # Save raw original to PENDING_DIR — never served publicly
    file.save(save_path)
    logger.info(f"Saved to pending: {save_path}")

    # Extract text PER PAGE — required for page citations
    pages = _extract_pages(save_path)
    if not pages:
        raise ValueError("No text found. This may be a scanned PDF. Please upload a text-based PDF.")

    # Extract metadata via LLM
    meta = _extract_metadata(pages, stem)
    logger.info(f"Metadata: {meta['title']} | {meta['authors']} | {meta['year']}")

    # Split EACH PAGE separately — guarantees one unambiguous page number per chunk
    documents = []
    for p in pages:
        page_chunks = splitter.split_text(p["text"])
        for chunk in page_chunks:
            documents.append(
                Document(
                    page_content=chunk,
                    metadata={
                        "title":    meta.get("title", stem),
                        "authors":  meta.get("authors", "Unknown"),
                        "year":     meta.get("year", "Unknown"),
                        "college":  meta.get("college", "Unknown"),
                        "keywords": meta.get("keywords", "Unknown"),
                        "abstract": meta.get("abstract", ""),
                        "source":   stem,
                        "page":     p["page"],
                    }
                )
            )

    logger.info(f"Split into {len(documents)} chunks across {len(pages)} pages")

    # Index into ChromaDB
    get_vectorstore().add_documents(documents)
    logger.info(f"Indexed {len(documents)} chunks for: {meta['title']}")

    return {
        "success":  True,
        "message":  f"'{meta['title']}' submitted — {len(documents)} chunks indexed across {len(pages)} pages. Pending librarian review.",
        "metadata": meta,
        "chunks":   len(documents),
        "source":   stem,
    }


def watermark_pdf(source_stem: str) -> str:
    """
    Applies a diagonal text watermark to every page of a PDF and saves
    the result to PUBLIC_DIR. Called by the librarian approval route.

    The raw original in PENDING_DIR is never modified.
    ChromaDB already indexed the original — no re-ingestion needed.

    Args:
        source_stem: The filename stem (no extension) of the PDF to watermark.
                     e.g. "my_thesis" for "my_thesis.pdf"

    Returns:
        Absolute path to the watermarked file in PUBLIC_DIR.

    Raises:
        FileNotFoundError: If the source PDF is not found in PENDING_DIR.
        RuntimeError:      If PyMuPDF fails to process the PDF.
    """
    src_path  = PENDING_DIR / f"{source_stem}.pdf"
    dest_path = PUBLIC_DIR  / f"{source_stem}.pdf"

    if not src_path.exists():
        raise FileNotFoundError(f"Pending PDF not found: {src_path}")

    try:
        doc = fitz.open(str(src_path))

        for page in doc:
            w, h = page.rect.width, page.rect.height

            # Diagonal watermark — centered, rotated 45°, semi-transparent grey
            # Repeated in a grid so it covers the full page regardless of size
            wm_text  = "ISAT-U Research Repository — For Academic Use Only"
            fontsize = 14
            color    = (0.6, 0.6, 0.6)   # medium grey
            alpha    = 0.25               # semi-transparent

            # Insert watermark text in a grid pattern across the page
            step_x = 220
            step_y = 160
            x = 0
            while x < w + step_x:
                y = 0
                while y < h + step_y:
                    page.insert_text(
                        fitz.Point(x, y),
                        wm_text,
                        fontsize=fontsize,
                        color=color,
                        rotate=45,
                        overlay=True,
                    )
                    y += step_y
                x += step_x

        doc.save(str(dest_path), deflate=True)
        doc.close()

        logger.info(f"Watermarked PDF saved: {dest_path}")
        return str(dest_path)

    except Exception as e:
        logger.error(f"Watermarking failed for {source_stem}: {e}")
        raise RuntimeError(f"Watermarking failed: {e}")