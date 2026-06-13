/**
 * detail.js
 * ---------
 * Research Detail page logic:
 *  - Reads document ID from URL query param (?id=...)
 *  - Loads paper info from sessionStorage (passed from browse.js) or uses mock
 *  - Auto-runs all 3 AI analyses (similarity, summary, gaps) on page load
 *  - Handles tab switching between analysis results
 *  - Handles chat assistant
 */

/* Read the document ID from URL: detail.html?id=it001 */
const params   = new URLSearchParams(window.location.search);
const docId    = params.get("id") || "";

/* Current paper data — populated on init */
let paperData  = null;

/* Cache analysis results so tabs don't re-fetch on switch */
const cache = { similarity: null, summary: null, gaps: null };

/** Init: load paper info and trigger all analyses */
async function init() {
  /* Set nav user info */
  const uid  = sessionStorage.getItem("uid")  || "JD";
  const role = sessionStorage.getItem("role") || "student";
  document.getElementById("avatarEl").textContent = uid.substring(0,2).toUpperCase();
  document.getElementById("rolePill").textContent = role.charAt(0).toUpperCase() + role.slice(1);

  /* Load paper data */
  paperData = getMockPaper(docId);
  renderPaperInfo(paperData);

  /* Run all 3 analyses in parallel for speed */
  await Promise.all([
    runSimilarity(paperData.title + " " + paperData.abstract),
    runSummary(paperData.title + " " + paperData.abstract),
    runGaps(paperData.title + " " + paperData.abstract),
  ]);

  document.getElementById("analysisStatus").textContent = "Complete";
  document.getElementById("analysisStatus").className   = "badge badge-validated";
}

/**
 * Returns mock paper data for a given ID.
 * TODO: Replace with GET /api/documents/{id} when DB is implemented.
 */
function getMockPaper(id) {
  const papers = {
    it001: {
      id: "IT 401 · 2024", title: "IoT-Based Attendance System Using Sensors for Rice Farming in Iloilo",
      authors: "Reyes, M. et al.", advisers: "Dr. Maria Santos", year: "2024", college: "CIT",
      keywords: ["IoT", "Agriculture", "Machine Learning", "Cloud Computing"],
      abstract: "This study develops a smart irrigation system using IoT sensors to monitor soil moisture, temperature, and humidity in rice paddies across selected farms in Iloilo. The system integrates cloud-based analytics and a mobile dashboard to provide real-time irrigation recommendations. Field trials across 12 farms demonstrated a 34% reduction in water consumption while maintaining comparable crop yields.",
    },
  };
  return papers[id] || {
    id: "CS 001", title: "Research Study",
    authors: "Unknown", advisers: "Unknown", year: "2024", college: "CCI",
    keywords: ["Research"], abstract: "Abstract not available.",
  };
}

/** Render the paper info section */
function renderPaperInfo(p) {
  document.title = `iPeek — ${p.title}`;
  document.getElementById("paperTitle").textContent = p.title;
  document.getElementById("paperMeta").textContent  =
    `${p.authors} · Adviser: ${p.advisers}`;
  document.getElementById("abstractText").textContent = p.abstract;

  /* Meta chips: college, year, id */
  document.getElementById("metaChips").innerHTML = [
    p.college, p.year, p.id
  ].map(v => `<span class="meta-chip">${v}</span>`).join("") +
  `<span class="badge badge-pending">Pending</span>`;
}

/** Run similarity analysis and render bars */
async function runSimilarity(proposal) {
  try {
    const data = await apiSimilarity(proposal);
    cache.similarity = data;
    renderSimilarityBars(data.result);
    renderSimilarProjects(data.sources);
  } catch (e) {
    document.getElementById("simBars").innerHTML =
      `<div style="color:var(--danger);font-size:0.84rem;">⚠️ ${e.message}</div>`;
  }
}

