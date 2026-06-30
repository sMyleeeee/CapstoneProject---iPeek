/**
 * api.js
 * ------
 * Centralized API communication layer.
 * ALL fetch calls to the Flask backend go through here.
 * Never write fetch() directly in page-level JS files.
 * Change API_BASE once here if the backend URL ever changes.
 */

const API_BASE = "http://localhost:5000";

/* ── Ingest ─────────────────────────────────────────────────── */

/**
 * Uploads a PDF file and ingests it into ChromaDB.
 * Calls POST /api/ingest with multipart/form-data.
 * @param {File} file - PDF File object from a file input or drop event
 * @returns {Promise<Object>} { success, message, metadata, chunks }
 */
async function apiIngest(file) {
  const fd = new FormData();
  fd.append("file", file);
  /* Do NOT set Content-Type manually — browser sets it with boundary for multipart */
  const r = await fetch(`${API_BASE}/api/ingest`, { method: "POST", body: fd });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Ingestion failed.");
  return d;
}

/* ── RAG Analysis ────────────────────────────────────────────── */

/**
 * Finds the top 3 most similar studies to the given proposal.
 * Calls POST /api/similarity with { proposal }.
 * @param {string} proposal - Research title or abstract text
 * @returns {Promise<Object>} { result, sources }
 */
async function apiSimilarity(proposal) {
  const r = await fetch(`${API_BASE}/api/similarity`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ proposal }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Similarity failed.");
  return d;
}

/**
 * Generates an AI summary of the proposal vs existing repository work.
 * Calls POST /api/summary with { proposal }.
 * @param {string} proposal - Research title or abstract text
 * @returns {Promise<Object>} { result, sources }
 */
async function apiSummary(proposal) {
  const r = await fetch(`${API_BASE}/api/summary`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ proposal }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Summary failed.");
  return d;
}

/**
 * Identifies research gaps for the given proposal.
 * Calls POST /api/gaps with { proposal }.
 * @param {string} proposal - Research title or abstract text
 * @returns {Promise<Object>} { result, sources }
 */
async function apiGaps(proposal) {
  const r = await fetch(`${API_BASE}/api/gaps`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ proposal }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Gap analysis failed.");
  return d;
}

/**
 * Sends a question to the repository chat assistant with conversation history.
 * Calls POST /api/chat with { question, history }.
 *
 * @param {string} question - Current user question
 * @param {Array}  history  - Array of prior turns: [{ role, content }, ...]
 *                            role is 'user' or 'assistant'
 * @returns {Promise<Object>} { result, sources }
 */
async function apiChat(question, history = []) {
  const r = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, history }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Chat failed.");
  return d;
}

/* ── Repository Data ─────────────────────────────────────────── */

/**
 * Fetches all indexed documents from ChromaDB.
 * Calls GET /api/documents.
 * Used by the browse page to populate the research grid.
 * @returns {Promise<Object>} { documents: [ { title, authors, year, college, keywords, abstract, source } ] }
 */
async function apiDocuments() {
  const r = await fetch(`${API_BASE}/api/documents`);
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Failed to load documents.");
  return d;
}

/**
 * Checks if the Flask backend and ChromaDB are running correctly.
 * Calls GET /api/status.
 * @returns {Promise<Object>} { status, chunks_indexed, message }
 */
async function apiStatus() {
  const r = await fetch(`${API_BASE}/api/status`);
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Status check failed.");
  return d;
}

/**
 * Returns the URL for streaming a watermarked PDF from the backend.
 * The route requires authentication (enforced by Flask when DB is ready).
 * Used by the PDF.js viewer — pass this URL directly to pdfjsLib.getDocument().
 *
 * @param {string} source - Document source stem (filename without .pdf)
 * @returns {string} Full URL to the PDF endpoint
 */
function apiPdfUrl(source) {
  return `${API_BASE}/api/pdf/${encodeURIComponent(source)}`;
}

/**
 * Approves a submission — triggers watermarking and marks it as approved.
 * Calls POST /api/submissions/:id/approve.
 * TODO: Wire to real DB when implemented.
 *
 * @param {string} submissionId - Submission ID to approve
 * @returns {Promise<Object>} { success, message, public_path }
 */
async function apiApprove(submissionId) {
  const r = await fetch(`${API_BASE}/api/submissions/${submissionId}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Approval failed.");
  return d;
}

/* ── Toast notification helper ───────────────────────────────── */

/**
 * Shows a temporary toast notification at the bottom-right of the screen.
 * Automatically removes itself after the given duration.
 *
 * @param {string} msg      - Message text to display
 * @param {string} type     - Toast style: 'success' | 'error' | 'warning' | 'info'
 * @param {number} duration - How long to show it in milliseconds (default 3500)
 */
function toast(msg, type = "info", duration = 3500) {
  const wrap = document.getElementById("toasts");
  if (!wrap) return;
  const el = document.createElement("div");
  el.className   = `toast ${type}`;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), duration);
}

/**
 * Fetches metadata for ONE specific document by its source stem.
 * @param {string} source
 * @returns {Promise<Object>} { title, authors, year, college, keywords, abstract, source }
 */
async function apiDocumentDetail(source) {
  const r = await fetch(`${API_BASE}/api/documents/${encodeURIComponent(source)}`);
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Document not found.");
  return d;
}