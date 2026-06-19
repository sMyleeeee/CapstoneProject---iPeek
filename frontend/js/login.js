/**
 * login.js
 * --------
 * Handles the login page:
 *  - Role tab switching (Student / Librarian / Admin)
 *  - Form validation
 *  - Redirects to the correct page after login
 *
 * TODO: Replace mock redirect with real POST /api/auth/login
 *       when the database is implemented.
 */

/* Currently selected role — updated when a tab is clicked */
let role = "student";

/**
 * Updates the active role tab and changes the ID field
 * label and placeholder to match the selected role.
 *
 * @param {string} r  - Role key: 'student' | 'librarian' | 'admin'
 * @param {HTMLElement} el - The tab button that was clicked
 */
function setRole(r, el) {
  role = r;

  /* Remove active class from all tabs, set on clicked tab */
  document.querySelectorAll(".role-tab").forEach(t => t.classList.remove("active"));
  el.classList.add("active");

  /* Update ID field label and placeholder per role */
  const map = {
    student:   { lbl: "Student ID / Username",  ph: "2021-10456"    },
    librarian: { lbl: "Employee ID / Username",  ph: "LIB-2019-0042" },
    admin:     { lbl: "Admin Username",          ph: "admin"          },
  };

  document.getElementById("idLbl").textContent  = map[r].lbl;
  document.getElementById("uid").placeholder     = map[r].ph;
}

/**
 * Validates credentials and redirects to the appropriate page.
 *
 * TODO: When DB is ready, replace this with:
 *   const res = await fetch('/api/auth/login', {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify({ uid, password, role })
 *   });
 *   const data = await res.json();
 *   if (!res.ok) { showErr(data.error); return; }
 *   sessionStorage.setItem('token', data.token);
 */
function login() {
  const uid = document.getElementById("uid").value.trim();
  const pwd = document.getElementById("pwd").value.trim();

  /* Basic client-side validation before any API call */
  if (!uid || !pwd) {
    showErr("Please enter your ID and password.");
    return;
  }

  /* Store session info so other pages know the current user */
  sessionStorage.setItem("role", role);
  sessionStorage.setItem("uid",  uid);

  /* Redirect based on role */
  const dest = {
    student:   "browse.html",
    librarian: "dashboard.html",
    admin:     "dashboard.html",
  };

  window.location.href = dest[role];
}

/**
 * Shows an error message inside the red error box.
 * @param {string} msg - Error text to display
 */
function showErr(msg) {
  const el = document.getElementById("err");
  el.textContent    = msg;
  el.style.display  = "block";
}
