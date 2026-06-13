/**
 * review.js
 * ---------
 * Librarian Review Queue page logic:
 *  - Renders the list of pending/returned submissions
 *  - Shows detailed checklist, AI analysis status, and librarian feedback
 *  - Validate and Return actions
 *
 * TODO: Replace mock data with real API calls when DB is implemented:
 *   GET  /api/submissions          — fetch all submissions
 *   POST /api/submissions/:id/validate — mark as validated
 *   POST /api/submissions/:id/return   — return with feedback
 */

/* Set nav user info from session */
const uid  = sessionStorage.getItem("uid")  || "JD";
const role = sessionStorage.getItem("role") || "librarian";
document.getElementById("avatarEl").textContent = uid.substring(0,2).toUpperCase();
document.getElementById("rolePill").textContent  = role.charAt(0).toUpperCase() + role.slice(1);

/**
 * Mock submissions data.
 * Each submission has:
 *  - id, title, authors, college, status, time, abstract
 *  - checklist: array of { label, status } where status is 'ok'|'warn'|'fail'
 *  - aiStatus: 'pending' | 'complete' | 'error'
 *  - feedback: librarian note (if returned)
 */
const submissions = [
  {
    id: "sub001",
    title: "AI-Powered Crop Disease Detection Using Convolutional Neural Networks",
    authors: "Reyes, A.  ·  Santos, M.  ·  Lim, C.  ·  Dela Cruz, K.",
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
    title: "Mobile POS System for Local MSME Enterprises",
    authors: "Lim, J.  ·  Garcia, R.  ·  Tan, S.",
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
    title: "Blockchain-Based Student Records System",
    authors: "Cruz, P.  ·  Mendoza, L.",
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
    title: "Water Quality Monitoring Using IoT Sensors",
    authors: "Bautista, R.  ·  Flores, M.  ·  Reyes, K.",
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

let currentFilter = "all";
let currentId     = null;

/* ── Render submission list ───────────────────────────────────────────────── */

function renderList() {
  const q    = document.getElementById("searchInput").value.toLowerCase();
  const list = document.getElementById("subList");

  /* Filter by tab and search */
  const filtered = submissions.filter(s => {
    if (currentFilter !== "all" && s.status !== currentFilter) return false;
    if (q && !s.title.toLowerCase().includes(q) &&
             !s.authors.toLowerCase().includes(q)) return false;
    return true;
  });

  /* Update tab counts */
  document.getElementById("cntAll").textContent     = submissions.length;
  document.getElementById("cntPending").textContent = submissions.filter(s => s.status === "pending").length;
  document.getElementById("cntReturned").textContent= submissions.filter(s => s.status === "returned").length;

  if (filtered.length === 0) {
    list.innerHTML = `<div style="text-align:center;padding:40px 0;color:var(--muted);font-size:0.84rem;">No submissions found.</div>`;
    return;
  }

  list.innerHTML = filtered.map(s => `
    <div class="sub-item ${currentId === s.id ? 'active' : ''}"
         onclick="selectSubmission('${s.id}')">
      <div class="sub-item-title">${s.title}</div>
      <div class="sub-item-meta">${s.authors.split('·')[0].trim()}  ·  ${s.college}</div>
      <div class="sub-item-footer">
        <span class="sub-item-time">${s.time}</span>
        <span class="badge badge-${s.status}">${s.status}</span>
      </div>
    </div>
  `).join("");
}

/* ── Render detail panel ──────────────────────────────────────────────────── */

/**
 * Selects a submission and renders the detail view on the right.
 * @param {string} id - Submission ID
 */
function selectSubmission(id) {
  currentId = id;
  const s   = submissions.find(s => s.id === id);
  if (!s) return;

  /* Re-render list to update active highlight */
  renderList();

  /* Build checklist items */
  const iconMap = { ok: "✅", warn: "⚠️", fail: "❌" };
  const clHtml  = s.checklist.map(c => `
    <li class="cl-item">
      <span class="cl-icon cl-${c.status}">${iconMap[c.status]}</span>
      <span>${c.label}${c.note ? ` — <em style="color:var(--${c.status === 'warn' ? 'warning' : 'danger'})">${c.note}</em>` : ""}</span>
    </li>
  `).join("");

  /* AI analysis notice */
  const aiHtml = s.aiStatus === "complete"
    ? `<div class="ai-notice">🤖 AI Analysis complete — similarity check passed.</div>`
    : `<div class="ai-notice">🤖 AI Analysis — <strong>Pending Validation</strong>. Similarity check will run after approval.</div>`;

  /* Librarian feedback section */
  const fbHtml = `
    <div class="card feedback-card">
      <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;
                  letter-spacing:0.07em;color:var(--muted);margin-bottom:8px;">
        Librarian Feedback
      </div>
      <textarea class="form-input" id="feedbackInput" rows="3"
        placeholder="Enter feedback or reason for returning...">${s.feedback}</textarea>
    </div>`;

  /* Render full detail panel */
  document.getElementById("detailPanel").innerHTML = `
    <div>
      <!-- Title + chips -->
      <div class="detail-header">
        <div class="detail-title">${s.title}</div>
        <div style="font-size:0.78rem;color:var(--muted);margin-bottom:10px;">${s.authors}</div>
        <div class="detail-chips">
          <span class="detail-chip">${s.college}</span>
          <span class="detail-chip">${s.year}</span>
          <span class="detail-chip">${s.time}</span>
          <span class="badge badge-${s.status}">${s.status}</span>
        </div>
      </div>

      <!-- Abstract -->
      <div class="card" style="margin-bottom:14px;">
        <div style="font-size:0.7rem;font-weight:700;text-transform:uppercase;
                    letter-spacing:0.07em;color:var(--muted);margin-bottom:6px;">Abstract</div>
        <p style="font-size:0.84rem;line-height:1.7;color:var(--text);">${s.abstract}</p>
      </div>

      <!-- Requirements checklist -->
      <div class="card checklist-card">
        <div style="font-size:0.7rem;font-weight:700;text-transform:uppercase;
                    letter-spacing:0.07em;color:var(--muted);margin-bottom:10px;">
          Requirements Checklist
        </div>
        <ul class="checklist">${clHtml}</ul>
      </div>

      <!-- AI notice -->
      ${aiHtml}

      <!-- Feedback -->
      ${fbHtml}

      <!-- Action buttons -->
      <div class="action-row">
        <button class="btn btn-ghost" onclick="returnSubmission('${s.id}')">
          ↩ Return
        </button>
        <button class="btn btn-success" onclick="validateSubmission('${s.id}')">
          ✅ Validate
        </button>
      </div>
    </div>
  `;
}

/* ── Actions ──────────────────────────────────────────────────────────────── */

/**
 * Marks a submission as validated.
 * TODO: POST /api/submissions/:id/validate when DB is ready.
 */
function validateSubmission(id) {
  const s = submissions.find(s => s.id === id);
  if (!s) return;

  /* Check all required fields pass */
  const failing = s.checklist.filter(c => c.status === "fail");
  if (failing.length > 0) {
    toast(`Cannot validate — ${failing.length} requirement(s) are missing.`, "error");
    return;
  }

  s.status = "validated";
  toast(`"${s.title.substring(0,40)}..." validated successfully.`, "success");
  currentId = null;
  renderList();
  document.getElementById("detailPanel").innerHTML = `
    <div class="empty-detail">
      <div class="icon">✅</div>
      <p style="font-weight:600;">Submission validated.</p>
    </div>`;
}

/**
 * Returns a submission to the student with feedback.
 * TODO: POST /api/submissions/:id/return { feedback } when DB is ready.
 */
function returnSubmission(id) {
  const s        = submissions.find(s => s.id === id);
  const feedback = document.getElementById("feedbackInput")?.value.trim();

  if (!feedback) {
    toast("Please enter feedback before returning.", "error");
    return;
  }

  s.status   = "returned";
  s.feedback = feedback;
  toast(`Submission returned with feedback.`, "warning");
  currentId  = null;
  renderList();
  document.getElementById("detailPanel").innerHTML = `
    <div class="empty-detail">
      <div class="icon">↩️</div>
      <p style="font-weight:600;">Submission returned to student.</p>
    </div>`;
}

/* ── Filter tab ───────────────────────────────────────────────────────────── */

function filterList(filter, el) {
  currentFilter = filter;
  document.querySelectorAll(".filter-tab").forEach(b => b.classList.remove("active"));
  el.classList.add("active");
  renderList();
}

/* ── Live search ──────────────────────────────────────────────────────────── */
let searchTimer;
document.getElementById("searchInput").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(renderList, 250);
});

/* Init */
renderList();
