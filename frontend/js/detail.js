/**
 * detail.js
 * ---------
 * Handles the Research Detail page:
 *  - Reads document ID from URL query param (?id=...)
 *  - Loads paper info (mock for now, replace with API when DB ready)
 *  - Auto-runs all 3 AI analyses in parallel on page load
 *  - Handles tab switching: Similarity | Summary | Gaps
 *  - Handles the chat assistant
 *
 * XSS PROTECTION:
 *  - Never uses innerHTML with user-supplied or API data
 *  - All dynamic text uses textContent or safe DOM createElement
 *  - Only static structural HTML uses innerHTML (no user data inside)
 */

/* Read document ID from URL: detail.html?id=it001 */
const params = new URLSearchParams(window.location.search);
const docId  = params.get("id") || "";

/* Set navbar from session */
const uid  = sessionStorage.getItem("uid")  || "JD";
const role = sessionStorage.getItem("role") || "student";
document.getElementById("avatarEl").textContent = uid.substring(0, 2).toUpperCase();
document.getElementById("rolePill").textContent = role.charAt(0).toUpperCase() + role.slice(1);

/* ── Mock paper data ────────────────────────────────────────── */

/**
 * Returns mock paper data for a given document ID.
 * TODO: Replace with GET /api/documents/{id} when DB is implemented.
 *
 * @param {string} id - Document source ID from ChromaDB
 * @returns {Object} Paper data object
 */
function getMockPaper(id) {
  const papers = {
    it001: {
      id:       "IT 401 · 2024",
      title:    "IoT-Based Attendance System Using Sensors for Rice Farming in Iloilo",
      authors:  "Reyes, M. et al.",
      advisers: "Dr. Maria Santos",
      year:     "2024",
      college:  "CIT",
      status:   "pending",
      source:   "it001",
      keywords: ["IoT", "Agriculture", "Machine Learning", "Cloud Computing"],
      abstract: "This study develops a smart irrigation system using IoT sensors to monitor soil moisture, temperature, and humidity in rice paddies across selected farms in Iloilo. The system integrates cloud-based analytics and a mobile dashboard to provide real-time irrigation recommendations. Field trials across 12 farms demonstrated a 34% reduction in water consumption while maintaining comparable crop yields.",
    },
  };

  /* Fallback for unknown IDs */
  return papers[id] || {
    id: "CS 001", title: "Research Study",
    authors: "Unknown", advisers: "Unknown",
    year: "2024", college: "CCI", status: "pending",
    source: id,
    keywords: ["Research"],
    abstract: "Abstract not available for this document.",
  };
}

/* ── Render paper info ──────────────────────────────────────── */

/**
 * Renders the paper's title, authors, adviser, chips, and abstract
 * using safe textContent — never innerHTML with data.
 *
 * @param {Object} p - Paper data object
 */
function renderPaperInfo(p) {
  document.title = `iPeek — ${p.title}`;

  /* XSS-safe: textContent never interprets HTML tags */
  document.getElementById("paperTitle").textContent = p.title;
  document.getElementById("paperMeta").textContent  = `${p.authors} · Adviser: ${p.advisers}`;
  document.getElementById("abstractText").textContent = p.abstract;

  /* Build meta chips safely using createElement */
  const chipsEl = document.getElementById("metaChips");
  chipsEl.innerHTML = ""; /* Clear loading state only — no user data here */

  [p.college, p.year, p.id].forEach(val => {
    const chip = document.createElement("span");
    chip.className   = "meta-chip";
    chip.textContent = val; /* textContent is XSS-safe */
    chipsEl.appendChild(chip);
  });

  /* Status badge */
  const badge = document.createElement("span");
  badge.className   = `badge badge-${p.status}`;
  badge.textContent = p.status;
  chipsEl.appendChild(badge);
}

/* ── Formatted text renderer ────────────────────────────────── */

/**
 * Renders LLM output text into a container element safely.
 * Splits on newlines and creates <p> elements — preserves the LLM's
 * paragraph structure (e.g. gap entries, page citations, bullet lines)
 * without using innerHTML with untrusted content.
 *
 * @param {HTMLElement} container - The element to render into
 * @param {string}      text      - Raw LLM output string
 */
