/**
 * profile.js
 * ----------
 * Profile settings page logic:
 *  - Populates fields from sessionStorage (set during login)
 *  - Password strength meter
 *  - Save changes validation
 *  - Cancel resets fields to original values
 *
 * TODO: When DB is ready:
 *   GET  /api/users/me         — load current user profile
 *   PUT  /api/users/me         — update personal info
 *   POST /api/users/me/password — change password
 */

/* Read session data */
const uid    = sessionStorage.getItem("uid")  || "Juan Dela Cruz";
const role   = sessionStorage.getItem("role") || "librarian";
const initials = uid.substring(0, 2).toUpperCase();

/* Set navbar */
document.getElementById("avatarEl").textContent      = initials;
document.getElementById("rolePill").textContent       = role.charAt(0).toUpperCase() + role.slice(1);

/* Set profile card */
document.getElementById("avatarInitials").textContent = initials;
document.getElementById("avatarLarge").style.background = "#1a2d4f";
document.getElementById("profileRolePill").textContent  = role.charAt(0).toUpperCase() + role.slice(1);

/* Store original values for cancel */
const origValues = {};

window.addEventListener("DOMContentLoaded", () => {
  ["firstName","lastName","email","contact","department"].forEach(id => {
    const el = document.getElementById(id);
    if (el) origValues[id] = el.value;
  });
});

/* ── Password strength meter ─────────────────────────────────────────────── */

/**
 * Evaluates password strength and updates the visual strength bar.
 * Strength criteria:
 *  Weak   — less than 6 chars
 *  Medium — 6-9 chars or only letters/numbers
 *  Strong — 10+ chars with mixed case, numbers, symbols
 *
 * @param {string} pw - The password value to evaluate
 */
function checkStrength(pw) {
  const fill  = document.getElementById("pwFill");
  const label = document.getElementById("pwLabel");

  if (!pw) {
    fill.style.width      = "0%";
    label.textContent     = "";
    return;
  }

  /* Score criteria */
  let score = 0;
  if (pw.length >= 8)                    score++;   // min length
  if (pw.length >= 12)                   score++;   // good length
  if (/[A-Z]/.test(pw))                  score++;   // uppercase
  if (/[0-9]/.test(pw))                  score++;   // number
  if (/[^A-Za-z0-9]/.test(pw))          score++;   // symbol

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
  label.textContent     = `Password strength: ${lvl.text}`;
  label.style.color     = lvl.color;
}

/* ── Save changes ─────────────────────────────────────────────────────────── */

/**
 * Validates and saves profile changes.
 * Personal info and password are handled separately.
 *
 * TODO: Replace with real API calls:
 *   PUT  /api/users/me  { firstName, lastName, email, contact, department }
 *   POST /api/users/me/password { currentPw, newPw }
 */
function saveChanges() {
  const firstName  = document.getElementById("firstName").value.trim();
  const lastName   = document.getElementById("lastName").value.trim();
  const email      = document.getElementById("email").value.trim();
  const currentPw  = document.getElementById("currentPw").value;
  const newPw      = document.getElementById("newPw").value;
  const confirmPw  = document.getElementById("confirmPw").value;

  /* Validate required personal info fields */
  if (!firstName || !lastName) {
    toast("First and last name are required.", "error");
    return;
  }

  if (!email || !email.includes("@")) {
    toast("Please enter a valid email address.", "error");
    return;
  }

  /* Validate password change if any password field is filled */
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

  /* Update profile card display name */
  document.getElementById("profileName").textContent =
    `${firstName} ${lastName}`;
  document.getElementById("profileEmail").textContent = email;
  document.getElementById("avatarInitials").textContent =
    (firstName[0] + lastName[0]).toUpperCase();
  document.getElementById("avatarEl").textContent =
    (firstName[0] + lastName[0]).toUpperCase();

  /* Update session storage */
  sessionStorage.setItem("uid", `${firstName} ${lastName}`);

  /* Clear password fields after save */
  document.getElementById("currentPw").value = "";
  document.getElementById("newPw").value      = "";
  document.getElementById("confirmPw").value  = "";
  document.getElementById("pwFill").style.width = "0%";
  document.getElementById("pwLabel").textContent = "";

  toast("Profile updated successfully.", "success");
}

/* ── Cancel ───────────────────────────────────────────────────────────────── */

/**
 * Resets all form fields to their original values.
 * Does not make any API calls.
 */
function cancelChanges() {
  Object.entries(origValues).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  });

  /* Clear password fields */
  ["currentPw","newPw","confirmPw"].forEach(id => {
    document.getElementById(id).value = "";
  });

  document.getElementById("pwFill").style.width  = "0%";
  document.getElementById("pwLabel").textContent = "";

  toast("Changes cancelled.", "info");
}
