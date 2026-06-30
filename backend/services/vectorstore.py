"""
vectorstore.py
--------------
ChromaDB singleton. Loaded ONCE at startup — never recreated per request.
bge-m3 supports 8192 tokens so our 800-token chunks are fully embedded.
"""

import logging
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_chroma import Chroma
from config import CHROMA_DIR, CHROMA_COLLECTION, EMBEDDING_MODEL

logger = logging.getLogger(__name__)

# Load embedding model once — takes ~20s on first run, cached after
logger.info(f"Loading embedding model: {EMBEDDING_MODEL}")
embeddings = HuggingFaceEmbeddings(
    model_name=EMBEDDING_MODEL,
    model_kwargs={"device": "cpu"},
    encode_kwargs={"normalize_embeddings": True},
)

# Connect to persistent ChromaDB
vectorstore = Chroma(
    collection_name=CHROMA_COLLECTION,
    embedding_function=embeddings,
    persist_directory=CHROMA_DIR,
)
logger.info(f"ChromaDB ready — collection: {CHROMA_COLLECTION}")


def get_vectorstore():
    """Returns the singleton vectorstore instance."""
    return vectorstore


def get_chunk_count():
    """Returns total chunks currently indexed in ChromaDB."""
    try:
        return vectorstore._collection.count()
    except Exception as e:
        logger.error(f"Chunk count failed: {e}")
        return 0


def get_all_documents():
    """
    Returns a deduplicated list of all APPROVED documents only.
    Used by the browse page — unapproved/pending papers are now
    correctly excluded, closing the visibility gap we identified earlier.
    """
    from database.submissions_repo import get_approved_source_stems

    try:
        approved_sources = get_approved_source_stems()
        results  = vectorstore.get()
        seen     = set()
        docs     = []
        for meta in results["metadatas"]:
            key = meta.get("source", "")
            # Skip anything not in the approved set
            if key and key in approved_sources and key not in seen:
                seen.add(key)
                docs.append({
                    "title":    meta.get("title", "Untitled"),
                    "authors":  meta.get("authors", "Unknown"),
                    "year":     meta.get("year", "Unknown"),
                    "college":  meta.get("college", "Unknown"),
                    "keywords": meta.get("keywords", ""),
                    "abstract": meta.get("abstract", ""),
                    "source":   key,
                })
        return docs
    except Exception as e:
        logger.error(f"get_all_documents failed: {e}")
        return []

def get_document_by_source(source: str):
    """
    Returns metadata for ONE specific document by its source stem
    (filename without extension, e.g. "ssrn-3348188").

    Replaces the old hardcoded getMockPaper() in detail.js — this is
    what makes the detail page show REAL title/authors/abstract instead
    of fictional placeholder data, which in turn is what gives
    Similarity/Summary/Gaps a real query to search against.

    Args:
        source: Document source stem to look up

    Returns:
        dict with title/authors/year/college/keywords/abstract/source,
        or None if no chunks exist for that source.
    """
    try:
        results = vectorstore.get(where={"source": source})

        if not results["metadatas"]:
            logger.warning(f"No document found for source: {source}")
            return None

        # All chunks from the same source share identical document-level
        # metadata (set once at ingestion) — only "page" differs — so the
        # first chunk's metadata is enough.
        meta = results["metadatas"][0]

        return {
            "title":    meta.get("title", "Untitled"),
            "authors":  meta.get("authors", "Unknown"),
            "year":     meta.get("year", "Unknown"),
            "college":  meta.get("college", "Unknown"),
            "keywords": meta.get("keywords", ""),
            "abstract": meta.get("abstract", ""),
            "source":   source,
        }
    except Exception as e:
        logger.error(f"get_document_by_source failed for '{source}': {e}")
        return None