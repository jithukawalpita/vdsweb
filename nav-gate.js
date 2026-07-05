/**
 * ═══════════════════════════════════════════════════════════════════
 * NAV-GATE.JS — shared role-based nav link visibility
 * ───────────────────────────────────────────────────────────────────
 * Drop this one file on ANY page that already loads Firebase + Auth +
 * Firestore (the same way Daily Attendance.html does), and any link
 * marked with data-role-gate will be hidden until a signed-in user's
 * Firestore role matches.
 *
 * USAGE (per page):
 *   1. Include this file after your Firebase SDK <script> tags:
 *        <script src="nav-gate.js"></script>
 *
 *   2. On any nav link you want gated, add data-role-gate + hide it
 *      by default:
 *        <a href="Daily Attendance.html"
 *           data-role-gate="student,teacher"
 *           style="display:none;">Daily Attendance</a>
 *
 *      data-role-gate accepts a comma-separated list of allowed
 *      roles, e.g. data-role-gate="teacher" for a teacher-only link,
 *      or data-role-gate="student,teacher" for either.
 *
 *   3. That's it — no other JS needed on that page. This file finds
 *      every [data-role-gate] element on the page itself, waits for
 *      Firebase to be ready, and keeps them in sync with auth state
 *      automatically (including live updates if the user signs out).
 *
 * If a page ALSO has its own onAuthStateChanged listener (like Daily
 * Attendance.html does, for updating the Login button text), that's
 * fine — Firebase supports multiple listeners. Optionally, call
 * window.applyRoleGatedNav_(user) from that listener too, so the nav
 * updates in the same tick rather than a moment later; this file's
 * own listener will still catch it either way.
 * ═══════════════════════════════════════════════════════════════════
 */
(function () {
  function getAuthApp() {
    if (!window.firebase || !firebase.apps || !firebase.apps.length) return null;
    const named = firebase.apps.find(a => a.name === 'authApp');
    if (named) return named;
    try { return firebase.app(); } catch (e) { return null; }
  }

  function getAuth() {
    const app = getAuthApp();
    return app ? app.auth() : null;
  }

  function getFirestore() {
    const app = getAuthApp();
    return app ? app.firestore() : null;
  }

  function applyRoleGatedNav_(user, role) {
    const gatedLinks = document.querySelectorAll('[data-role-gate]');
    gatedLinks.forEach(el => {
      const allowedRoles = el.getAttribute('data-role-gate')
        .split(',')
        .map(r => r.trim().toLowerCase())
        .filter(Boolean);
      const show = !!user && allowedRoles.includes((role || '').toLowerCase());
      el.style.display = show ? '' : 'none';
    });
  }

  window.applyRoleGatedNav_ = function (user) {
    if (!user) { applyRoleGatedNav_(null, null); return; }
    const firestore = getFirestore();
    if (!firestore) { applyRoleGatedNav_(user, ''); return; }
    firestore.collection('users').doc(user.uid).get()
      .then(snap => applyRoleGatedNav_(user, snap.exists ? snap.data().role : ''))
      .catch(() => applyRoleGatedNav_(user, ''));
  };

  function waitForFirebaseThenListen(attemptsLeft) {
    const auth = getAuth();
    if (!auth) {
      if (attemptsLeft > 0) { setTimeout(() => waitForFirebaseThenListen(attemptsLeft - 1), 300); }
      return;
    }
    auth.onAuthStateChanged(user => window.applyRoleGatedNav_(user));
  }
  waitForFirebaseThenListen(60);
})();