/** Render similarity bars based on raw result text */
function renderSimilarityBars(resultText) {
  /* Parse HIGH/MODERATE/LOW from LLM result text */
  const simMap = { HIGH: 90, MODERATE: 60, LOW: 30 };

  /* Extract similarity levels from text */
  const entries = [];
  const lines   = resultText.split("\n");
  let   current = null;

  lines.forEach(line => {
    if (line.match(/^\d+\./)) {
      if (current) entries.push(current);
      current = { title: line.replace(/^\d+\.\s*/, "").split("|")[0].trim(), level: "LOW" };
    }
    if (current && line.match(/Similarity:\s*(HIGH|MODERATE|LOW)/i)) {
      current.level = line.match(/HIGH|MODERATE|LOW/i)[0].toUpperCase();
    }
  });
  if (current) entries.push(current);

  /* Build similarity bar HTML */
  if (entries.length === 0) {
    document.getElementById("simBars").textContent = resultText;
    return;
  }

  document.getElementById("simBars").innerHTML = entries.map(e => `
    <div class="sim-row">
      <div class="sim-label">
        <span>${e.title.substring(0, 50)}${e.title.length > 50 ? "..." : ""}</span>
        <span class="badge badge-${e.level.toLowerCase()}">${e.level}</span>
      </div>
      <div class="sim-track">
        <div class="sim-fill" style="width:${simMap[e.level] || 40}%"></div>
      </div>
    </div>`).join("");
}

/** Run summary analysis */
async function runSummary(proposal) {
  try {
    const data = await apiSummary(proposal);
    cache.summary = data;
    document.getElementById("summaryBox").textContent = data.result;
  } catch (e) {
    document.getElementById("summaryBox").innerHTML =
      `<span style="color:var(--danger);">⚠️ ${e.message}</span>`;
  }
}

/** Run gap analysis */
async function runGaps(proposal) {
  try {
    const data = await apiGaps(proposal);
    cache.gaps = data;
    document.getElementById("gapsBox").textContent = data.result;
  } catch (e) {
    document.getElementById("gapsBox").innerHTML =
      `<span style="color:var(--danger);">⚠️ ${e.message}</span>`;
  }
}

/** Render the right-panel similar projects list */
function renderSimilarProjects(sources) {
  if (!sources || sources.length === 0) {
    document.getElementById("similarProjects").innerHTML =
      `<div style="color:var(--muted);font-size:0.8rem;">No similar projects found.</div>`;
    return;
  }

  document.getElementById("similarProjects").innerHTML = sources.map(s => `
    <div class="similar-card">
      <div class="similar-card-title">${s.title}</div>
      <div class="similar-card-meta">${s.authors} · ${s.year} · ${s.college}</div>
      <span class="badge badge-moderate">Moderate Match</span>
    </div>`).join("");
}

/** Switch between analysis tabs */
function switchTab(tab, el) {
  /* Update tab button active state */
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  el.classList.add("active");

  /* Show/hide tab content panels */
  document.getElementById("tabSimilarity").style.display = tab === "similarity" ? "block" : "none";
  document.getElementById("tabSummary").style.display    = tab === "summary"    ? "block" : "none";
  document.getElementById("tabGaps").style.display       = tab === "gaps"       ? "block" : "none";
}

/** Send chat message */
async function sendChat() {
  const input = document.getElementById("chatInput");
  const q     = input.value.trim();
  if (!q) return;

  /* Add user message to chat log */
  appendMsg("user", q);
  input.value = "";

  /* Show typing indicator */
  const typingId = "typing-" + Date.now();
  appendMsg("bot", "...", typingId);

  try {
    const data = await apiChat(q);
    /* Replace typing indicator with actual response */
    document.getElementById(typingId).textContent = data.result;
  } catch (e) {
    document.getElementById(typingId).textContent = `⚠️ ${e.message}`;
  }
}

/** Append a message bubble to the chat log */
function appendMsg(role, text, id) {
  const log  = document.getElementById("chatLog");
  const div  = document.createElement("div");
  div.className = `chat-msg ${role}`;

  const bubble = document.createElement("div");
  bubble.className  = "chat-bubble";
  bubble.textContent = text;
  if (id) bubble.id = id;

  div.appendChild(bubble);
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

/** Allow Enter key to send chat (Shift+Enter for new line) */
function chatKey(e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendChat();
  }
}

init();
