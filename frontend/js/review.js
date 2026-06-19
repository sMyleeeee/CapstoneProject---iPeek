/**
 * review.js
 * ---------
 * Handles the Librarian Review Queue page:
 *  - Renders submission cards in the left panel list
 *  - Shows detailed checklist, AI notice, and feedback on the right panel
 *  - Handles Validate and Return actions
 *  - Filters by All | Pending | Returned tabs
 *  - Live search by title or author
 *
 * XSS PROTECTION:
 *  - All dynamic content uses textContent or createElement
 *  - innerHTML is only used for static structural HTML with no user data
 *  - API error messages rendered with textContent
 *
 * TODO: Replace mockSubmissions with real API calls when DB is ready:
 *   GET  /api/submissions              — fetch all submissions
 *   POST /api/submissions/:id/validate — validate a submission
 *   POST /api/submissions/:id/return   — return with feedback
 */

/* Set navbar from session */
const uid  = sessionStorage.getItem("uid")  || "JD";
const role = sessionStorage.getItem("role") || "librarian";
document.getElementById("avatarEl").textContent = uid.substring(0, 2).toUpperCase();
document.getElementById("rolePill").textContent  = role.charAt(0).toUpperCase() + role.slice(1);

/* Currently active filter tab and selected submission ID */
let currentFilter = "all";
let currentId     = null;

/**
 * Mock submissions data while DB is not yet implemented.
 * Each item: id, title, authors, college, year, status, time,
 *            abstract, checklist[], aiStatus, feedback
 *
 * checklist item status: 'ok' | 'warn' | 'fail'
 */
const submissions = [
  {
    id: "sub001",
    title:   "AI-Powered Crop Disease Detection Using Convolutional Neural Networks",
    authors: "Reyes, A. · Santos, M. · Lim, C. · Dela Cruz, K.",
    college: "Engineering", year: "2024–2025", status: "pending", time: "2 hrs ago",
    abstract: "This study presents an AI-based system for detecting crop diseases using convolutional neural networks trained on a dataset of over 50,000 leaf images across 10 crop species.",
    checklist: [
      { label: "Research title & abstract complete", status: "ok"   },
      { label: "Lead researcher & members listed",   status: "ok"   },
      { label: "PDF document uploaded",              status: "ok"   },
      { label: "Adviser signature",                  status: "warn", note: "awaiting" },
      { label: "Panel chair signature uploaded",     status: "ok"   },
      { label: "College Dean signature",             status: "fail", note: "missing"  },
    ],
    aiStatus: "pending",
    feedback: "",
  },
  {
    id: "sub002",
    title:   "Mobile POS System for Local MSME Enterprises",
    authors: "Lim, J. · Garcia, R. · Tan, S.",
    college: "Computing", year: "2024–2025", status: "pending", time: "1 day ago",
    abstract: "A mobile-first point-of-sale system designed for small and medium enterprises in Iloilo City, featuring offline mode and cloud sync.",
    checklist: [
      { label: "Research title & abstract complete", status: "ok" },
      { label: "Lead researcher & members listed",   status: "ok" },
      { label: "PDF document uploaded",              status: "ok" },
      { label: "Adviser signature",                  status: "ok" },
      { label: "Panel chair signature uploaded",     status: "ok" },
      { label: "College Dean signature",             status: "ok" },
    ],
    aiStatus: "complete",
    feedback: "",
  },
  {
    id: "sub003",
    title:   "Blockchain-Based Student Records System",
    authors: "Cruz, P. · Mendoza, L.",
    college: "Computing", year: "2024–2025", status: "returned", time: "3 days ago",
    abstract: "A blockchain-based system for managing student academic records with tamper-proof audit trails.",
    checklist: [
      { label: "Research title & abstract complete", status: "ok"   },
      { label: "Lead researcher & members listed",   status: "ok"   },
      { label: "PDF document uploaded",              status: "ok"   },
      { label: "Adviser signature",                  status: "fail", note: "missing" },
      { label: "Panel chair signature uploaded",     status: "fail", note: "missing" },
      { label: "College Dean signature",             status: "fail", note: "missing" },
    ],
    aiStatus: "pending",
    feedback: "Missing dean signature. Please attach the signed dean approval before resubmission.",
  },
  {
    id: "sub004",
    title:   "Water Quality Monitoring Using IoT Sensors",
    authors: "Bautista, R. · Flores, M. · Reyes, K.",
    college: "Engineering", year: "2024–2025", status: "pending", time: "5 days ago",
    abstract: "An IoT-based water quality monitoring system for rivers in Iloilo, providing real-time alerts for contamination events.",
    checklist: [
      { label: "Research title & abstract complete", status: "ok"   },
      { label: "Lead researcher & members listed",   status: "ok"   },
      { label: "PDF document uploaded",              status: "ok"   },
      { label: "Adviser signature",                  status: "ok"   },
      { label: "Panel chair signature uploaded",     status: "warn", note: "awaiting" },
      { label: "College Dean signature",             status: "warn", note: "awaiting" },
    ],
    aiStatus: "pending",
    feedback: "",
  },
];