function renderFormattedText(container, text) {
  container.innerHTML = ""; /* Clear spinner or prior content */
  text.split("\n").forEach(line => {
    if (!line.trim()) return; /* Skip blank lines */
    const p = document.createElement("p");
    p.textContent = line; /* Safe — never innerHTML with LLM output */
    p.style.marginBottom = "6px";
    p.style.fontSize     = "0.86rem";
    p.style.lineHeight   = "1.7";
    container.appendChild(p);
  });
}

/* ── AI Analysis ────────────────────────────────────────────── */

/**
 * Runs all 3 AI analyses in parallel using Promise.all.
 * Parallel execution is faster than sequential — all 3 start at the same time.
 *
 * @param {string} proposal - Title + abstract of the paper used as the RAG query
 */
async function runAllAnalyses(proposal) {
  await Promise.all([
    runSimilarity(proposal),
    runSummary(proposal),
    runGaps(proposal),
  ]);

  /* Update status badge once all analyses complete */
  const statusBadge = document.getElementById("analysisStatus");
  statusBadge.textContent = "Complete";
  statusBadge.className   = "badge badge-validated";
}

/**
 * Fetches similarity analysis and renders progress bars.
 * @param {string} proposal - RAG query text
 */
async function runSimilarity(proposal) {
  try {
    const data = await apiSimilarity(proposal);
    renderSimilarityBars(data.result);
    renderSimilarProjects(data.sources);
  } catch (e) {
    /* Show error safely without innerHTML */
    const el = document.getElementById("simBars");
    el.textContent = `⚠️ ${e.message}`;
  }
}

/**
 * Parses the LLM similarity result text and builds
 * animated progress bars for each matched study.
 * Uses createElement throughout — never innerHTML with LLM output.
 *
 * @param {string} resultText - Raw text from the similarity LLM chain
 */
function renderSimilarityBars(resultText) {
  const container = document.getElementById("simBars");
  container.innerHTML = ""; /* Clear spinner — no user data */

  /* Map similarity levels to bar percentages */
  const pctMap = { HIGH: 90, MODERATE: 60, LOW: 30 };

  /* Parse entries from LLM result text */
  const entries = [];
  let   current = null;

  resultText.split("\n").forEach(line => {
    /* Each numbered line starts a new entry */
    if (/^\d+\./.test(line)) {
      if (current) entries.push(current);
      current = {
        /* Strip the number prefix, take first part before | as title */
        title: line.replace(/^\d+\.\s*/, "").split("|")[0].trim(),
        level: "LOW",
      };
    }
    /* Extract similarity level from the line */
    if (current) {
      const match = line.match(/Similarity:\s*(HIGH|MODERATE|LOW)/i);
      if (match) current.level = match[1].toUpperCase();
    }
  });

  if (current) entries.push(current);

  /* Fall back to raw text if parsing yields nothing */
  if (entries.length === 0) {
    const pre = document.createElement("pre");
    pre.className   = "ai-box";
    pre.textContent = resultText; /* Safe — textContent */
    container.appendChild(pre);
    return;
  }

  /* Build a bar row for each parsed entry using createElement */
  entries.forEach(e => {
    const row = document.createElement("div");
    row.className = "sim-row";

    /* Label row: truncated title + badge */
    const labelRow = document.createElement("div");
    labelRow.className = "sim-label";

    const titleSpan = document.createElement("span");
    /* Truncate long titles safely */
    titleSpan.textContent = e.title.length > 50
      ? e.title.substring(0, 50) + "..."
      : e.title;

    const badge = document.createElement("span");
    badge.className   = `badge badge-${e.level.toLowerCase()}`;
    badge.textContent = e.level; /* Safe */

    labelRow.appendChild(titleSpan);
    labelRow.appendChild(badge);

    /* Progress bar */
    const track = document.createElement("div");
    track.className = "sim-track";

    const fill = document.createElement("div");
    fill.className = "sim-fill";
    fill.style.width = `${pctMap[e.level] || 40}%`;

    track.appendChild(fill);
    row.appendChild(labelRow);
    row.appendChild(track);
    container.appendChild(row);
  });
}

