/**
 * dashboard.js
 * ------------
 * Handles the Librarian/Admin Dashboard page:
 *  - Sets navbar avatar and role pill from session
 *  - Renders stat cards (total, pending, validated, rejected)
 *  - Renders the recent submissions list
 *  - Shows repository chunk count from ChromaDB via /api/status
 *
 * TODO: Replace mockSubmissions with GET /api/submissions when DB is ready.
 */

/* Read session data set during login */
const uid  = sessionStorage.getItem("uid")  || "User";
const role = sessionStorage.getItem("role") || "librarian";

/* Set navbar avatar initials and role pill */
document.getElementById("avatarEl").textContent  = uid.substring(0, 2).toUpperCase();
document.getElementById("rolePill").textContent   = role.charAt(0).toUpperCase() + role.slice(1);
document.getElementById("greeting").textContent   = uid;

/**
 * Mock submissions data used while DB is not yet implemented.
 * Each item has: title, authors, time, status.
 * Status values: 'pending' | 'validated' | 'returned'
 *
 * TODO: Remove and replace with:
 *   const res  = await fetch('/api/submissions');
 *   const data = await res.json();
 *   const submissions = data.submissions;
 */
const mockSubmissions = [
  {
    title:   "AI-Powered Crop Disease Detection Using CNN",
    authors: "Reyes, A. et al.",
    time:    "2 hours ago",
    status:  "pending",
  },
  {
    title:   "Smart Traffic Management System for Urban Areas",
    authors: "Santos, M. et al.",
    time:    "Yesterday",
    status:  "validated",
  },
  {
    title:   "Mobile POS System for Local MSME Enterprises",
    authors: "Lim, J. et al.",
    time:    "2 days ago",
    status:  "pending",
  },
  {
    title:   "Blockchain-Based Student Records System",
    authors: "Cruz, P. et al.",
    time:    "3 days ago",
    status:  "returned",
  },
];

/**
 * Renders the recent submissions list inside #recentList.
 * Each item shows title, authors, time, and a status badge.
 */
function renderRecentList() {
  const list = document.getElementById("recentList");

  list.innerHTML = mockSubmissions.map(s => `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;
                padding:9px 0;border-bottom:1px solid var(--border);">
      <div>
        <div style="font-size:0.84rem;font-weight:600;margin-bottom:2px;">${s.title}</div>
        <div style="font-size:0.74rem;color:var(--muted);">${s.authors} · ${s.time}</div>
      </div>
      <span class="badge badge-${s.status}">${s.status}</span>
    </div>
  `).join("");
}

/**
 * Updates the 4 stat cards with counts from mockSubmissions.
 * Also updates the action alert message with the pending count.
 */
function renderStats() {
  const total     = mockSubmissions.length;
  const pending   = mockSubmissions.filter(s => s.status === "pending").length;
  const validated = mockSubmissions.filter(s => s.status === "validated").length;
  const rejected  = mockSubmissions.filter(s => s.status === "returned").length;

  document.getElementById("statTotal").textContent     = total;
  document.getElementById("statPending").textContent   = pending;
  document.getElementById("statValidated").textContent = validated;
  document.getElementById("statRejected").textContent  = rejected;
  document.getElementById("pendingMsg").textContent    =
    `${pending} research paper${pending !== 1 ? "s" : ""} awaiting review and validation.`;
}

/**
 * Fetches the ChromaDB chunk count from /api/status
 * and shows a toast if the repository has indexed documents.
 */
async function loadRepositoryStatus() {
  try {
    const data = await apiStatus();
    if (data.chunks_indexed > 0) {
      toast(`Repository: ${data.chunks_indexed} chunks indexed in ChromaDB`, "success");
    }
  } catch {
    /* Silent fail — backend may not be running during UI development */
  }
}

/* ── Initialize page ────────────────────────────────────────── */
renderRecentList();
renderStats();
loadRepositoryStatus();