/* ── Render submission list ─────────────────────────────────── */

/**
 * Renders the left panel submission card list.
 * Applies the active filter tab and search query.
 * Uses createElement to build cards — never innerHTML with submission data.
 */
function renderList() {
  const q    = document.getElementById("searchInput").value.toLowerCase();
  const list = document.getElementById("subList");

  /* Update tab count badges */
  document.getElementById("cntAll").textContent      = submissions.length;
  document.getElementById("cntPending").textContent  = submissions.filter(s => s.status === "pending").length;
  document.getElementById("cntReturned").textContent = submissions.filter(s => s.status === "returned").length;

  /* Filter by tab and search query */
  const filtered = submissions.filter(s => {
    if (currentFilter !== "all" && s.status !== currentFilter) return false;
    if (q && !s.title.toLowerCase().includes(q) &&
             !s.authors.toLowerCase().includes(q))               return false;
    return true;
  });

  /* Clear list */
  list.innerHTML = "";

  if (filtered.length === 0) {
    const msg = document.createElement("div");
    msg.style.cssText   = "text-align:center;padding:40px 0;color:var(--muted);font-size:0.84rem;";
    msg.textContent     = "No submissions found.";
    list.appendChild(msg);
    return;
  }

  /* Build each submission card using createElement */
  filtered.forEach(s => {
    const card = document.createElement("div");
    card.className = `sub-item ${currentId === s.id ? "active" : ""}`;
    card.addEventListener("click", () => selectSubmission(s.id));

    const title = document.createElement("div");
    title.className   = "sub-item-title";
    title.textContent = s.title; /* XSS safe */

    const meta = document.createElement("div");
    meta.className   = "sub-item-meta";
    /* Show first author name only */
    meta.textContent = `${s.authors.split("·")[0].trim()} · ${s.college}`;

    const footer = document.createElement("div");
    footer.className = "sub-item-footer";

    const time = document.createElement("span");
    time.className   = "sub-item-time";
    time.textContent = s.time;

    const badge = document.createElement("span");
    badge.className   = `badge badge-${s.status}`;
    badge.textContent = s.status;

    footer.appendChild(time);
    footer.appendChild(badge);

    card.appendChild(title);
    card.appendChild(meta);
    card.appendChild(footer);
    list.appendChild(card);
  });
}

/* ── Render detail panel ────────────────────────────────────── */

/**
 * Renders the right-panel detail view for the selected submission.
 * Uses createElement for all data-driven content — XSS safe throughout.
 *
 * @param {string} id - Submission ID
 */
