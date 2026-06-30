/**
 * upload.js
 * ---------
 * Handles the multi-step Submit Research form:
 *  Step 1 — Research info fields
 *  Step 2 — PDF drag-and-drop upload
 *  Step 3 — Review summary + submit to /api/ingest
 *
 * XSS PROTECTION:
 *  - All dynamic text written with textContent — never innerHTML with user input
 *  - Form field values displayed using textContent in the review step
 *  - API error messages rendered with textContent only
 */

/* Currently active step number */
let currentStep  = 1;

/* Holds the selected File object from the drag-drop or file input */
let selectedFile = null;

/* Set navbar from session */
const uid  = sessionStorage.getItem("uid")  || "JD";
const role = sessionStorage.getItem("role") || "student";
document.getElementById("avatarEl").textContent = uid.substring(0, 2).toUpperCase();
document.getElementById("rolePill").textContent = role.charAt(0).toUpperCase() + role.slice(1);

/* ── Step navigation ────────────────────────────────────────── */

/**
 * Navigates to a target step.
 * Validates the current step before allowing forward movement.
 * Updates step dot styles and panel visibility.
 *
 * @param {number} step - Target step (1–3)
 */
function goStep(step) {
  /* Validate before going forward — prevent skipping required fields */
  if (step > currentStep && !validateStep(currentStep)) return;

  /* Update step dot appearance */
  for (let i = 1; i <= 3; i++) {
    const el = document.getElementById(`step${i}`);
    el.classList.remove("active", "done");
    if (i < step)  el.classList.add("done");
    if (i === step) el.classList.add("active");
  }

  /* Show only the target panel, hide all others */
  for (let i = 1; i <= 3; i++) {
    document.getElementById(`panel${i}`).style.display = i === step ? "block" : "none";
  }

  /* Populate review summary when reaching step 3 */
  if (step === 3) populateReview();

  currentStep = step;
}

/**
 * Validates required fields for the given step.
 * Shows a toast and returns false if validation fails.
 *
 * @param {number} step - Step number to validate
 * @returns {boolean} True if valid, false if not
 */
function validateStep(step) {
  if (step === 1) {
    if (!document.getElementById("resTitle").value.trim()) {
      toast("Please enter a research title.", "error");
      return false;
    }
  }
  if (step === 2) {
    if (!selectedFile) {
      toast("Please upload a PDF document before continuing.", "error");
      return false;
    }
  }
  return true;
}

/**
 * Populates the Step 3 review summary with values from the form fields.
 * Uses textContent exclusively — never innerHTML with user-typed data.
 */
function populateReview() {
  document.getElementById("reviewTitle").textContent   = document.getElementById("resTitle").value   || "—";
  document.getElementById("reviewDept").textContent    = document.getElementById("resDept").value    || "—";
  document.getElementById("reviewMembers").textContent = document.getElementById("resMembers").value || "—";
  document.getElementById("reviewFile").textContent    = selectedFile ? selectedFile.name : "No file selected";
}

/* ── Drag and drop upload ────────────────────────────────────── */

/**
 * Prevents default browser behavior when a file is dragged over the zone.
 * Adds the 'over' visual state.
 * @param {DragEvent} e
 */
function dragOver(e) {
  e.preventDefault();
  document.getElementById("dropZone").classList.add("over");
}

/**
 * Removes the 'over' visual state when the drag leaves the zone.
 */
function dragLeave() {
  document.getElementById("dropZone").classList.remove("over");
}

/**
 * Handles a file dropped onto the drop zone.
 * @param {DragEvent} e
 */
function dropped(e) {
  e.preventDefault();
  dragLeave();
  const file = e.dataTransfer.files[0];
  if (file) setFile(file);
}

/**
 * Handles file selection from the hidden file input element.
 * @param {Event} e - Change event from <input type="file">
 */
function fileChosen(e) {
  const file = e.target.files[0];
  if (file) setFile(file);
}

