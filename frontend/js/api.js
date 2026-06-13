/**
 * api.js — Centralized API layer
 * All fetch calls go through here. Never write fetch() directly in page scripts.
 * Change API_BASE once here if the backend URL changes.
 */

const API_BASE = "http://localhost:5000";

/** Upload + ingest a PDF file into ChromaDB */
async function apiIngest(file) {
  const fd = new FormData();
  fd.append("file", file);
  const r = await fetch(`${API_BASE}/api/ingest`, { method: "POST", body: fd });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Ingestion failed.");
  return d;
}

/** Find top 3 similar studies for a proposal */
async function apiSimilarity(proposal) {
  const r = await fetch(`${API_BASE}/api/similarity`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ proposal }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Similarity failed.");
  return d;
}

/** Generate AI summary for a proposal */
async function apiSummary(proposal) {
  const r = await fetch(`${API_BASE}/api/summary`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ proposal }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Summary failed.");
  return d;
}

/** Identify research gaps for a proposal */
async function apiGaps(proposal) {
  const r = await fetch(`${API_BASE}/api/gaps`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ proposal }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Gap analysis failed.");
  return d;
}

/** Send a chat message to the repository assistant */
async function apiChat(question) {
  const r = await fetch(`${API_BASE}/api/chat`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Chat failed.");
  return d;
}

/** Get all indexed documents (for browse page) */
async function apiDocuments() {
  const r = await fetch(`${API_BASE}/api/documents`);
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Failed to load documents.");
  return d;
}

/** Get repository health status */
async function apiStatus() {
  const r = await fetch(`${API_BASE}/api/status`);
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Status check failed.");
  return d;
}

/** Show a toast notification */
function toast(msg, type = "info", duration = 3500) {
  const wrap = document.getElementById("toasts");
  if (!wrap) return;
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), duration);
}