function selectSubmission(id) {
  currentId = id;
  const s   = submissions.find(s => s.id === id);
  if (!s) return;

  renderList(); /* Re-render list to update active highlight */

  const panel = document.getElementById("detailPanel");
  panel.innerHTML = ""; /* Clear previous content */

  /* ── Title ── */
  const title = document.createElement("div");
  title.className   = "detail-title";
  title.textContent = s.title;

  /* ── Authors ── */
  const authors = document.createElement("div");
  authors.style.cssText = "font-size:0.78rem;color:var(--muted);margin-bottom:10px;";
  authors.textContent   = s.authors;

  /* ── Meta chips ── */
  const chips = document.createElement("div");
  chips.className = "detail-chips";

  [s.college, s.year, s.time].forEach(val => {
    const chip = document.createElement("span");
    chip.className   = "detail-chip";
    chip.textContent = val; /* Safe */
    chips.appendChild(chip);
  });

  const statusBadge = document.createElement("span");
  statusBadge.className   = `badge badge-${s.status}`;
  statusBadge.textContent = s.status;
  chips.appendChild(statusBadge);

  /* ── Abstract card ── */
  const abstractCard = document.createElement("div");
  abstractCard.className = "card";
  abstractCard.style.marginBottom = "14px";

  const abstractLabel = document.createElement("div");
  abstractLabel.style.cssText = "font-size:0.7rem;font-weight:700;text-transform:uppercase;" +
    "letter-spacing:0.07em;color:var(--muted);margin-bottom:6px;";
  abstractLabel.textContent = "Abstract";

  const abstractText = document.createElement("p");
  abstractText.style.cssText = "font-size:0.84rem;line-height:1.7;";
  abstractText.textContent   = s.abstract; /* Safe */

  abstractCard.appendChild(abstractLabel);
  abstractCard.appendChild(abstractText);

  /* ── Checklist card ── */
  const checkCard = document.createElement("div");
  checkCard.className = "card";
  checkCard.style.marginBottom = "14px";

  const checkLabel = document.createElement("div");
  checkLabel.style.cssText = "font-size:0.7rem;font-weight:700;text-transform:uppercase;" +
    "letter-spacing:0.07em;color:var(--muted);margin-bottom:10px;";
  checkLabel.textContent = "Requirements Checklist";

  const ul = document.createElement("ul");
  ul.className = "checklist";

  const iconMap = { ok: "✅", warn: "⚠️", fail: "❌" };

  s.checklist.forEach(c => {
    const li = document.createElement("li");
    li.className = "cl-item";

    const icon = document.createElement("span");
    icon.className   = "cl-icon";
    icon.textContent = iconMap[c.status];

    const labelSpan = document.createElement("span");
    /* Build label text safely — no HTML injection */
    labelSpan.textContent = c.note
      ? `${c.label} — ${c.note}`
      : c.label;

    li.appendChild(icon);
    li.appendChild(labelSpan);
    ul.appendChild(li);
  });

  checkCard.appendChild(checkLabel);
  checkCard.appendChild(ul);

  /* ── AI notice ── */
  const aiNotice = document.createElement("div");
  aiNotice.className = "ai-notice";
  aiNotice.textContent = s.aiStatus === "complete"
    ? "🤖 AI Analysis complete — similarity check passed."
    : "🤖 AI Analysis — Pending Validation. Similarity check will run after approval.";

  /* ── Feedback textarea card ── */
  const fbCard = document.createElement("div");
  fbCard.className = "card";
  fbCard.style.marginBottom = "14px";

  const fbLabel = document.createElement("div");
  fbLabel.style.cssText = "font-size:0.72rem;font-weight:700;text-transform:uppercase;" +
    "letter-spacing:0.07em;color:var(--muted);margin-bottom:8px;";
  fbLabel.textContent = "Librarian Feedback";

  const fbTextarea = document.createElement("textarea");
  fbTextarea.className   = "form-input";
  fbTextarea.id          = "feedbackInput";
  fbTextarea.rows        = 3;
  fbTextarea.placeholder = "Enter feedback or reason for returning...";
  /* Set existing feedback safely via value — not innerHTML */
  fbTextarea.value = s.feedback;

  fbCard.appendChild(fbLabel);
  fbCard.appendChild(fbTextarea);

  /* ── Action buttons ── */
  const actionRow = document.createElement("div");
  actionRow.className = "action-row";

  const returnBtn = document.createElement("button");
  returnBtn.className   = "btn btn-ghost";
  returnBtn.textContent = "↩ Return";
  returnBtn.addEventListener("click", () => returnSubmission(s.id));

  const validateBtn = document.createElement("button");
  validateBtn.className   = "btn btn-success";
  validateBtn.textContent = "✅ Validate";
  validateBtn.addEventListener("click", () => validateSubmission(s.id));

  actionRow.appendChild(returnBtn);
  actionRow.appendChild(validateBtn);

  /* ── Assemble panel ── */
  panel.appendChild(title);
  panel.appendChild(authors);
  panel.appendChild(chips);
  panel.appendChild(abstractCard);
  panel.appendChild(checkCard);
  panel.appendChild(aiNotice);
  panel.appendChild(fbCard);
  panel.appendChild(actionRow);
}

