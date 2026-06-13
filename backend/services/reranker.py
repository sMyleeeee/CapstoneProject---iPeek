"""
reranker.py
-----------
Two-stage retrieval re-ranker using BAAI/bge-reranker-v2-m3.

Stage 1 — ChromaDB: Fast cosine similarity, returns top 20 candidates
Stage 2 — CrossEncoder: Reads (query, chunk) pairs, scores true relevance
Result  — Top 5 chunks by re-ranker score passed to the LLM
"""

import logging
from sentence_transformers import CrossEncoder
from backend.config import RERANKER_MODEL, RERANK_TOP_K

logger = logging.getLogger(__name__)

# Load cross-encoder once at startup
logger.info(f"Loading re-ranker: {RERANKER_MODEL}")
reranker = CrossEncoder(RERANKER_MODEL, max_length=512)
logger.info("Re-ranker ready.")


def rerank(query: str, documents: list) -> list:
    """
    Re-ranks retrieved documents by true relevance to the query.

    Args:
        query     : Student's proposal or search question
        documents : List of Document objects from ChromaDB (up to 20)

    Returns:
        Top RERANK_TOP_K documents sorted by re-ranker score (best first)
    """
    if not documents:
        return []

    # Build (query, chunk_text) pairs — cross-encoder reads both together
    pairs  = [(query, doc.page_content) for doc in documents]
    scores = reranker.predict(pairs)

    # Sort by score descending and return top k
    ranked = sorted(zip(documents, scores), key=lambda x: x[1], reverse=True)
    top    = [doc for doc, _ in ranked[:RERANK_TOP_K]]

    logger.info(f"Re-ranked {len(documents)} → kept top {len(top)}")
    return top
