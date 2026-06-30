"""
config.py
---------
Single source of truth for all constants and environment variables.
Change a value here — it updates everywhere automatically.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# ── API Keys ──────────────────────────────────────────────────────────────────
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if not GROQ_API_KEY:
    raise ValueError("GROQ_API_KEY is missing from .env")

# ── Directory Paths ───────────────────────────────────────────────────────────
BASE_DIR   = Path(__file__).resolve().parent
PAPERS_DIR = BASE_DIR.parent / "papers"
CHROMA_DIR = str(BASE_DIR.parent / "chroma_db")
PAPERS_DIR.mkdir(exist_ok=True)

# ── Model Names ───────────────────────────────────────────────────────────────
LLM_MODEL       = "llama-3.3-70b-versatile"   # Groq LLM
EMBEDDING_MODEL  = "BAAI/bge-m3"               # Max 8192 tokens — covers 800-token chunks fully
RERANKER_MODEL   = "BAAI/bge-reranker-v2-m3"  # Cross-encoder re-ranker from same bge family

# ── RAG Settings ──────────────────────────────────────────────────────────────
CHUNK_SIZE       = 800   # ~600 words — fits one complete academic paragraph
CHUNK_OVERLAP    = 150   # ~18% of chunk — preserves context at boundaries
RETRIEVAL_TOP_K  = 20    # Chunks fetched by ChromaDB (pre-filter pool for re-ranker)
RERANK_TOP_K     = 5     # Final chunks passed to LLM after re-ranking
SCORE_THRESHOLD  = 0.15   # Minimum cosine similarity — below this is discarded

# ── ChromaDB ──────────────────────────────────────────────────────────────────
CHROMA_COLLECTION = "isatu_repository"

# ── Flask ─────────────────────────────────────────────────────────────────────
SECRET_KEY       = os.getenv("SECRET_KEY", "ipeek-dev-key")
MAX_UPLOAD_SIZE  = 25 * 1024 * 1024   # 25MB
ALLOWED_EXTENSIONS = {"pdf"}