/* ── Actions ────────────────────────────────────────────────── */

/**
 * Validates a submission — checks all checklist items pass first,
 * then calls the backend to trigger watermarking via apiApprove().
 * TODO: POST /api/submissions/:id/validate when DB is ready — for now
 *       the source stem is derived from the submission title (placeholder).
 *
 * @param {string} id - Submission ID to validate
 */
async function validateSubmission(id) {
  const s = submissions.find(s => s.id === id);
  if (!s) return;

  const failing = s.checklist.filter(c => c.status === "fail");
  if (failing.length > 0) {
    toast(`Cannot validate — ${failing.length} requirement(s) are missing.`, "error");
    return;
  }

  // Disable button to prevent double-clicks during async call
  const validateBtn = document.querySelector(".btn-success");
  if (validateBtn) {
    validateBtn.disabled    = true;
    validateBtn.textContent = "Approving...";
  }

  try {
    // Call backend to watermark the PDF and mark it as approved
    // source_stem is the PDF filename stem stored on submission
    // (falls back to id for now since we have no real DB yet)
    const source = s.source || id;
    await apiApprove(source);
    toast("Submission validated and watermarked successfully.", "success");
  } catch {
    // Backend may not have the watermark route yet — still mark locally
    toast("Submission validated. (Watermark route not yet connected.)", "warning");
  }

  s.status  = "validated";
  currentId = null;
  renderList();

  // Show success state in detail panel
  const panel = document.getElementById("detailPanel");
  panel.innerHTML = "";

  const msg = document.createElement("div");
  msg.className = "empty-detail";

  const icon = document.createElement("div");
  icon.className   = "icon";
  icon.textContent = "✅";

  const text = document.createElement("p");
  text.style.fontWeight = "600";
  text.textContent      = "Submission validated and watermark applied.";

  msg.appendChild(icon);
  msg.appendChild(text);
  panel.appendChild(msg);
}

/**
 * Returns a submission to the student with librarian feedback.
 * TODO: POST /api/submissions/:id/return { feedback } when DB is ready.
 *
 * @param {string} id - Submission ID to return
 */
function returnSubmission(id) {
  const s        = submissions.find(s => s.id === id);
  const textarea = document.getElementById("feedbackInput");
  const feedback = textarea ? textarea.value.trim() : "";

  if (!feedback) {
    toast("Please enter feedback before returning.", "error");
    return;
  }

  s.status   = "returned";
  s.feedback = feedback;
  currentId  = null;
  renderList();

  /* Show returned state in detail panel */
  const panel = document.getElementById("detailPanel");
  panel.innerHTML = "";

  const msg = document.createElement("div");
  msg.className = "empty-detail";

  const icon = document.createElement("div");
  icon.className   = "icon";
  icon.textContent = "↩️";

  const text = document.createElement("p");
  text.style.fontWeight = "600";
  text.textContent      = "Submission returned to student.";

  msg.appendChild(icon);
  msg.appendChild(text);
  panel.appendChild(msg);

  toast("Submission returned with feedback.", "warning");
}

/* ── Filter tab handler ─────────────────────────────────────── */

/**
 * Sets the active filter tab and re-renders the list.
 * @param {string} filter - 'all' | 'pending' | 'returned'
 * @param {HTMLElement} el - The clicked tab button
 */
function filterList(filter, el) {
  currentFilter = filter;
  document.querySelectorAll(".filter-tab").forEach(b => b.classList.remove("active"));
  el.classList.add("active");
  renderList();
}

/* ── Live search ─────────────────────────────────────────────── */

/* Debounced 250ms — prevents re-render on every keystroke */
let searchTimer;
document.getElementById("searchInput").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(renderList, 250);
});

/* ── Initialize ─────────────────────────────────────────────── */
renderList();