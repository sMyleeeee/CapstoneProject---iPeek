/**
 * profile.js
 * ----------
 * Handles the Profile Settings page:
 *  - Populates form fields and profile card from session data
 *  - Password strength meter with visual bar
 *  - Validates and saves personal info + password changes
 *  - Cancel restores fields to original values
 *
 * XSS PROTECTION:
 *  - All dynamic text uses textContent — never innerHTML with user data
 *  - Form field values set via .value property — not innerHTML
 *  - Error and success messages use textContent
 *
 * TODO: Replace session-based mock data with real API calls when DB is ready:
 *   GET  /api/users/me          — load current user profile
 *   PUT  /api/users/me          — save personal info changes
 *   POST /api/users/me/password — change password
 */

/* Read session data set during login */
const uid  = sessionStorage.getItem("uid")  || "Juan Dela Cruz";
const role = sessionStorage.getItem("role") || "librarian";

/* Derive initials from the uid string */
const initials = uid.substring(0, 2).toUpperCase();

/* ── Set navbar ──────────────────────────────────────────────── */
document.getElementById("avatarEl").textContent = initials;
document.getElementById("rolePill").textContent  = role.charAt(0).toUpperCase() + role.slice(1);

/* ── Set profile card ────────────────────────────────────────── */
document.getElementById("avatarInitials").textContent = initials;
document.getElementById("profileRolePill").textContent =
  role.charAt(0).toUpperCase() + role.slice(1);

/**
 * Populates the profile card and form fields with user data.
 * All values set via textContent or .value — never innerHTML.
 *
 * TODO: Replace hardcoded mock values with API response fields:
 *   const me = await apiGetCurrentUser();
 *   document.getElementById("profileName").textContent  = me.fullName;
 *   document.getElementById("firstName").value          = me.firstName;
 *   ... etc
 */
function populateProfile() {
  /* Profile card display values */
  document.getElementById("profileName").textContent  = uid;
  document.getElementById("profileEmail").textContent = `${uid.toLowerCase().replace(/ /g, "")}@isat-u.edu.ph`;
  document.getElementById("metaId").textContent       = "LIB-2019-0042";
  document.getElementById("metaPapers").textContent   = "134";

  /* Split uid into first and last name for form fields */
  const parts = uid.split(" ");
  document.getElementById("firstName").value = parts[0] || "";
  document.getElementById("lastName").value  = parts.slice(1).join(" ") || "";
  document.getElementById("email").value     = `${uid.toLowerCase().replace(/ /g, "")}@isat-u.edu.ph`;
  document.getElementById("contact").value   = "+63 912 345 6789";
}

/* Store original values so Cancel can restore them */
const origValues = {};

/**
 * Saves original field values after populating so Cancel can restore them.
 * Called once on page load after populateProfile().
 */
function saveOriginalValues() {
  ["firstName", "lastName", "email", "contact", "department"].forEach(id => {
    const el = document.getElementById(id);
    if (el) origValues[id] = el.value;
  });
}

/* ── Password strength meter ─────────────────────────────────── */

/**
 * Evaluates password strength and updates the strength bar and label.
 * Scoring criteria:
 *  +1 — at least 8 characters
 *  +1 — at least 12 characters
 *  +1 — contains uppercase letter
 *  +1 — contains number
 *  +1 — contains special character
 *
 * @param {string} pw - The new password value being typed
 */
function checkStrength(pw) {
  const fill  = document.getElementById("pwFill");
  const label = document.getElementById("pwLabel");

  if (!pw) {
    fill.style.width      = "0%";
    fill.style.background = "";
    label.textContent     = "";
    return;
  }

  /* Calculate score from 0 to 5 */
  let score = 0;
  if (pw.length >= 8)           score++;
  if (pw.length >= 12)          score++;
  if (/[A-Z]/.test(pw))         score++;
  if (/[0-9]/.test(pw))         score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;

  /* Map score to visual feedback */
  const levels = [
    { pct: "20%",  color: "var(--danger)",  text: "Weak"   },
    { pct: "40%",  color: "var(--danger)",  text: "Weak"   },
    { pct: "60%",  color: "var(--warning)", text: "Medium" },
    { pct: "80%",  color: "var(--warning)", text: "Medium" },
    { pct: "100%", color: "var(--success)", text: "Strong" },
  ];

  const lvl = levels[Math.min(score, 4)];
  fill.style.width      = lvl.pct;
  fill.style.background = lvl.color;
  label.textContent     = `Password strength: ${lvl.text}`; /* Safe */
  label.style.color     = lvl.color;
}

/* ── Save changes ────────────────────────────────────────────── */

/**
 * Validates and saves profile changes.
 * Handles personal info and password change separately.
 * Uses textContent for all feedback messages — XSS safe.
 *
 * TODO: When DB is ready:
 *   await fetch('/api/users/me', { method:'PUT', body: JSON.stringify({...}) })
 *   await fetch('/api/users/me/password', { method:'POST', body: JSON.stringify({...}) })
 */
function saveChanges() {
  const firstName = document.getElementById("firstName").value.trim();
  const lastName  = document.getElementById("lastName").value.trim();
  const email     = document.getElementById("email").value.trim();
  const currentPw = document.getElementById("currentPw").value;
  const newPw     = document.getElementById("newPw").value;
  const confirmPw = document.getElementById("confirmPw").value;

  /* Validate required personal info */
  if (!firstName || !lastName) {
    toast("First and last name are required.", "error");
    return;
  }

  if (!email || !email.includes("@")) {
    toast("Please enter a valid email address.", "error");
    return;
  }

  /* Only validate password fields if any one of them is filled */
  if (currentPw || newPw || confirmPw) {
    if (!currentPw) {
      toast("Please enter your current password.", "error");
      return;
    }
    if (newPw.length < 8) {
      toast("New password must be at least 8 characters.", "error");
      return;
    }
    if (newPw !== confirmPw) {
      toast("New passwords do not match.", "error");
      return;
    }
  }

  /* Update profile card display using textContent — XSS safe */
  const fullName = `${firstName} ${lastName}`;
  document.getElementById("profileName").textContent  = fullName;
  document.getElementById("profileEmail").textContent = email;

  /* Update avatar initials */
  const newInitials = (firstName[0] + (lastName[0] || "")).toUpperCase();
  document.getElementById("avatarInitials").textContent = newInitials;
  document.getElementById("avatarEl").textContent       = newInitials;

  /* Update session storage so other pages stay in sync */
  sessionStorage.setItem("uid", fullName);

  /* Clear password fields after successful save */
  document.getElementById("currentPw").value = "";
  document.getElementById("newPw").value      = "";
  document.getElementById("confirmPw").value  = "";
  document.getElementById("pwFill").style.width = "0%";
  document.getElementById("pwLabel").textContent = "";

  toast("Profile updated successfully.", "success");
}

/* ── Cancel changes ──────────────────────────────────────────── */

/**
 * Resets all form fields to their original values (saved at page load).
 * Does not make any API calls.
 */
function cancelChanges() {
  Object.entries(origValues).forEach(([id, val]) => {
    const el = document.getElementById(id);
    /* Set via .value — not innerHTML */
    if (el) el.value = val;
  });

  /* Clear password fields */
  ["currentPw", "newPw", "confirmPw"].forEach(id => {
    document.getElementById(id).value = "";
  });

  document.getElementById("pwFill").style.width  = "0%";
  document.getElementById("pwLabel").textContent = "";

  toast("Changes cancelled.", "info");
}

/* ── Initialize ──────────────────────────────────────────────── */
populateProfile();
saveOriginalValues();
