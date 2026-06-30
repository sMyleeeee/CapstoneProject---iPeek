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
from flask import Blueprint, request, jsonify, send_from_directory
from services.ingestor import ingest_pdf, watermark_pdf, PUBLIC_DIR
from services.rag import get_similar_studies, get_summary, get_research_gaps, chat
from services.vectorstore import get_chunk_count, get_all_documents, get_document_by_source
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

# ── POST /api/submissions ─────────────────────────────────────────────────────
@api_bp.route("/api/submissions", methods=["POST"])
def route_create_submission():
    """
    Creates a submission record in the database after a successful ingest.
    Request body: { "source", "title", "department", "members", "year", "abstract" }
    Response 200: { success, submission_id }
    """
    data = request.get_json()
    if not data or not data.get("source") or not data.get("title"):
        return jsonify({"error": "'source' and 'title' are required."}), 400

    try:
        from database.submissions_repo import create_submission
        submission_id = create_submission(
            source=data["source"],
            title=data["title"],
            department=data.get("department", ""),
            members=data.get("members", ""),
            year=data.get("year", ""),
            abstract=data.get("abstract", ""),
        )
        return jsonify({"success": True, "submission_id": submission_id}), 200
    except Exception as e:
        logger.error(f"Create submission error: {e}", exc_info=True)
        return jsonify({"error": "Failed to save submission record."}), 500
    
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
    data = request.get_json()
    text, err = _get_text(data, "question", min_len=5)
    if err:
        return err

    # Extract history — frontend sends it as a list of {role, content} dicts
    history = data.get("history", []) if data else []

    try:
        return jsonify(chat(text, history=history)), 200
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
    
@api_bp.route("/api/documents/<source>", methods=["GET"])
def route_document_detail(source):
    """
    Returns metadata for ONE specific document by its source stem.
    Response 200: { title, authors, year, college, keywords, abstract, source }
    Response 404: { error: "Document not found." }
    """
    try:
        doc = get_document_by_source(source)
        if doc is None:
            return jsonify({"error": "Document not found."}), 404
        return jsonify(doc), 200
    except Exception as e:
        logger.error(f"Document detail error for '{source}': {e}", exc_info=True)
        return jsonify({"error": "Failed to fetch document."}), 500
    
    # ── POST /api/submissions/<source>/approve ────────────────────────────────────
@api_bp.route("/api/submissions/<source>/approve", methods=["POST"])
def route_approve(source):
    """
    Approves a pending submission: triggers watermarking AND updates
    the database (submissions.status -> 'approved', chroma_link row
    created/updated).
    Response 200: { success, message, public_path }
    Response 404: { error: "Pending PDF not found." }
    Response 500: { error: "Watermarking failed." } or { error: "Database update failed." }
    """
    try:
        public_path = watermark_pdf(source)
    except FileNotFoundError as e:
        return jsonify({"error": str(e)}), 404
    except RuntimeError as e:
        logger.error(f"Approve/watermark error for '{source}': {e}", exc_info=True)
        return jsonify({"error": "Watermarking failed."}), 500

    try:
        from database.submissions_repo import get_submission_by_source, approve_submission
        from services.vectorstore import get_vectorstore

        # Pull chunk/page counts for chroma_link, same source filter
        # pattern as get_document_by_source() already uses.
        vs = get_vectorstore()
        results = vs.get(where={"source": source})
        chunk_count = len(results["metadatas"]) if results["metadatas"] else 0
        page_count = len({m.get("page") for m in results["metadatas"]}) if results["metadatas"] else 0

        updated = approve_submission(source, public_path, chunk_count, page_count)
        if not updated:
            logger.error(f"No submission row found for source '{source}' during approval.")
            return jsonify({"error": "No submission record found for this paper."}), 404

    except Exception as e:
        logger.error(f"Database update failed during approval of '{source}': {e}", exc_info=True)
        return jsonify({"error": "Database update failed."}), 500

    return jsonify({
        "success": True,
        "message": f"'{source}' approved and watermarked.",
        "public_path": public_path,
    }), 200
 # ── POST /api/submissions/<source>/review ────────────────────────────────────  
@api_bp.route("/api/submissions/<source>/review", methods=["POST"])
def route_review(source):
        """
        Records a librarian's validate/return decision.
        Request body: { "action": "validated" | "returned", "comments": "..." }
        Response 200: { success: true }
        Response 400: { error: "..." }
        Response 404: { error: "Submission not found." }
            """
        data = request.get_json()
        if not data or "action" not in data:
            return jsonify({"error": "'action' is required."}), 400

        action = data["action"]
        if action not in ("validated", "returned"):
            return jsonify({"error": "'action' must be 'validated' or 'returned'."}), 400

        comments = data.get("comments", "")

        try:
            from database.submissions_repo import record_review
            success = record_review(source, action, comments)
            if not success:
                return jsonify({"error": "Submission not found."}), 404
            return jsonify({"success": True}), 200
        except Exception as e:
            logger.error(f"Review recording failed for '{source}': {e}", exc_info=True)
            return jsonify({"error": "Failed to record review."}), 500
            
    # ── GET /api/pdf/<source> ─────────────────────────────────────────────────────
@api_bp.route("/api/pdf/<source>", methods=["GET"])
def route_pdf(source):
    """
    Serves the WATERMARKED copy of a paper's PDF for in-browser viewing.
    Only ever serves from PUBLIC_DIR — never PENDING_DIR.
    Response 200: raw PDF bytes (watermarked copy)
    Response 404: { error: "Document not available for viewing." }
    """
    filename = f"{source}.pdf"
    try:
        return send_from_directory(
            PUBLIC_DIR,
            filename,
            mimetype="application/pdf",
            as_attachment=False,
        )
    except FileNotFoundError:
        return jsonify({"error": "Document not available for viewing."}), 404