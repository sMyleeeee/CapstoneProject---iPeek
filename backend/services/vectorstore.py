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
    Returns a deduplicated list of all indexed documents.
    Used by the browse page to list available research.
    Each item has: title, authors, year, college, keywords, source
    """
    try:
        results  = vectorstore.get()
        seen     = set()
        docs     = []
        for meta in results["metadatas"]:
            key = meta.get("source", "")
            if key and key not in seen:
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