/**
 * Fetches summary analysis and renders result with line-break formatting.
 * @param {string} proposal - RAG query text
 */
async function runSummary(proposal) {
  const box = document.getElementById("summaryBox");
  try {
    const data = await apiSummary(proposal);
    renderFormattedText(box, data.result);
  } catch (e) {
    box.textContent = `⚠️ ${e.message}`;
  }
}

/**
 * Fetches gap analysis and renders result with line-break formatting.
 * @param {string} proposal - RAG query text
 */
async function runGaps(proposal) {
  const box = document.getElementById("gapsBox");
  try {
    const data = await apiGaps(proposal);
    renderFormattedText(box, data.result);
  } catch (e) {
    box.textContent = `⚠️ ${e.message}`;
  }
}

/* ── Similar projects right panel ───────────────────────────── */

/**
 * Renders the similar project cards in the right panel.
 * Uses createElement — no innerHTML with API data.
 *
 * @param {Array} sources - Array of { title, authors, year, college } objects
 */
function renderSimilarProjects(sources) {
  const container = document.getElementById("similarProjects");
  container.innerHTML = ""; /* Clear loading state */

  if (!sources || sources.length === 0) {
    const msg = document.createElement("div");
    msg.className   = "text-muted";
    msg.style.fontSize = "0.8rem";
    msg.textContent = "No similar projects found.";
    container.appendChild(msg);
    return;
  }

  sources.forEach(s => {
    const card = document.createElement("div");
    card.className = "similar-card";

    const title = document.createElement("div");
    title.className   = "similar-card-title";
    title.textContent = s.title; /* Safe */

    const meta = document.createElement("div");
    meta.className   = "similar-card-meta";
    meta.textContent = `${s.authors} · ${s.year} · ${s.college}`; /* Safe */

    const badge = document.createElement("span");
    badge.className   = "badge badge-moderate";
    badge.textContent = "Moderate Match";

    card.appendChild(title);
    card.appendChild(meta);
    card.appendChild(badge);
    container.appendChild(card);
  });
}

/* ── Tab switching ──────────────────────────────────────────── */

/**
 * Shows the selected analysis tab panel and hides the others.
 * @param {string} tab - Tab key: 'similarity' | 'summary' | 'gaps'
 * @param {HTMLElement} el - The clicked tab button
 */
function switchTab(tab, el) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  el.classList.add("active");

  document.getElementById("tabSimilarity").style.display = tab === "similarity" ? "block" : "none";
  document.getElementById("tabSummary").style.display    = tab === "summary"    ? "block" : "none";
  document.getElementById("tabGaps").style.display       = tab === "gaps"       ? "block" : "none";
}

/* ── PDF Viewer ─────────────────────────────────────────────── */

/**
 * PDF.js viewer state.
 * pdfDoc      — the loaded PDFDocumentProxy
 * currentPage — 1-indexed current page number
 * rendering   — true while a page render is in progress (prevents double-render)
 */
let pdfDoc      = null;
let currentPage = 1;
let rendering   = false;

/**
 * Initialises the PDF.js viewer for the given document source.
 * Reveals the viewer card and loads the first page.
 * Falls back silently if the backend is offline or the PDF is not yet approved.
 *
 * @param {string} source - Document source stem used to build the PDF URL
 */
async function initPdfViewer(source) {
  if (!source) return;

  // Set PDF.js worker — must point to the same version as the CDN script
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  const url = apiPdfUrl(source);

  try {
    pdfDoc = await pdfjsLib.getDocument(url).promise;
    document.getElementById("pdfViewerCard").style.display = "block";
    currentPage = 1;
    renderPdfPage(currentPage);
  } catch {
    // PDF not yet approved / watermarked — viewer stays hidden, no error shown
    // (expected for pending submissions)
  }
}

