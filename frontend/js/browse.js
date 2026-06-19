/**
 * browse.js
 * ---------
 * Handles the Browse Research page:
 *  - Fetches all indexed documents from GET /api/documents
 *  - Renders research cards in the grid
 *  - Filters by: status, college, technology tag, year, search text
 *  - Debounced live search so the grid doesn't re-render on every keystroke
 *  - Clicking a card navigates to detail.html?id={source}
 */

/* Active filter state — all filters start as empty/default */
let allDocs = [];
let filters = { status: "all", college: "", tag: "", year: "all", search: "" };

/* Set navbar avatar and role pill from session data */
const uid  = sessionStorage.getItem("uid")  || "JD";
const role = sessionStorage.getItem("role") || "student";
// Show librarian/admin nav if not a student
if (role === "librarian" || role === "admin") {
  document.querySelector(".nav-links").innerHTML = `
    <a class="nav-link" href="dashboard.html">Dashboard</a>
    <a class="nav-link" href="review.html">Review Queue</a>
    <a class="nav-link active" href="browse.html">Browse</a>
    <a class="nav-link" href="upload.html">Upload</a>
  `;
}
document.getElementById("avatarEl").textContent = uid.substring(0, 2).toUpperCase();
document.getElementById("rolePill").textContent = role.charAt(0).toUpperCase() + role.slice(1);

/* ── Data loading ──────────────────────────────────────────── */

/**
 * Fetches all documents from ChromaDB via the Flask API
 * and triggers the initial render.
 * Falls back to mock data if the backend is offline.
 */
async function loadDocuments() {
  try {
    const data = await apiDocuments();
    allDocs = data.documents || [];
    document.getElementById("loading").style.display = "none";
    updateCounts();
    render();
  } catch {
    /* Backend offline during development — show mock data instead */
    document.getElementById("loading").style.display = "none";
    toast("Backend offline. Showing sample data.", "warning");
    allDocs = getMockDocs();
    updateCounts();
    render();
  }
}

/**
 * Returns sample research documents for UI development
 * when the Flask backend is not running.
 * Remove this function once real data flows from the API.
 */
function getMockDocs() {
  return [
    { source:"it001", title:"IoT-Based Attendance System Using Sensors for Rice Farming in Iloilo",       authors:"Reyes, M. et al.",    year:"2024", college:"CIT", keywords:"IoT,Machine Learning",         abstract:"IoT attendance system for rice farms." },
    { source:"cs002", title:"Natural Language Processing System for Hiligaynon–English Machine Translation", authors:"Santos, D. et al.", year:"2024", college:"CCI", keywords:"Machine Learning,Web Development", abstract:"NLP-based machine translation study."   },
    { source:"it003", title:"Automated Plant Disease Detection Using CNN for Sugarcane Crops",              authors:"Dela Cruz, F. et al.", year:"2024", college:"CIT", keywords:"Machine Learning,Computer Vision", abstract:"CNN-based plant disease detection."    },
    { source:"is004", title:"Blockchain-Based Land Title Registry System for Iloilo Province",             authors:"Aguirre, P. et al.",  year:"2023", college:"COE", keywords:"Web Development",               abstract:"Blockchain land registry study."      },
    { source:"cs005", title:"IoT-Based Water Quality Monitoring and Early Warning System for Jalaur River",authors:"Lim, B. et al.",     year:"2023", college:"CEA", keywords:"IoT",                           abstract:"Water quality monitoring study."      },
    { source:"cs006", title:"Predictive Analytics for Student Academic Performance Using Ensemble Learning",authors:"Cruz, P. et al.",   year:"2022", college:"CCI", keywords:"Machine Learning",               abstract:"Ensemble learning grade prediction."  },
  ];
}

/* ── Filtering and rendering ───────────────────────────────── */

/**
 * Applies active filters and re-renders the research card grid.
 * Called every time a filter changes or the search input updates.
 */
function render() {
  const q = filters.search.toLowerCase();

  /* Apply all active filters to the full document list */
  const docs = allDocs.filter(d => {
    if (filters.college && !d.college.includes(filters.college))              return false;
    if (filters.year !== "all" && d.year !== filters.year)                    return false;
    if (filters.tag && !d.keywords.includes(filters.tag))                    return false;
    if (q && !d.title.toLowerCase().includes(q) &&
             !d.authors.toLowerCase().includes(q) &&
             !d.keywords.toLowerCase().includes(q))                           return false;
    return true;
  });

  const grid  = document.getElementById("grid");
  const empty = document.getElementById("empty");

  /* Update result count label */
  document.getElementById("resultsCount").textContent =
    `Showing ${docs.length} result${docs.length !== 1 ? "s" : ""} — ISAT-U Main Campus`;

  /* Show empty state if no results */
  if (docs.length === 0) {
    grid.innerHTML      = "";
    empty.style.display = "block";
    return;
  }

  empty.style.display = "none";

  /* Build and inject research card HTML */
  grid.innerHTML = docs.map(d => {
    /* Show up to 3 keyword tags per card */
    const tags = d.keywords.split(",").filter(Boolean).slice(0, 3)
      .map(t => `<span class="tag">${t.trim()}</span>`).join("");

    return `
      <div class="r-card" onclick="openDetail('${d.source}')">
        <div class="r-card-id">${d.college || "—"} · ${d.year || "—"}</div>
        <div class="r-card-title">${d.title}</div>
        <div class="r-card-meta">${d.authors}</div>
        <div class="r-card-tags">${tags}</div>
      </div>`;
  }).join("");
}

/**
 * Updates the sidebar count badges after documents load.
 * TODO: Filter by real status values when DB is implemented.
 */
function updateCounts() {
  document.getElementById("cntAll").textContent      = allDocs.length;
  document.getElementById("cntApproved").textContent = allDocs.length;
  document.getElementById("cntOngoing").textContent  = 0;
  document.getElementById("cntRejected").textContent = 0;
}

/* ── Filter handlers ───────────────────────────────────────── */

/**
 * Sets a sidebar filter and re-renders the grid.
 * Toggles off if the same non-status filter is clicked again.
 * @param {string} type  - Filter type: 'status' | 'college' | 'tag'
 * @param {string} value - Filter value
 * @param {HTMLElement} el - The clicked button element
 */
function setFilter(type, value, el) {
  el.closest(".sb-section").querySelectorAll(".sb-item")
    .forEach(b => b.classList.remove("active"));
  el.classList.add("active");

  /* Toggle off if clicking the same filter again (except status) */
  filters[type] = (filters[type] === value && type !== "status") ? "" : value;
  render();
}

/**
 * Sets the active year filter pill and re-renders.
 * @param {string} year - '2024' | '2023' | '2022' | 'all'
 * @param {HTMLElement} el - The clicked pill button
 */
function setYear(year, el) {
  document.querySelectorAll(".year-pill").forEach(p => p.classList.remove("active"));
  el.classList.add("active");
  filters.year = year;
  render();
}

/**
 * Navigates to the research detail page for the selected document.
 * Passes the document source ID as a URL query parameter.
 * @param {string} source - Document source ID from ChromaDB metadata
 */
function openDetail(source) {
  window.location.href = `detail.html?id=${encodeURIComponent(source)}`;
}

/* ── Live search ───────────────────────────────────────────── */

/* Debounced search — waits 300ms after last keystroke before filtering */
let searchTimer;
document.getElementById("searchInput").addEventListener("input", e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    filters.search = e.target.value;
    render();
  }, 300);
});

/* ── Initialize ────────────────────────────────────────────── */
loadDocuments();
