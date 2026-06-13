/**
 * browse.js
 * ---------
 * Handles the Browse Research page:
 *  - Fetches all indexed documents from /api/documents
 *  - Renders research cards in the grid
 *  - Filters by status, college, tag, year, and search text
 *  - Clicking a card navigates to detail.html with the doc ID
 */

let allDocs  = [];   // full document list from API
let filters  = { status: "all", college: "", tag: "", year: "all", search: "" };

/** Fetch all documents from ChromaDB and render them */
async function loadDocuments() {
  try {
    const data = await apiDocuments();
    allDocs = data.documents || [];
    updateCounts();
    render();
    document.getElementById("loading").style.display = "none";
  } catch (e) {
    document.getElementById("loading").style.display = "none";
    toast("Failed to load repository. Is the backend running?", "error");
    // Show mock data so the page isn't empty during development
    allDocs = getMockDocs();
    render();
  }
}

/**
 * Returns mock documents for UI development when backend is offline.
 * Remove this once real data flows from the API.
 */
function getMockDocs() {
  return [
    { source:"it001", title:"IoT-Based Attendance System Using Sensors for Rice Farming in Iloilo", authors:"Reyes, M. et al.", year:"2024", college:"CIT", keywords:"IoT,Machine Learning", abstract:"This study develops an IoT attendance system..." },
    { source:"cs002", title:"Natural Language Processing System for Hiligaynon–English Machine Translation", authors:"Santos, D. et al.", year:"2024", college:"CCI", keywords:"Machine Learning,Web Development", abstract:"A study on NLP-based machine translation..." },
    { source:"it003", title:"Automated Plant Disease Detection Using CNN for Sugarcane Crops in Western Visayas", authors:"Dela Cruz, F. et al.", year:"2024", college:"CIT", keywords:"Machine Learning,Computer Vision", abstract:"CNN-based plant disease detection study..." },
    { source:"is004", title:"Blockchain-Based Land Title Registry System for Iloilo Province", authors:"Aguirre, P. et al.", year:"2023", college:"COE", keywords:"Web Development", abstract:"A blockchain study for land registry..." },
    { source:"cs005", title:"IoT-Based Water Quality Monitoring and Early Warning System for Jalaur River", authors:"Lim, B. et al.", year:"2023", college:"CEA", keywords:"IoT", abstract:"Water quality monitoring study..." },
    { source:"cs006", title:"Predictive Analytics for Student Academic Performance Using Ensemble Learning", authors:"Cruz, P. et al.", year:"2022", college:"CCI", keywords:"Machine Learning", abstract:"Ensemble learning for grade prediction..." },
  ];
}

/** Re-render grid based on current filters */
function render() {
  const q    = filters.search.toLowerCase();
  const docs = allDocs.filter(d => {
    if (filters.college && !d.college.includes(filters.college)) return false;
    if (filters.year !== "all" && d.year !== filters.year) return false;
    if (filters.tag && !d.keywords.includes(filters.tag)) return false;
    if (q && !d.title.toLowerCase().includes(q) &&
             !d.authors.toLowerCase().includes(q) &&
             !d.keywords.toLowerCase().includes(q)) return false;
    return true;
  });

  const grid = document.getElementById("grid");
  const empty = document.getElementById("empty");

  document.getElementById("resultsCount").textContent =
    `Showing ${docs.length} result${docs.length !== 1 ? "s" : ""} — ISAT-U Main Campus`;

  if (docs.length === 0) {
    grid.innerHTML = "";
    empty.style.display = "block";
    return;
  }

  empty.style.display = "none";

  /* Build cards */
  grid.innerHTML = docs.map((d, i) => {
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

/** Update sidebar counts */
function updateCounts() {
  document.getElementById("cntAll").textContent      = allDocs.length;
  document.getElementById("cntApproved").textContent = allDocs.length;  // TODO: filter by status when DB ready
  document.getElementById("cntOngoing").textContent  = 0;
  document.getElementById("cntRejected").textContent = 0;
}

/** Handle sidebar filter clicks */
function setFilter(type, value, el) {
  /* Clear active state for this filter group */
  el.closest(".sb-section").querySelectorAll(".sb-item")
    .forEach(b => b.classList.remove("active"));
  el.classList.add("active");

  /* Toggle off if same value clicked again */
  if (filters[type] === value && type !== "status") {
    filters[type] = "";
  } else {
    filters[type] = value;
  }
  render();
}

/** Handle year pill clicks */
function setYear(year, el) {
  document.querySelectorAll(".year-pill").forEach(p => p.classList.remove("active"));
  el.classList.add("active");
  filters.year = year;
  render();
}

/** Navigate to detail page with document source as query param */
function openDetail(source) {
  window.location.href = `detail.html?id=${encodeURIComponent(source)}`;
}

/* Live search — debounced 300ms so we don't re-render on every keystroke */
let searchTimer;
document.getElementById("searchInput").addEventListener("input", e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    filters.search = e.target.value;
    render();
  }, 300);
});

/* Set nav user info */
const uid  = sessionStorage.getItem("uid")  || "JD";
const role = sessionStorage.getItem("role") || "student";
document.getElementById("avatarEl").textContent = uid.substring(0,2).toUpperCase();
document.getElementById("rolePill").textContent = role.charAt(0).toUpperCase() + role.slice(1);

/* Init */
loadDocuments();