/**
 * Renders a single PDF page onto the canvas element.
 * Updates the page counter display.
 *
 * @param {number} num - 1-indexed page number to render
 */
async function renderPdfPage(num) {
  if (!pdfDoc || rendering) return;
  rendering = true;

  const page     = await pdfDoc.getPage(num);
  const viewport = page.getViewport({ scale: 1.4 });
  const canvas   = document.getElementById("pdfCanvas");
  const ctx      = canvas.getContext("2d");

  canvas.height = viewport.height;
  canvas.width  = viewport.width;

  await page.render({ canvasContext: ctx, viewport }).promise;
  rendering = false;

  // Update page counter
  document.getElementById("pdfPageInfo").textContent =
    `Page ${num} / ${pdfDoc.numPages}`;

  // Enable/disable nav buttons
  document.getElementById("pdfPrevBtn").disabled = num <= 1;
  document.getElementById("pdfNextBtn").disabled = num >= pdfDoc.numPages;
}

/** Navigate to previous PDF page */
function pdfPrevPage() {
  if (currentPage > 1) {
    currentPage--;
    renderPdfPage(currentPage);
  }
}

/** Navigate to next PDF page */
function pdfNextPage() {
  if (pdfDoc && currentPage < pdfDoc.numPages) {
    currentPage++;
    renderPdfPage(currentPage);
  }
}

/* ── Chat assistant ─────────────────────────────────────────── */

/**
 * Conversation history for multi-turn memory.
 * Each entry: { role: 'user' | 'assistant', content: string }
 * Sent to the backend on every new message so the LLM has full context.
 */
const chatHistory = [];

/**
 * Sends the user's chat message to POST /api/chat with full history.
 * Appends the response as a bot bubble and stores both turns in chatHistory.
 * All text rendered with textContent — XSS safe.
 */
async function sendChat() {
  const input = document.getElementById("chatInput");
  const q     = input.value.trim();
  if (!q) return;

  // Append user message to UI and history
  appendChatMsg("user", q);
  chatHistory.push({ role: "user", content: q });
  input.value = "";

  // Show typing indicator
  const typingId = `typing-${Date.now()}`;
  appendChatMsg("bot", "...", typingId);

  try {
    // Pass full history so the LLM can reference prior turns
    const data   = await apiChat(q, chatHistory);
    const answer = data.result;

    // Replace typing indicator with actual response
    const bubble = document.getElementById(typingId);
    if (bubble) renderFormattedText(bubble, answer);

    // Store assistant reply in history for next turn
    chatHistory.push({ role: "assistant", content: answer });

  } catch (e) {
    const bubble = document.getElementById(typingId);
    if (bubble) bubble.textContent = `⚠️ ${e.message}`;
  }
}

/**
 * Appends a chat message bubble to the chat log.
 * Uses createElement exclusively — never innerHTML.
 *
 * @param {string} role - 'user' | 'bot'
 * @param {string} text - Message content
 * @param {string} id   - Optional ID for the bubble (used for typing replacement)
 */
function appendChatMsg(role, text, id) {
  const log = document.getElementById("chatLog");

  const row    = document.createElement("div");
  row.className = `chat-msg ${role}`;

  const bubble = document.createElement("div");
  bubble.className = "chat-bubble";
  if (id) bubble.id = id;

  // For typing indicator just set text; real responses use renderFormattedText
  bubble.textContent = text;

  row.appendChild(bubble);
  log.appendChild(row);
  log.scrollTop = log.scrollHeight;
}

/**
 * Allows pressing Enter to send a chat message.
 * Shift+Enter inserts a newline instead.
 * @param {KeyboardEvent} e
 */
function chatKey(e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendChat();
  }
}

/* ── Initialize page ────────────────────────────────────────── */

const paper   = getMockPaper(docId);
renderPaperInfo(paper);

/* Build the RAG query from title + abstract */
const proposal = `${paper.title} ${paper.abstract}`;
runAllAnalyses(proposal);

/* Init PDF viewer — shows if an approved/watermarked PDF exists for this source */
initPdfViewer(paper.source || docId);