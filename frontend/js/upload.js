/**
 * upload.js
 * ---------
 * Handles the Submit Research multi-step form:
 *  Step 1 — Research info fields
 *  Step 2 — PDF drag-and-drop upload
 *  Step 3 — Signature checkboxes
 *  Step 4 — Review + submit (ingests PDF into ChromaDB)
 */

let currentStep  = 1;
let selectedFile = null;

/* Set nav user info */
const uid  = sessionStorage.getItem("uid")  || "JD";
const role = sessionStorage.getItem("role") || "student";
document.getElementById("avatarEl").textContent = uid.substring(0,2).toUpperCase();
document.getElementById("rolePill").textContent = role.charAt(0).toUpperCase() + role.slice(1);

/**
 * Navigate to a step.
 * Validates current step before advancing.
 * @param {number} step - Target step number (1-4)
 */
function goStep(step) {
  /* Validate before going forward */
  if (step > currentStep) {
    if (!validateStep(currentStep)) return;
  }

  /* Update step dots */
  for (let i = 1; i <= 4; i++) {
    const el = document.getElementById(`step${i}`);
    el.classList.remove("active", "done");
    if (i < step)  el.classList.add("done");
    if (i === step) el.classList.add("active");
  }

  /* Show/hide panels */
  for (let i = 1; i <= 4; i++) {
    document.getElementById(`panel${i}`).style.display = i === step ? "block" : "none";
  }

  /* If going to step 4, populate review summary */
  if (step === 4) populateReview();

  currentStep = step;
}

/** Validate required fields for current step */
function validateStep(step) {
  if (step === 1) {
    if (!document.getElementById("resTitle").value.trim()) {
      toast("Please enter a research title.", "error");
      return false;
    }
    if (!document.getElementById("resLead").value.trim()) {
      toast("Please enter the lead researcher name.", "error");
      return false;
    }
  }
  if (step === 2) {
    if (!selectedFile) {
      toast("Please upload a PDF document.", "error");
      return false;
    }
  }
  return true;
}

/** Populate review step with form values */
function populateReview() {
  document.getElementById("reviewTitle").textContent   = document.getElementById("resTitle").value   || "—";
  document.getElementById("reviewDept").textContent    = document.getElementById("resDept").value    || "—";
  document.getElementById("reviewLead").textContent    = document.getElementById("resLead").value    || "—";
  document.getElementById("reviewMembers").textContent = document.getElementById("resMembers").value || "—";
  document.getElementById("reviewFile").textContent    = selectedFile ? selectedFile.name : "No file";
}

/* ── File upload handlers ──────────────────────────────────────────────────── */

function dragOver(e) {
  e.preventDefault();
  document.getElementById("dropZone").classList.add("over");
}

function dragLeave() {
  document.getElementById("dropZone").classList.remove("over");
}

function dropped(e) {
  e.preventDefault();
  dragLeave();
  const file = e.dataTransfer.files[0];
  if (file) setFile(file);
}

function fileChosen(e) {
  const file = e.target.files[0];
  if (file) setFile(file);
}

/** Set selected file and show file info bar */
function setFile(file) {
  if (!file.name.endsWith(".pdf")) {
    toast("Only PDF files are accepted.", "error");
    return;
  }
  if (file.size > 25 * 1024 * 1024) {
    toast("File exceeds 25MB limit.", "error");
    return;
  }

  selectedFile = file;
  document.getElementById("fileName").textContent = file.name;
  document.getElementById("fileSize").textContent = (file.size / 1024 / 1024).toFixed(2) + " MB";
  document.getElementById("fileInfo").style.display = "flex";
  document.getElementById("dropZone").style.display  = "none";
}

function clearFile() {
  selectedFile = null;
  document.getElementById("fileInfo").style.display = "none";
  document.getElementById("dropZone").style.display  = "block";
  document.getElementById("fileInput").value = "";
}

/* ── Signature toggles ─────────────────────────────────────────────────────── */

function toggleSig(id) {
  document.getElementById(id).classList.toggle("signed");
}

/* ── Submit ─────────────────────────────────────────────────────────────────── */

/**
 * Submits the paper:
 *  1. Uploads PDF to /api/ingest (ingests into ChromaDB)
 *  2. Shows success message and redirects to browse page
 *
 * TODO: When DB is ready, also POST metadata to /api/submissions
 *       so the librarian review queue receives the submission.
 */
async function submitPaper() {
  const btn    = document.getElementById("submitBtn");
  const status = document.getElementById("submitStatus");

  if (!selectedFile) {
    toast("No PDF selected.", "error");
    return;
  }

  /* Disable button and show loading */
  btn.disabled     = true;
  btn.textContent  = "Submitting...";
  status.style.display = "block";
  status.innerHTML = `<div style="display:flex;align-items:center;gap:8px;font-size:0.84rem;color:var(--muted);">
    <div class="spinner"></div> Uploading and ingesting document into repository...
  </div>`;

  try {
    /* Ingest PDF into ChromaDB via Flask API */
    const result = await apiIngest(selectedFile);

    status.innerHTML = `
      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:7px;
           padding:12px 14px;font-size:0.84rem;color:var(--success);">
        ✅ <strong>Submitted successfully!</strong><br>
        "${result.metadata?.title}" has been ingested into the repository
        (${result.chunks} chunks indexed). Pending librarian review.
      </div>`;

    toast("Research submitted successfully!", "success");

    /* Redirect to browse page after 2.5s */
    setTimeout(() => window.location.href = "browse.html", 2500);

  } catch (e) {
    status.innerHTML = `
      <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:7px;
           padding:12px 14px;font-size:0.84rem;color:var(--danger);">
        ⚠️ Submission failed: ${e.message}
      </div>`;
    btn.disabled    = false;
    btn.textContent = "Submit Research →";
  }
}

function saveDraft() {
  toast("Draft saved locally.", "info");
}

/* Init: start on step 1 */
goStep(1);
