"""
routes/api.py
-------------
All Flask API routes in one file.
Endpoints:
  POST /api/ingest      — upload + ingest PDF
  POST /api/similarity  — find similar studies
  POST /api/summary     — generate AI summary
  POST /api/gaps        — identify research gaps
  POST /api/chat        — conversational Q&A
  GET  /api/documents   — list all indexed documents
  GET  /api/status      — health check
"""

import logging
from flask import Blueprint, request, jsonify
from services.ingestor import ingest_pdf
from services.rag import get_similar_studies, get_summary, get_research_gaps, chat
from services.vectorstore import get_chunk_count, get_all_documents
from config import MAX_UPLOAD_SIZE

logger = logging.getLogger(__name__)
api_bp = Blueprint("api", __name__)


# ── Helper: validate JSON body has a non-empty proposal/question ──────────────
def _get_text(data: dict, key: str, min_len: int = 10) -> tuple:
    """
    Extracts and validates a text field from JSON request body.
    Returns (text, None) on success or (None, error_response) on failure.
    """
    if not data:
        return None, (jsonify({"error": "Request body must be JSON."}), 400)
    text = data.get(key, "").strip()
    if not text:
        return None, (jsonify({"error": f"'{key}' is required."}), 400)
    if len(text) < min_len:
        return None, (jsonify({"error": f"'{key}' is too short."}), 400)
    return text, None


# ── POST /api/ingest ──────────────────────────────────────────────────────────
@api_bp.route("/api/ingest", methods=["POST"])
def route_ingest():
    """
    Accepts a PDF file upload, ingests it into ChromaDB.
    Request: multipart/form-data, field name = 'file'
    Response: { success, message, metadata, chunks }
    """
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded."}), 400

    file = request.files["file"]
    if not file.filename:
        return jsonify({"error": "No file selected."}), 400

    # Check file size before processing
    file.seek(0, 2)
    size = file.tell()
    file.seek(0)
    if size > MAX_UPLOAD_SIZE:
        return jsonify({"error": f"File exceeds 25MB limit."}), 400

    try:
        result = ingest_pdf(file)
        return jsonify(result), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        logger.error(f"Ingest error: {e}", exc_info=True)
        return jsonify({"error": "Ingestion failed. Please try again."}), 500


# ── POST /api/similarity ──────────────────────────────────────────────────────
@api_bp.route("/api/similarity", methods=["POST"])
def route_similarity():
    """
    Finds the top 3 most similar studies to the submitted proposal.
    Request body: { "proposal": "..." }
    Response: { result, sources }
    """
    text, err = _get_text(request.get_json(), "proposal")
    if err:
        return err
    try:
        return jsonify(get_similar_studies(text)), 200
    except Exception as e:
        logger.error(f"Similarity error: {e}", exc_info=True)
        return jsonify({"error": "Analysis failed. Please try again."}), 500


# ── POST /api/summary ─────────────────────────────────────────────────────────
@api_bp.route("/api/summary", methods=["POST"])
def route_summary():
    """
    Generates an AI summary of the proposal vs existing work.
    Request body: { "proposal": "..." }
    Response: { result, sources }
    """
    text, err = _get_text(request.get_json(), "proposal")
    if err:
        return err
    try:
        return jsonify(get_summary(text)), 200
    except Exception as e:
        logger.error(f"Summary error: {e}", exc_info=True)
        return jsonify({"error": "Summary failed. Please try again."}), 500


# ── POST /api/gaps ────────────────────────────────────────────────────────────
@api_bp.route("/api/gaps", methods=["POST"])
def route_gaps():
    """
    Identifies 3-5 research gaps for the proposal.
    Request body: { "proposal": "..." }
    Response: { result, sources }
    """
    text, err = _get_text(request.get_json(), "proposal")
    if err:
        return err
    try:
        return jsonify(get_research_gaps(text)), 200
    except Exception as e:
        logger.error(f"Gaps error: {e}", exc_info=True)
        return jsonify({"error": "Gap analysis failed. Please try again."}), 500


# ── POST /api/chat ────────────────────────────────────────────────────────────
@api_bp.route("/api/chat", methods=["POST"])
def route_chat():
    """
    Answers a research question from the repository.
    Request body: { "question": "..." }
    Response: { result, sources }
    """
    text, err = _get_text(request.get_json(), "question", min_len=5)
    if err:
        return err
    try:
        return jsonify(chat(text)), 200
    except Exception as e:
        logger.error(f"Chat error: {e}", exc_info=True)
        return jsonify({"error": "Chat failed. Please try again."}), 500


# ── GET /api/documents ────────────────────────────────────────────────────────
@api_bp.route("/api/documents", methods=["GET"])
def route_documents():
    """
    Returns a list of all unique documents indexed in ChromaDB.
    Used by the browse page to populate the research grid.
    Response: { documents: [ { title, authors, year, college, keywords, abstract } ] }
    """
    try:
        docs = get_all_documents()
        return jsonify({"documents": docs}), 200
    except Exception as e:
        logger.error(f"Documents list error: {e}")
        return jsonify({"error": "Failed to fetch documents."}), 500


# ── GET /api/status ───────────────────────────────────────────────────────────
@api_bp.route("/api/status", methods=["GET"])
def route_status():
    """
    Health check endpoint. Returns repository chunk count.
    Response: { status, chunks_indexed, message }
    """
    try:
        count = get_chunk_count()
        return jsonify({
            "status":         "ok",
            "chunks_indexed": count,
            "message":        "Repository ready." if count > 0 else "Repository is empty.",
        }), 200
    except Exception as e:
        return jsonify({"status": "error", "error": str(e)}), 500