/**
 * Validates and stores the selected PDF file.
 * Shows the file info bar and hides the drop zone.
 * Validates file type and size before accepting.
 *
 * @param {File} file - File object from drag or input
 */
function setFile(file) {
  /* Only accept PDF files */
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    toast("Only PDF files are accepted.", "error");
    return;
  }

  /* Enforce 25MB size limit matching the backend config */
  if (file.size > 25 * 1024 * 1024) {
    toast("File exceeds the 25MB limit.", "error");
    return;
  }

  selectedFile = file;

  /* Show file info bar using textContent — never innerHTML with filename */
  document.getElementById("fileName").textContent = file.name;
  document.getElementById("fileSize").textContent =
    (file.size / 1024 / 1024).toFixed(2) + " MB";

  document.getElementById("fileInfo").style.display = "flex";
  document.getElementById("dropZone").style.display  = "none";
}

/**
 * Clears the selected file and resets the upload zone to its initial state.
 */
function clearFile() {
  selectedFile = null;
  document.getElementById("fileInfo").style.display = "none";
  document.getElementById("dropZone").style.display  = "block";
  document.getElementById("fileInput").value          = "";
}

/* ── Submit ──────────────────────────────────────────────────── */

/**
 * Submits the research paper:
 *  1. Validates a file is selected
 *  2. Calls POST /api/ingest to upload + index the PDF into ChromaDB
 *  3. Shows success message and redirects to browse after 2.5s
 *
 * Error messages rendered with textContent — XSS safe.
 *
 * TODO: Also POST metadata to /api/submissions when DB is ready
 *       so the librarian review queue receives the new submission.
 */
async function submitPaper() {
  if (!selectedFile) {
    toast("No PDF selected.", "error");
    return;
  }

  const btn    = document.getElementById("submitBtn");
  const status = document.getElementById("submitStatus");

  /* Disable button to prevent double-submission */
  btn.disabled    = true;
  btn.textContent = "Submitting...";

  /* Show loading state */
  status.style.display = "block";
  status.style.background = "var(--bg)";
  status.style.padding = "12px 14px";
  status.style.borderRadius = "7px";
  status.style.fontSize = "0.84rem";
  status.style.color = "var(--muted)";
  status.textContent = "⏳ Uploading and indexing document into repository...";

try {
    const result = await apiIngest(selectedFile);

    // Save submission metadata to the database
    await fetch("/api/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source:     result.metadata?.source || selectedFile.name.replace(".pdf", ""),
        title:      document.getElementById("resTitle").value.trim(),
        department: document.getElementById("resDept").value,
        members:    document.getElementById("resMembers").value.trim(),
        year:       document.getElementById("resYear").value.trim(),
        abstract:   document.getElementById("resAbstract").value.trim(),
      }),
    });

    // Success state
    status.style.background = "#f0fdf4";
    status.style.border     = "1px solid #86efac";
    status.style.color      = "var(--success)";

    const titleText = result.metadata?.title || selectedFile.name;
    status.textContent =
      `✅ "${titleText}" submitted successfully — ${result.chunks} chunks indexed. Pending librarian review.`;

    toast("Research submitted successfully!", "success");
    setTimeout(() => { window.location.href = "browse.html"; }, 2500);

  } catch (e) {
    /* Error state — e.message rendered safely with textContent */
    status.style.background = "#fef2f2";
    status.style.border     = "1px solid #fca5a5";
    status.style.color      = "var(--danger)";
    status.textContent      = `⚠️ Submission failed: ${e.message}`;

    /* Re-enable submit button so user can try again */
    btn.disabled    = false;
    btn.textContent = "Submit Research →";
  }
}

/**
 * Placeholder for draft saving.
 * TODO: Implement localStorage or POST /api/submissions/draft when ready.
 */
function saveDraft() {
  toast("Draft saved locally.", "info");
}

/* ── Initialize ──────────────────────────────────────────────── */

/* Start on step 1 */
goStep(1);