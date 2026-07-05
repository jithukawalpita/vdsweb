/* ═══════════════════════════════════════════════════════════════════
   Sri Vipassi Dhamma School — Auth System
   ───────────────────────────────────────────────────────────────────
   Drop-in script for the new auth modal.
   Depends on:
     • Firebase compat SDKs (already loaded in About.html)
     • face-utils.js (must be loaded BEFORE this file)

   IMPORTANT — replace APPS_SCRIPT_URL below with YOUR new deployment.
   ═══════════════════════════════════════════════════════════════════ */

/* ═══ CONFIG — set this to your Apps Script Web App URL ═══ */
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbweXkIy9S1M39mJcrA7Lr-B2L6MMBTYIzrVAIug63GLMk4EkWj8HI813xake9pf8DCy/exec';
const PASSWORD_RESET_PAGE = (window.location.protocol === 'http:' || window.location.protocol === 'https:')
  ? window.location.origin + '/reset-password.html'
  : 'https://signin-f9656.firebaseapp.com/reset-password.html';
const PASSWORD_RESET_ACTION_CODE_SETTINGS = {
  url: PASSWORD_RESET_PAGE,
  handleCodeInApp: true
};

/* ═══ School registration code — required to sign up as student or teacher.
       Change this to a different value if students/teachers learn the current one.
       Note: this is client-side, so anyone with browser dev tools can see it.
       For a school context that's acceptable; for higher security, validate
       it on the Apps Script side instead. ═══ */
const SCHOOL_REGISTRATION_CODE = 'vipassi_@';

/* ═══ Firebase init (only if not already initialized) ═══ */
if (!firebase.apps.find(a => a.name === 'authApp')) {
  firebase.initializeApp({
    apiKey:            "AIzaSyAWpPP3OevjIRAsoGIjOJTofV6l2jgyhNI",
    authDomain:        "signin-f9656.firebaseapp.com",
    projectId:         "signin-f9656",
    storageBucket:     "signin-f9656.firebasestorage.app",
    messagingSenderId: "1074665165821",
    appId:             "1:1074665165821:web:91ef3290a0472fa138e7f94"
  }, 'authApp');
}
const authApp = firebase.app('authApp');
const auth = authApp.auth();
const authDb   = authApp.firestore();
const googleProvider = new firebase.auth.GoogleAuthProvider();
googleProvider.addScope('email');
googleProvider.addScope('profile');


/* ═══════════════════════════════════════════════════════════════════
   Drive URL helper — converts ANY Drive URL format to the reliable
   thumbnail format that always embeds in <img> tags without issues.
   ═══════════════════════════════════════════════════════════════════ */
function thumbUrl(url, size) {
  if (!url) return '';
  size = size || 400;
  // Extract file ID from any common Drive URL format
  let match = url.match(/[?&]id=([^&]+)/);
  if (!match) match = url.match(/\/d\/([^/]+)/);
  if (match) return 'https://drive.google.com/thumbnail?id=' + match[1] + '&sz=w' + size;
  return url; // not a Drive URL — return as-is
}

/* ═══════════════════════════════════════════════════════════════════
   Apps Script email check — returns 'student', 'teacher', or null.
   Used to BLOCK guest signup or Google sign-in for emails already in
   use by a school account. Returns null on network error (fail open).
   ═══════════════════════════════════════════════════════════════════ */
async function checkEmailRole(email) {
  if (!email) return null;
  try {
    const url = APPS_SCRIPT_URL + '?action=check_email&email=' + encodeURIComponent(email.trim().toLowerCase());
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    return json.role || null;
  } catch (e) {
    console.warn('checkEmailRole network error:', e);
    return null;
  }
}


/* ═══════════════════════════════════════════════════════════════════
   MODAL OPEN / CLOSE / TAB SWITCHING
   ═══════════════════════════════════════════════════════════════════ */
function openAuth(tab) {
  document.getElementById("authOverlay").classList.add("open");

  // 1. Full Firebase auth → show profile panel directly
  if (auth.currentUser) { showPan("panLI"); return; }

  // 2. Face-only session → show profile panel with limited capabilities
  const faceUser = localStorage.getItem('svFaceUser');
  if (faceUser) {
    try {
      const fu = JSON.parse(faceUser);
      if (Date.now() - fu.signedInAt < 8 * 3600 * 1000) {
        const lgName  = document.getElementById('lgName');
        const lgEmail = document.getElementById('lgEmail');
        const lgRole  = document.getElementById('lgRole');
        const lgAv    = document.getElementById('lgAvatar');
        const lgEdit  = document.getElementById('lgEditBtn');
        const lgScan  = document.getElementById('lgScannerBtn');
        if (lgName)  lgName.textContent  = 'Welcome, ' + fu.name;
        if (lgEmail) lgEmail.textContent = fu.email || 'Signed in via face';
        if (lgRole)  lgRole.textContent  = (fu.role === 'teacher' ? 'Teacher' :
                                           fu.role === 'student' ? 'Student · Grade ' + (fu.grade || '?') :
                                           'Member') + ' · Face Sign-In';
        if (lgAv) {
          lgAv.innerHTML = fu.photoURL
            ? `<img src="${thumbUrl(fu.photoURL)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover" alt="">`
            : fu.name.charAt(0).toUpperCase();
        }
        // Edit button is visible for face users too — clicking it prompts
        // them to sign in with name+password (since Firestore writes require
        // proper Firebase Auth).
        if (lgEdit)  lgEdit.style.display = 'block';
        // Scanner button ONLY for teachers — defensive role check (handles
        // capitalization / whitespace differences just in case)
        const faceIsTeacher = !!(fu.role && fu.role.toString().toLowerCase().trim() === 'teacher');
        if (lgScan)  lgScan.style.display = faceIsTeacher ? 'block' : 'none';
        showPan('panLI');
        return;
      }
    } catch (e) {}
  }

  // 3. Not signed in at all → show sign-in tab
  switchTab(tab || "si");
}

function closeAuth() {
  document.getElementById("authOverlay").classList.remove("open");
  // Make sure cameras are off when modal closes
  ['stVideo','tcVideo','fcVideo','ruVideo'].forEach(id => {
    const v = document.getElementById(id);
    if (v) SVFace.stopCamera(v);
  });
  clearErrs();
}

function overlayClick(e) {
  if (e.target === document.getElementById("authOverlay")) closeAuth();
}

function switchTab(t) {
  document.getElementById("tabSI").classList.toggle("on", t === "si");
  document.getElementById("tabSU").classList.toggle("on", t === "su");
  document.getElementById("tabFC").classList.toggle("on", t === "fc");
  if (t === "si") { showPan("panSI"); }
  else if (t === "su") { showPan("panSU"); resetSignUpToRolePick(); }
  else if (t === "fc") { showPan("panFC"); }
}

function showPan(id) {
  ["panSI","panSU","panFC","panLI","panRU","panAL","panED","panMG"].forEach(p => {
    const el = document.getElementById(p);
    if (el) el.style.display = (p === id ? "block" : "none");
  });
  // Hide the Sign-In / Sign-Up / Face Sign-In tab bar whenever the user
  // is in a logged-in / post-auth / focused-flow panel
  const tabs = document.querySelector('.am-tabs');
  if (tabs) {
    const loggedInPanels = ["panLI","panRU","panAL","panED","panMG"];
    tabs.style.display = (loggedInPanels.indexOf(id) >= 0) ? "none" : "flex";
  }
}

function openAuthFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const authTab = params.get('openAuth') || params.get('auth');
    if (!authTab) return;
    params.delete('openAuth');
    params.delete('auth');
    const newSearch = params.toString();
    history.replaceState({}, document.title, window.location.pathname + (newSearch ? '?' + newSearch : '') + window.location.hash);
    openAuth(authTab);
  } catch (e) {
    console.warn('openAuthFromUrl failed:', e);
  }
}
window.addEventListener('load', openAuthFromUrl);

function clearErrs() {
  ["siErr","siNmErr","stErr","tcErr","nmErr","fcErr","ruErr","edErr","mgErr"].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = ""; el.className = "am-err"; }
  });
}
function errMsg(id, m) { const el = document.getElementById(id); if (el) { el.textContent = m; el.className = "am-err"; } }
function okMsg (id, m) { const el = document.getElementById(id); if (el) { el.textContent = m; el.className = "am-err am-ok"; } }


/* ═══════════════════════════════════════════════════════════════════
   ROLE PICKER FLOW
   ═══════════════════════════════════════════════════════════════════ */
function resetSignUpToRolePick() {
  document.getElementById("suStep1").style.display    = "block";
  document.getElementById("suStudent").style.display  = "none";
  document.getElementById("suTeacher").style.display  = "none";
  const nm = document.getElementById("suNormal");
  if (nm) nm.style.display = "none";
}

function pickRole(role) {
  document.getElementById("suStep1").style.display = "none";
  if (role === 'student')      document.getElementById("suStudent").style.display = "block";
  else if (role === 'teacher') document.getElementById("suTeacher").style.display = "block";
  else if (role === 'normal')  document.getElementById("suNormal").style.display = "block";
}

function backToRolePick() {
  // Stop any cameras
  ['stVideo','tcVideo'].forEach(id => SVFace.stopCamera(document.getElementById(id)));
  capturedFace.student = null;
  capturedFace.teacher = null;
  resetSignUpToRolePick();
}


/* ═══════════════════════════════════════════════════════════════════
   FACE CAPTURE DURING SIGN-UP
   ═══════════════════════════════════════════════════════════════════ */
const capturedFace = { student: null, teacher: null }; // { jpeg, descriptor }

async function startFaceCapture(kind) {
  const prefix = kind === 'student' ? 'st' : 'tc';
  const video   = document.getElementById(prefix + 'Video');
  const stage   = document.getElementById(prefix + 'FaceStage');
  const preview = document.getElementById(prefix + 'Preview');
  const camBtn  = document.getElementById(prefix + 'CamBtn');
  const snap    = document.getElementById(prefix + 'SnapBtn');
  const retake  = document.getElementById(prefix + 'RetakeBtn');
  const hint    = document.getElementById(prefix + 'FaceHint');

  try {
    hint.textContent = 'Loading face recognition models…';
    await SVFace.loadModels();
    hint.textContent = 'Starting camera…';
    await SVFace.startCamera(video);
    video.classList.add('live');
    preview.classList.remove('preview');
    preview.src = '';
    stage.classList.add('has-content');
    camBtn.style.display   = 'none';
    snap.disabled          = false;
    retake.style.display   = 'none';
    hint.textContent = 'Look straight at the camera. Click "Capture" when ready.';
  } catch (e) {
    hint.textContent = '⚠ Camera unavailable: ' + e.message;
  }
}

async function snapFace(kind) {
  const prefix = kind === 'student' ? 'st' : 'tc';
  const video   = document.getElementById(prefix + 'Video');
  const preview = document.getElementById(prefix + 'Preview');
  const snap    = document.getElementById(prefix + 'SnapBtn');
  const retake  = document.getElementById(prefix + 'RetakeBtn');
  const hint    = document.getElementById(prefix + 'FaceHint');

  hint.textContent = 'Hold still — taking 3 samples for accuracy…';
  snap.disabled = true;

  // Multi-sample descriptor for robust registration
  const descriptor = await SVFace.computeRobustDescriptor(video, 3);
  if (!descriptor) {
    hint.textContent = '⚠ No face detected — try again with better lighting and a clear front-facing view.';
    snap.disabled = false;
    return;
  }

  // Capture jpeg, then stop camera & show preview
  const jpeg = SVFace.captureJpeg(video, 0.85);
  SVFace.stopCamera(video);
  video.classList.remove('live');
  preview.src = jpeg;
  preview.classList.add('preview');
  snap.style.display   = 'none';
  retake.style.display = 'inline-block';
  hint.textContent     = '✓ Face captured (3-sample average). You can retake if needed.';

  capturedFace[kind] = {
    jpeg: jpeg,
    descriptor: SVFace.descriptorToArray(descriptor)
  };
}

function retakeFace(kind) {
  const prefix = kind === 'student' ? 'st' : 'tc';
  const preview = document.getElementById(prefix + 'Preview');
  const snap    = document.getElementById(prefix + 'SnapBtn');
  const retake  = document.getElementById(prefix + 'RetakeBtn');
  preview.classList.remove('preview');
  preview.src = '';
  snap.style.display = 'inline-block';
  retake.style.display = 'none';
  capturedFace[kind] = null;
  startFaceCapture(kind);
}


/* ═══════════════════════════════════════════════════════════════════
   FIREBASE ERROR MESSAGES
   ═══════════════════════════════════════════════════════════════════ */
function fErr(c) {
  return ({
    "auth/user-not-found":     "No account found with that email.",
    "auth/wrong-password":     "Incorrect password.",
    "auth/invalid-credential": "Invalid email or password.",
    "auth/email-already-in-use":"⚠ This email is already registered. Sign in with your password instead, or use a different email.",
    "auth/invalid-email":      "Please enter a valid email.",
    "auth/weak-password":      "Password must be at least 6 characters.",
    "auth/popup-closed-by-user":"Sign-in popup was closed.",
    "auth/popup-blocked":      "Popup was blocked — please allow popups.",
    "auth/network-request-failed":"Network error. Check your connection.",
    "auth/too-many-requests":  "Too many attempts — try again later.",
    "auth/unauthorized-domain":"This domain is not authorized.",
    "auth/operation-not-supported-in-this-environment":"Please open via a web server."
  })[c] || ("Something went wrong. (" + c + ")");
}


/* ═══════════════════════════════════════════════════════════════════
   STANDARD EMAIL / PASSWORD SIGN-IN
   ═══════════════════════════════════════════════════════════════════ */
async function doSignIn() {
  const email = document.getElementById("siEmail").value.trim();
  const pass  = document.getElementById("siPass").value;
  if (!email || !pass) return errMsg("siErr", "Please fill in all fields.");
  const btn = document.getElementById("siBtn");
  btn.disabled = true; btn.classList.add('loading');
  try {
    // Pre-check: refuse to use guest sign-in if this email is registered as
    // student or teacher in Apps Script.
    const preRole = await checkEmailRole(email);
    if (preRole === 'student' || preRole === 'teacher') {
      errMsg("siErr",
        '⚠ This is a ' + preRole + ' account. Please use the Student / Teacher Sign-In section above (sign in by name + password).');
      btn.disabled = false; btn.classList.remove('loading');
      return;
    }

    const result = await auth.signInWithEmailAndPassword(email, pass);

    // Belt-and-braces: also check the resolved Firebase Auth account's role
    try {
      const snap = await authDb.collection('users').doc(result.user.uid).get();
      if (snap.exists) {
        const role = snap.data().role;
        if (role === 'student' || role === 'teacher') {
          await auth.signOut();
          errMsg("siErr",
            '⚠ This is a ' + role + ' account. Please use the Student / Teacher Sign-In section above (sign in by name + password).');
          return;
        }
      }
    } catch (lookupErr) {
      console.warn('Role check failed:', lookupErr);
    }

    showPan("panLI");
    setTimeout(closeAuth, 1400);
  } catch (e) {
    errMsg("siErr", fErr(e.code));
  } finally {
    btn.disabled = false; btn.classList.remove('loading');
  }
}

async function doGoogle() {
  try {
    const result = await auth.signInWithPopup(googleProvider);

    // Check if this account is registered as a student or teacher.
    // We check BOTH sources for redundancy:
    //   1. Apps Script EMAIL_<email> → role  (works even if Firestore is unreachable)
    //   2. Firestore users/{uid}.role        (catches edge cases & stale Apps Script data)
    try {
      // (1) Apps Script email lookup
      const ascRole = await checkEmailRole(result.user.email);
      if (ascRole === 'student' || ascRole === 'teacher') {
        await auth.signOut();
        const activeErr = document.getElementById("panSU").style.display === "block" ? "stErr" : "siErr";
        errMsg(activeErr,
          '⚠ Google sign-in is for guests/visitors only. This email is registered as a ' + ascRole +
          '. Please sign in with your ' +
          (ascRole === 'student' ? 'admission number' : 'email') +
          ' and password using the section above.');
        return;
      }

      // (2) Firestore role lookup
      const snap = await authDb.collection('users').doc(result.user.uid).get();
      if (snap.exists) {
        const role = snap.data().role;
        if (role === 'student' || role === 'teacher') {
          await auth.signOut();
          const activeErr = document.getElementById("panSU").style.display === "block" ? "stErr" : "siErr";
          errMsg(activeErr,
            '⚠ Google sign-in is for guests/visitors only. Your account is registered as a ' + role +
            '. Please sign in with your ' +
            (role === 'student' ? 'admission number' : 'email') +
            ' and password using the section above.');
          return;
        }
      }
    } catch (lookupErr) {
      console.warn('Role check failed:', lookupErr);
    }

    await saveBasicUser(result.user);
    showPan("panLI");
    setTimeout(closeAuth, 1400);
  } catch (e) {
    const activeErr = document.getElementById("panSU").style.display === "block" ? "stErr" : "siErr";
    errMsg(activeErr, fErr(e.code));
  }
}

async function doSignOut() {
  // Check the user's role BEFORE signing out — we want to reload the page
  // for students & teachers so their attendance UI fully resets.
  let shouldReload = false;
  try {
    if (auth.currentUser) {
      const snap = await authDb.collection('users').doc(auth.currentUser.uid).get();
      if (snap.exists) {
        const role = snap.data().role;
        if (role === 'student' || role === 'teacher') shouldReload = true;
      }
    } else {
      // Face-only session — check the role from localStorage too
      const fu = JSON.parse(localStorage.getItem('svFaceUser') || '{}');
      if (fu.role === 'student' || fu.role === 'teacher') shouldReload = true;
    }
  } catch (e) {}

  try { await auth.signOut(); } catch (e) {}
  // Clear any face-login session
  localStorage.removeItem('svFaceUser');
  localStorage.removeItem('svLastPromotion');
  sessionStorage.clear();
  syncLoginButtons('Login', false);
  showPan("panSI");
  closeAuth();

  // Auto-refresh for student/teacher so the UI fully resets
  if (shouldReload) {
    setTimeout(() => window.location.reload(), 200);
  }
}

async function forgotPw() {
  const email = document.getElementById("siEmail").value.trim();
  if (!email) return errMsg("siErr", "Enter your email above first.");
  try {
    await auth.sendPasswordResetEmail(email, PASSWORD_RESET_ACTION_CODE_SETTINGS);
    okMsg("siErr", "Password reset email sent to " + email + ". Check your inbox or spam folder.");
  } catch (e) {
    errMsg("siErr", fErr(e.code) || e.message || 'Could not send reset email.');
  }
}

// For Student/Teacher Sign-In: looks up email from the name field, then
// sends a Firebase password reset email to that address.
async function forgotPwForName() {
  const nameFrag = document.getElementById('siNm').value.trim();
  if (!nameFrag)            return errMsg('siNmErr', 'Type your name above first, then click Forgot password.');
  if (nameFrag.length < 2)  return errMsg('siNmErr', 'Type at least 2 letters of your name first.');

  errMsg('siNmErr', '');
  try {
    // Same lookup flow as doSchoolSignIn — Apps Script + Firestore validation
    const res = await fetch(APPS_SCRIPT_URL + '?action=lookup_name&name=' + encodeURIComponent(nameFrag));
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    if (!data.matches || data.matches.length === 0) {
      throw new Error('No account found with name containing "' + nameFrag + '".');
    }

    const validEmails = [];
    for (let i = 0; i < data.matches.length; i++) {
      const m = data.matches[i];
      if (!m.uid) continue;
      try {
        const snap = await authDb.collection('users').doc(m.uid).get();
        if (snap.exists) {
          const fd = snap.data();
          const em = fd.email || m.email;
          if (em) validEmails.push(em);
        }
      } catch (e) {}
    }
    if (validEmails.length === 0) throw new Error('No account found with that name.');
    if (validEmails.length > 1)  throw new Error('Multiple accounts match — type more of your name first.');

    await auth.sendPasswordResetEmail(validEmails[0], PASSWORD_RESET_ACTION_CODE_SETTINGS);
    okMsg('siNmErr', '✓ Password reset email sent to ' + validEmails[0].replace(/(.).+(@.+)/, '$1***$2') + '. Check your inbox or spam folder.');
  } catch (e) {
    const msg = e.code ? fErr(e.code) : (e.message || 'Could not send reset email.');
    errMsg('siNmErr', msg);
  }
}

async function saveBasicUser(user) {
  // Used only for Google sign-in or fallback — full role data is added by signup forms
  try {
    const ref = authDb.collection("users").doc(user.uid);
    const snap = await ref.get();
    if (!snap.exists) {
      await ref.set({
        uid: user.uid,
        email: user.email || "",
        displayName: user.displayName || "",
        photoURL: user.photoURL || "",
        role: "unknown",
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
  } catch (e) { console.warn("Firestore:", e.message); }
}


/* ═══════════════════════════════════════════════════════════════════
   STUDENT SIGN-UP
   ═══════════════════════════════════════════════════════════════════ */
async function doSignUpStudent() {
  // ── Registration code check (FIRST — before any other work) ──
  const regCode = document.getElementById('stRegCode').value;
  if (regCode !== SCHOOL_REGISTRATION_CODE) {
    return errMsg('stErr', '⚠ Invalid school registration code. Contact the school office to get the code.');
  }

  const get = id => document.getElementById(id).value.trim();
  const data = {
    name:        get('stName'),
    email:       get('stEmail'),
    password:    document.getElementById('stPass').value,
    admission:   get('stAdmission'),
    contact:     get('stContact'),
    grade:       get('stGrade'),
    dob:         get('stDOB'),
    guardName:   get('stGuardName'),
    guardPhone:  get('stGuardPhone'),
    guardEmail:  get('stGuardEmail'),
    address:     get('stAddress')
  };

  // Required fields
  const required = ['name','email','password','admission','contact','grade','dob','guardName','guardPhone','address'];
  for (const f of required) {
    if (!data[f]) return errMsg('stErr', 'Please fill in all required fields (*).');
  }
  if (data.password.length < 6) return errMsg('stErr', 'Password must be at least 6 characters.');
  if (!capturedFace.student) return errMsg('stErr', 'Please capture a face photo to enable face sign-in.');

  const btn = document.getElementById('stBtn');
  btn.disabled = true; btn.classList.add('loading');
  errMsg('stErr', '');

  try {
    // 1. Firebase Auth account
    const cred = await auth.createUserWithEmailAndPassword(data.email, data.password);
    await cred.user.updateProfile({ displayName: data.name });
    const uid = cred.user.uid;

    // 2. Save to Firestore
    // Fetch the current promotion year FIRST so this new student isn't
    // immediately "promoted" by checkAndPromoteStudent on first login.
    // Without this, the user looks like they've missed every promotion
    // since year 0 → produces wrong/negative passedBatchYear values
    // (the "Class of -1" bug).
    let currentPromoYear = new Date().getFullYear();
    try {
      const pyRes = await fetch(APPS_SCRIPT_URL + '?action=last_promotion');
      const pyJson = await pyRes.json();
      if (pyJson.year) currentPromoYear = pyJson.year;
    } catch (e) {
      console.warn('Could not fetch last_promotion, using calendar year:', e);
    }

    await authDb.collection('users').doc(uid).set({
      uid, role: 'student',
      displayName:  data.name,
      email:        data.email,
      admissionNo:  data.admission,
      contactNo:    data.contact,
      grade:        parseInt(data.grade, 10),
      dob:          data.dob,
      guardianName: data.guardName,
      guardianPhone:data.guardPhone,
      guardianEmail:data.guardEmail || '',
      homeAddress:  data.address,
      faceDescriptor: capturedFace.student.descriptor,
      hasFace:      true,
      lastPromotionYear: currentPromoYear,
      createdAt:    firebase.firestore.FieldValue.serverTimestamp()
    });
    // 3. Send to Apps Script — upload photo + add row to grade sheet
    okMsg('stErr', 'Account created. Uploading photo & registering on attendance sheet…');
    let ascJson;
    try {
      const ascRes = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify({
          action:    'register_student',
          uid:       uid,
          name:      data.name,
          email:     data.email,
          admission: data.admission,
          grade:     data.grade,
          photoBase64: capturedFace.student.jpeg,
          descriptor:  capturedFace.student.descriptor
        })
      });
      if (!ascRes.ok) throw new Error('HTTP ' + ascRes.status);
      ascJson = await ascRes.json();
      if (ascJson.error) throw new Error(ascJson.error);
      if (!ascJson.photoUrl) throw new Error('No photo URL returned from Apps Script');
    } catch (e) {
      errMsg('stErr',
        '⚠ Account created but face-photo upload FAILED: ' + e.message +
        '. Sign in with email/password, then use Edit Profile → Re-register Face Photo to fix this.');
      btn.disabled = false; btn.classList.remove('loading');
      return;
    }
    await authDb.collection('users').doc(uid).update({ photoURL: ascJson.photoUrl });

    okMsg('stErr', '✓ Welcome to Sri Vipassi Dhamma School!');

    // ─ INSTANT login-button update + panLI population ─
    syncLoginButtons(data.name.split(/\s+/)[0], true);
    const lgName  = document.getElementById('lgName');
    const lgEmail = document.getElementById('lgEmail');
    const lgRole  = document.getElementById('lgRole');
    if (lgName)  lgName.textContent  = 'Welcome, ' + data.name;
    if (lgEmail) lgEmail.textContent = data.email;
    if (lgRole)  lgRole.textContent  = 'Student · Grade ' + data.grade;

    setTimeout(() => { showPan("panLI"); setTimeout(closeAuth, 1400); }, 1100);
  } catch (e) {
    errMsg('stErr', e.code ? fErr(e.code) : (e.message || 'Sign-up failed.'));
  } finally {
    btn.disabled = false; btn.classList.remove('loading');
  }
}


/* ═══════════════════════════════════════════════════════════════════
   TEACHER SIGN-UP
   ═══════════════════════════════════════════════════════════════════ */
async function doSignUpTeacher() {
  // ── Registration code check (FIRST — before any other work) ──
  const regCode = document.getElementById('tcRegCode').value;
  if (regCode !== SCHOOL_REGISTRATION_CODE) {
    return errMsg('tcErr', '⚠ Invalid school registration code. Contact the school office to get the code.');
  }

  const get = id => document.getElementById(id).value.trim();
  const data = {
    name:      get('tcName'),
    email:     get('tcEmail'),
    password:  document.getElementById('tcPass').value,
    phone:     get('tcPhone'),
    contact:   get('tcContact'),
    address:   get('tcAddress'),
    grade:     get('tcGrade'),
    subject:   get('tcSubject'),
    medium:    get('tcMedium'),
    dob:       get('tcDOB'),
    gender:    get('tcGender'),
    joinDate:  get('tcJoinDate')
  };

  const required = ['name','email','password','phone','contact','address','grade','subject','medium','dob','gender','joinDate'];
  for (const f of required) {
    if (!data[f]) return errMsg('tcErr', 'Please fill in all required fields (*).');
  }
  if (data.password.length < 6) return errMsg('tcErr', 'Password must be at least 6 characters.');
  if (!capturedFace.teacher) return errMsg('tcErr', 'Please capture a face photo to enable face sign-in.');

  const btn = document.getElementById('tcBtn');
  btn.disabled = true; btn.classList.add('loading');
  errMsg('tcErr', '');

  try {
    const cred = await auth.createUserWithEmailAndPassword(data.email, data.password);
    await cred.user.updateProfile({ displayName: data.name });
    const uid = cred.user.uid;

    await authDb.collection('users').doc(uid).set({
      uid, role: 'teacher',
      displayName:    data.name,
      email:          data.email,
      phoneNo:        data.phone,
      contactNo:      data.contact,
      homeAddress:    data.address,
      teachingGrade:  data.grade,
      subject:        data.subject,
      medium:         data.medium,
      dob:            data.dob,
      gender:         data.gender,
      joiningDate:    data.joinDate,
      faceDescriptor: capturedFace.teacher.descriptor,
      hasFace:        true,
      createdAt:      firebase.firestore.FieldValue.serverTimestamp()
    });

    okMsg('tcErr', 'Account created. Uploading photo & registering on teachers sheet…');
    let ascJson;
    try {
      const ascRes = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify({
          action: 'register_teacher',
          uid:    uid,
          name:   data.name,
          photoBase64: capturedFace.teacher.jpeg,
          descriptor:  capturedFace.teacher.descriptor
        })
      });
      if (!ascRes.ok) throw new Error('HTTP ' + ascRes.status);
      ascJson = await ascRes.json();
      if (ascJson.error) throw new Error(ascJson.error);
      if (!ascJson.photoUrl) throw new Error('No photo URL returned from Apps Script');
    } catch (e) {
      errMsg('tcErr',
        '⚠ Account created but face-photo upload FAILED: ' + e.message +
        '. Sign in with email/password, then use Edit Profile → Re-register Face Photo to fix this.');
      btn.disabled = false; btn.classList.remove('loading');
      return;
    }
    await authDb.collection('users').doc(uid).update({ photoURL: ascJson.photoUrl });

    okMsg('tcErr', '✓ Welcome — your teacher account is ready.');

    // ─ INSTANT login-button update + panLI population ─
    syncLoginButtons(data.name.split(/\s+/)[0], true);
    const lgName  = document.getElementById('lgName');
    const lgEmail = document.getElementById('lgEmail');
    const lgRole  = document.getElementById('lgRole');
    if (lgName)  lgName.textContent  = 'Welcome, ' + data.name;
    if (lgEmail) lgEmail.textContent = data.email;
    if (lgRole)  lgRole.textContent  = 'Teacher';

    setTimeout(() => { showPan("panLI"); setTimeout(closeAuth, 1400); }, 1100);
  } catch (e) {
    errMsg('tcErr', e.code ? fErr(e.code) : (e.message || 'Sign-up failed.'));
  } finally {
    btn.disabled = false; btn.classList.remove('loading');
  }
}


/* ═══════════════════════════════════════════════════════════════════
   FACE-BASED SIGN IN
   ═══════════════════════════════════════════════════════════════════ */
let fcStream = null;

async function startFaceLogin() {
  const video   = document.getElementById('fcVideo');
  const stage   = document.getElementById('fcStage');
  const camBtn  = document.getElementById('fcCamBtn');
  const scanBtn = document.getElementById('fcScanBtn');
  const hint    = document.getElementById('fcHint');

  errMsg('fcErr', '');
  try {
    hint.textContent = 'Loading face models…';
    await SVFace.loadModels();
    hint.textContent = 'Starting camera…';
    await SVFace.startCamera(video);
    video.classList.add('live');
    stage.classList.add('has-content');
    camBtn.style.display = 'none';
    scanBtn.disabled = false;
    hint.textContent = 'Look at the camera and click "Scan & Sign In".';
  } catch (e) {
    errMsg('fcErr', 'Camera unavailable: ' + e.message);
  }
}

async function scanFaceLogin() {
  const video   = document.getElementById('fcVideo');
  const scanBtn = document.getElementById('fcScanBtn');
  const hint    = document.getElementById('fcHint');

  scanBtn.disabled = true;
  errMsg('fcErr', '');
  hint.textContent = 'Loading registered faces…';

  // ── 1. Pull all face descriptors from Apps Script (NOT Firestore) ──
  //    Firestore requires sign-in to read, but we're trying to sign in
  //    here — so we use the public Apps Script endpoint instead.
  let faces = [];
  try {
    const res = await fetch(APPS_SCRIPT_URL + '?action=descriptors');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    if (!json.faces) throw new Error('Bad response from server');

    faces = json.faces.filter(f =>
      f.descriptor && Array.isArray(f.descriptor) && f.descriptor.length === 128
    );

    if (!faces.length) {
      hint.textContent = '';
      errMsg('fcErr', '⚠ No registered faces found. Sign up with a photo first.');
      scanBtn.disabled = false;
      return;
    }
  } catch (e) {
    hint.textContent = '';
    errMsg('fcErr', '⚠ Could not load registered faces: ' + e.message + '. Check the Apps Script URL & redeploy.');
    scanBtn.disabled = false;
    return;
  }

  hint.textContent = '✓ Loaded ' + faces.length + ' registered face(s). Scanning…';

  // ── 2. Continuous scan loop — up to 10 attempts (~6 seconds) ──
  const MAX_ATTEMPTS = 10;
  let bestEverDist = Infinity;
  let bestEverFace = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    hint.textContent = 'Looking for your face… (' + attempt + '/' + MAX_ATTEMPTS + ')';

    let desc = null;
    try {
      // 2-sample average — faster than 3, still much better than 1
      desc = await SVFace.computeRobustDescriptor(video, 2);
    } catch (e) {
      console.warn('Descriptor error on attempt', attempt, e);
    }

    if (!desc) {
      hint.textContent = 'No face visible — attempt ' + attempt + '/' + MAX_ATTEMPTS;
      await new Promise(r => setTimeout(r, 300));
      continue;
    }

    const result = SVFace.matchFace(desc, faces);

    if (result.distance < bestEverDist) {
      bestEverDist = result.distance;
      bestEverFace = result.closest;
    }

    // Match found → sign in
    if (result.match) {
      hint.textContent = '✓ Recognized as ' + result.match.name +
                         ' (distance ' + result.distance.toFixed(2) + ')';
      SVFace.stopCamera(video);

      // Refresh role/grade/email from Firestore — it's the canonical source
      // of truth, and may have more up-to-date info than Apps Script DESC_
      // (e.g. for old accounts where DESC_ was created before role tracking).
      let role     = result.match.role;
      let grade    = result.match.grade;
      let email    = result.match.email || '';
      let displayName = result.match.name;
      try {
        const snap = await authDb.collection('users').doc(result.match.uid).get();
        if (snap.exists) {
          const fd = snap.data();
          if (fd.role)         role  = fd.role;
          if (fd.grade != null) grade = fd.grade;
          if (fd.email)        email = fd.email;
          if (fd.displayName)  displayName = fd.displayName;
          hint.textContent += ' · role: ' + role;
        }
      } catch (e) {
        console.warn('Firestore role lookup failed; using Apps Script values:', e);
      }

      localStorage.setItem('svFaceUser', JSON.stringify({
        uid:      result.match.uid,
        name:     displayName,
        role:     role,
        grade:    grade,
        email:    email,
        photoURL: result.match.photoURL || '',
        signedInAt: Date.now()
      }));

      syncLoginButtons(displayName.split(/\s+/)[0], true);
      setTimeout(closeAuth, 1200);
      return;
    }

    // Show live progress
    if (result.closest) {
      hint.textContent = 'Closest match: ' + result.closest.name +
                         ' · distance ' + result.distance.toFixed(2) +
                         ' (need ≤ ' + SVFace.MATCH_THRESHOLD.toFixed(2) + ')';
    }
    await new Promise(r => setTimeout(r, 200));
  }

  // ── 3. All attempts exhausted ──
  let msg = '⚠ Could not recognize you after ' + MAX_ATTEMPTS + ' tries. ';
  if (bestEverFace && bestEverDist < 0.85) {
    msg += 'Closest match was ' + bestEverFace.name +
           ' at distance ' + bestEverDist.toFixed(2) +
           ' (need ≤ ' + SVFace.MATCH_THRESHOLD.toFixed(2) + ').';
  } else {
    msg += 'No close matches found.';
  }
  errMsg('fcErr', msg);
  hint.textContent = 'Tip: better lighting, look straight at the camera, or re-register your photo.';
  scanBtn.disabled = false;
}


/* ═══════════════════════════════════════════════════════════════════
   AUTH STATE LISTENER — keeps login button in sync
   ═══════════════════════════════════════════════════════════════════ */
function syncLoginButtons(text, loggedIn) {
  ['loginBtn', 'mobileLoginBtn'].forEach(id => {
    const b = document.getElementById(id);
    if (!b) return;
    b.textContent = text;
    if (loggedIn) b.classList.add('logged-in');
    else          b.classList.remove('logged-in');
  });
}

auth.onAuthStateChanged(async u => {
  if (u) {
    // Look up role + full user data from Firestore
    let role = 'unknown', grade = null, userData = null;
    try {
      const snap = await authDb.collection('users').doc(u.uid).get();
      if (snap.exists) {
        userData = snap.data();
        role  = userData.role  || role;
        grade = userData.grade || userData.teachingGrade || null;
      }
    } catch (e) {}

    const first = (u.displayName || u.email || "User").split(/[ @]/)[0];
    syncLoginButtons(first, true);

    // Use the Drive photo we stored in Firestore (Firebase Auth's u.photoURL
    // is usually empty for email/password users).
    const photoUrl = (userData && userData.photoURL) || u.photoURL || '';
    const av = document.getElementById("lgAvatar");
    if (av) av.innerHTML = photoUrl
      ? `<img src="${thumbUrl(photoUrl)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover" alt="">`
      : first.charAt(0).toUpperCase();

    const lgName  = document.getElementById("lgName");
    const lgEmail = document.getElementById("lgEmail");
    const lgRole  = document.getElementById("lgRole");
    const lgScan  = document.getElementById("lgScannerBtn");
    const lgEdit  = document.getElementById("lgEditBtn");
    if (lgName)  lgName.textContent  = "Welcome, " + (u.displayName || u.email);
    if (lgEmail) lgEmail.textContent = u.email || "";
    if (lgRole)  lgRole.textContent  = role === 'teacher' ? 'Teacher' :
                                       role === 'alumni'  ? 'Alumni · Class of ' + (userData && userData.passedBatchYear || '?') :
                                       role === 'student' ? 'Student · Grade ' + (grade || '?') :
                                       'Member';
    if (lgScan)  lgScan.style.display = (role && role.toString().toLowerCase().trim() === 'teacher') ? 'block' : 'none';
    // Edit button is always visible when fully signed in via Firebase Auth
    if (lgEdit)  lgEdit.style.display = 'block';

    // ─── ANNUAL PROMOTION CHECK ─────────────────────────────────
    // Only students (current ones) need to be checked for promotion.
    if (role === 'student' && userData) {
      // Don't block the UI — kick off async
      checkAndPromoteStudent(u, userData).catch(e =>
        console.warn('Promotion check failed:', e));
    }

    // ─── EMAIL→ROLE + DESC_ BACKFILL ────────────────────────────
    // For students/teachers who signed up before name-based sign-in existed,
    // backfill their server-side mappings so name-based sign-in can resolve
    // their email next time. Idempotent + only fires once per browser per user.
    if ((role === 'student' || role === 'teacher') && u.email) {
      const flagKey = 'svEmailMapped_' + u.uid;
      if (!localStorage.getItem(flagKey)) {
        try {
          if (role === 'student') {
            const userDoc = userData || {};
            await fetch(APPS_SCRIPT_URL, {
              method: 'POST',
              body: JSON.stringify({
                action:    'register_admission',
                admission: userDoc.admissionNo || '',
                email:     u.email,
                role:      'student',
                uid:       u.uid
              })
            });
          } else if (role === 'teacher') {
            await fetch(APPS_SCRIPT_URL, {
              method: 'POST',
              body: JSON.stringify({
                action: 'register_admission',
                admission: 'TEACHER_' + u.uid,
                email: u.email,
                role: 'teacher',
                uid: u.uid
              })
            });
          }
          localStorage.setItem(flagKey, '1');
        } catch (e) {
          console.warn('Email-role backfill failed:', e);
        }
      }
    }

  } else {
    // Check for face-auth session
    const faceUser = localStorage.getItem('svFaceUser');
    if (faceUser) {
      try {
        const fu = JSON.parse(faceUser);
        // Expire after 8 hours
        if (Date.now() - fu.signedInAt < 8 * 3600 * 1000) {
          syncLoginButtons(fu.name.split(/\s+/)[0], true);
          return;
        } else {
          localStorage.removeItem('svFaceUser');
        }
      } catch (e) { localStorage.removeItem('svFaceUser'); }
    }
    syncLoginButtons("Login", false);
  }
});


/* ═══════════════════════════════════════════════════════════════════
   ANNUAL PROMOTION — checks if the server has had a year-end promotion
   since the user was last updated. If so:
     • increments their grade (up to and including Grade 12), OR
     • marks them alumni if they've finished their Grade 12 year,
   then asks them to re-upload their face photo (if not alumni).

   Grade 12 is the final year. A student who reaches Grade 12 stays there
   throughout that calendar year, and becomes alumni on the FIRST login
   AFTER the year ends. Their passedBatchYear is the year they actually
   sat in Grade 12 (e.g. Grade 12 in 2026 → Class of 2026).
   ═══════════════════════════════════════════════════════════════════ */
async function checkAndPromoteStudent(user, userData) {
  // 1. What year did the server last promote?
  let lastPromoYear = 0;
  try {
    const cached = JSON.parse(localStorage.getItem('svLastPromotion') || 'null');
    if (cached && (Date.now() - cached.fetched < 3600 * 1000)) {
      lastPromoYear = cached.year;
    } else {
      const res = await fetch(APPS_SCRIPT_URL + '?action=last_promotion');
      const j = await res.json();
      lastPromoYear = j.year || 0;
      localStorage.setItem('svLastPromotion', JSON.stringify({
        year: lastPromoYear, fetched: Date.now()
      }));
    }
  } catch (e) {
    console.warn('Could not fetch last_promotion:', e);
    return; // be safe — don't promote on network error
  }

  if (!lastPromoYear) return; // No promotion ever recorded yet

  const userLast = userData.lastPromotionYear || 0;
  if (userLast >= lastPromoYear) return; // Already caught up

  // How many promotions have they missed? Usually 1; could be more if absent.
  const advance = lastPromoYear - userLast;
  const currentGrade = userData.grade || 1;
  const newGrade = currentGrade + advance;

  const ref = authDb.collection('users').doc(user.uid);

  if (newGrade > 12) {
    // ═══ NOW ALUMNI — they've finished Grade 12 ═══
    // passedBatchYear = the year they actually sat in Grade 12.
    // Formula: userLast + (12 - currentGrade)
    //   currentGrade=12, userLast=N → N    (they were in Grade 12 last year)
    //   currentGrade=11, userLast=N → N+1  (promoted to G12 in N+1, finished N+1)
    //   currentGrade=10, userLast=N → N+2  (G11 in N+1, G12 in N+2, finished N+2)
    const passedBatchYear = userLast + (12 - currentGrade);
    await ref.update({
      role: 'alumni',
      grade: 12,
      passedBatchYear: passedBatchYear,
      lastPromotionYear: lastPromoYear,
      hasFace: false,
      faceDescriptor: [],
      needsPhotoReupload: false
    });
    showAlumniPanel(user.displayName || userData.displayName, passedBatchYear);
    return;
  }

  // ═══ PROMOTED (Grade 1-11 → next grade; Grade 11 → 12 also lands here) ═══
  await ref.update({
    grade: newGrade,
    lastPromotionYear: lastPromoYear,
    hasFace: false,
    faceDescriptor: [],
    needsPhotoReupload: true,
    photoURL: ''
  });

  // Only nag them once per session
  if (!sessionStorage.getItem('svReuploadShown_' + user.uid)) {
    sessionStorage.setItem('svReuploadShown_' + user.uid, '1');
    showReuploadPanel(user.displayName || userData.displayName, newGrade);
  }
}

function showAlumniPanel(displayName, batchYear) {
  document.getElementById('authOverlay').classList.add('open');
  showPan('panAL');
  const nameEl  = document.getElementById('alName');
  const batchEl = document.getElementById('alBatchYear');
  if (nameEl)  nameEl.textContent  = 'Congratulations, ' + (displayName || '') + '!';
  if (batchEl) batchEl.textContent = batchYear;
}

function showReuploadPanel(displayName, newGrade) {
  document.getElementById('authOverlay').classList.add('open');
  showPan('panRU');
  const greet  = document.getElementById('ruGreeting');
  const gradeE = document.getElementById('ruNewGrade');
  if (greet)  greet.textContent  = 'Welcome back, ' + (displayName ? displayName.split(/\s+/)[0] : 'student') + '!';
  if (gradeE) gradeE.textContent = 'Grade ' + newGrade;
}


/* ═══════════════════════════════════════════════════════════════════
   RE-UPLOAD CAPTURE — student takes a new photo after promotion
   ═══════════════════════════════════════════════════════════════════ */
let reuploadFace = null; // { jpeg, descriptor }

async function startReuploadCapture() {
  const video   = document.getElementById('ruVideo');
  const stage   = document.getElementById('ruFaceStage');
  const preview = document.getElementById('ruPreview');
  const camBtn  = document.getElementById('ruCamBtn');
  const snap    = document.getElementById('ruSnapBtn');
  const retake  = document.getElementById('ruRetakeBtn');
  const hint    = document.getElementById('ruFaceHint');

  try {
    hint.textContent = 'Loading face models…';
    await SVFace.loadModels();
    hint.textContent = 'Starting camera…';
    await SVFace.startCamera(video);
    video.classList.add('live');
    preview.classList.remove('preview');
    stage.classList.add('has-content');
    camBtn.style.display = 'none';
    snap.disabled        = false;
    retake.style.display = 'none';
    hint.textContent     = 'Look straight at the camera. Click "Capture" when ready.';
  } catch (e) {
    errMsg('ruErr', 'Camera unavailable: ' + e.message);
  }
}

async function snapReupload() {
  const video   = document.getElementById('ruVideo');
  const preview = document.getElementById('ruPreview');
  const snap    = document.getElementById('ruSnapBtn');
  const retake  = document.getElementById('ruRetakeBtn');
  const hint    = document.getElementById('ruFaceHint');
  const submitB = document.getElementById('ruBtn');

  hint.textContent = 'Hold still — taking 3 samples for accuracy…';
  snap.disabled = true;

  const descriptor = await SVFace.computeRobustDescriptor(video, 3);
  if (!descriptor) {
    hint.textContent = '⚠ No face detected — try again with better lighting and a clear front-facing view.';
    snap.disabled = false;
    return;
  }

  const jpeg = SVFace.captureJpeg(video, 0.85);
  SVFace.stopCamera(video);
  video.classList.remove('live');
  preview.src = jpeg;
  preview.classList.add('preview');
  snap.style.display   = 'none';
  retake.style.display = 'inline-block';
  submitB.disabled = false;
  hint.textContent = '✓ Face captured (3-sample average). Click "Save New Photo" to finish.';

  reuploadFace = { jpeg, descriptor: SVFace.descriptorToArray(descriptor) };
}

function retakeReupload() {
  const preview = document.getElementById('ruPreview');
  const snap    = document.getElementById('ruSnapBtn');
  const retake  = document.getElementById('ruRetakeBtn');
  const submitB = document.getElementById('ruBtn');
  preview.classList.remove('preview');
  preview.src = '';
  snap.style.display = 'inline-block';
  retake.style.display = 'none';
  submitB.disabled = true;
  reuploadFace = null;
  startReuploadCapture();
}

async function submitReupload() {
  const user = auth.currentUser;
  if (!user) return errMsg('ruErr', 'You are no longer signed in. Please sign in again.');
  if (!reuploadFace) return errMsg('ruErr', 'Please capture a photo first.');

  const btn = document.getElementById('ruBtn');
  btn.disabled = true; btn.classList.add('loading');
  errMsg('ruErr', '');

  try {
    const snap = await authDb.collection('users').doc(user.uid).get();
    const u = snap.data();
    if (!u) throw new Error('User data missing.');

    // 1. Send to Apps Script — saves photo & updates sheet
    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify({
        action: 'update_student_photo',
        uid:    u.uid,
        name:   u.displayName,
        email:  u.email,
        role:   u.role,
        grade:  u.role === 'teacher' ? null : u.grade,
        photoBase64: reuploadFace.jpeg,
        descriptor:  reuploadFace.descriptor
      })
    });
    const json = await res.json();
    if (json.error) throw new Error(json.error);

    // 2. Update Firestore
    await authDb.collection('users').doc(user.uid).update({
      hasFace: true,
      faceDescriptor: reuploadFace.descriptor,
      photoURL: json.photoUrl || '',
      needsPhotoReupload: false
    });

    // 3. Refresh the avatar in the modal immediately
    const av = document.getElementById('lgAvatar');
    if (av && json.photoUrl) {
      av.innerHTML = `<img src="${thumbUrl(json.photoUrl)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover" alt="">`;
    }

    okMsg('ruErr', '✓ Photo saved! You can now use face sign-in again.');
    setTimeout(() => {
      reuploadFace = null;
      showPan('panLI'); // Show normal logged-in profile
      setTimeout(closeAuth, 1200);
    }, 1100);
  } catch (e) {
    errMsg('ruErr', e.message || 'Failed to save photo.');
  } finally {
    btn.disabled = false; btn.classList.remove('loading');
  }
}

function skipReupload() {
  SVFace.stopCamera(document.getElementById('ruVideo'));
  reuploadFace = null;
  closeAuth();
}


/* ═══════════════════════════════════════════════════════════════════
   EDIT PROFILE — opens panED with the user's current data pre-filled
   ═══════════════════════════════════════════════════════════════════ */
async function openEditProfile() {
  const user = auth.currentUser;

  // Resolve who's editing and where to get data from
  let isFace = false;
  let userUid = null;
  let userEmail = null;
  let fu = null;

  if (user) {
    userUid   = user.uid;
    userEmail = user.email;
  } else {
    // Face-only session
    try { fu = JSON.parse(localStorage.getItem('svFaceUser') || '{}'); } catch (e) {}
    if (!fu || !fu.uid) {
      const lgRole = document.getElementById('lgRole');
      if (lgRole) lgRole.textContent = '⚠ Session expired. Please sign in again.';
      return;
    }
    isFace = true;
    userUid = fu.uid;
    userEmail = fu.email || '';
  }

  showPan('panED');
  clearErrs();

  // ── Load profile data ──
  // Try Firestore FIRST (works for everyone — including face users — IF the
  // Firestore rules allow public GET on /users/{uid}. See the rules note in
  // SETUP.md). Then for face users, layer Apps Script USERDATA_<uid> on top
  // (in case they made edits while face-signed-in).
  let data = null;
  try {
    const snap = await authDb.collection('users').doc(userUid).get();
    if (snap.exists) data = snap.data();
  } catch (e) {
    console.warn('Firestore read failed (rules may need to allow public GET):', e);
  }

  if (isFace) {
    // Also fetch Apps Script overrides if any
    try {
      const res = await fetch(APPS_SCRIPT_URL + '?action=face_get_user_data&uid=' + encodeURIComponent(userUid));
      if (res.ok) {
        const json = await res.json();
        if (json.ok && json.data) {
          data = Object.assign({}, data || {}, json.data);
        }
      }
    } catch (e) {
      console.warn('Apps Script read failed:', e);
    }
  }

  // Last-resort fallback: use face session basic info only
  if (!data && isFace) {
    data = {
      displayName: fu.name  || '',
      email:       fu.email || '',
      role:        fu.role  || '',
      grade:       fu.grade || null
    };
  }

  if (!data) {
    errMsg('edErr', 'Could not load your profile data. Check Firestore rules (see SETUP.md).');
    return;
  }

  // ── Populate form ──
  document.getElementById('edName').value = data.displayName || '';

  const stBlock = document.getElementById('edStudentFields');
  const tcBlock = document.getElementById('edTeacherFields');

  if (data.role === 'student') {
    stBlock.style.display = 'block';
    tcBlock.style.display = 'none';
    document.getElementById('edAdmission').value   = data.admissionNo  || '';
    document.getElementById('edStContact').value   = data.contactNo    || '';
    document.getElementById('edStDOB').value       = data.dob          || '';
    document.getElementById('edStGender').value    = data.gender       || '';
    document.getElementById('edGuardName').value   = data.guardianName || '';
    document.getElementById('edGuardPhone').value  = data.guardianPhone|| '';
    document.getElementById('edGuardEmail').value  = data.guardianEmail|| '';
    document.getElementById('edStAddress').value   = data.homeAddress  || '';
    document.getElementById('edStGradeDisplay').value = 'Grade ' + (data.grade || '?');
  } else if (data.role === 'teacher') {
    stBlock.style.display = 'none';
    tcBlock.style.display = 'block';
    document.getElementById('edTcPhone').value     = data.phoneNo       || '';
    document.getElementById('edTcContact').value   = data.contactNo     || '';
    document.getElementById('edTcAddress').value   = data.homeAddress   || '';
    document.getElementById('edTcGrade').value     = data.teachingGrade || '';
    document.getElementById('edTcSubject').value   = data.subject       || '';
    document.getElementById('edTcMedium').value    = data.medium        || '';
    document.getElementById('edTcDOB').value       = data.dob           || '';
    document.getElementById('edTcGender').value    = data.gender        || '';
  } else {
    stBlock.style.display = 'none';
    tcBlock.style.display = 'none';
  }
}

function cancelEdit() {
  showPan('panLI');
  clearErrs();
}

async function saveProfileEdits() {
  const user = auth.currentUser;

  // Resolve who's saving — face-only session or full Firebase Auth?
  let isFace = false;
  let userUid = null;
  let userEmail = null;
  let fu = null;
  let curRole = null;
  let curGrade = null;
  let curName = '';

  if (user) {
    userUid = user.uid;
    userEmail = user.email;
  } else {
    try { fu = JSON.parse(localStorage.getItem('svFaceUser') || '{}'); } catch (e) {}
    if (!fu || !fu.uid) return errMsg('edErr', 'You are not signed in.');
    isFace = true;
    userUid = fu.uid;
    userEmail = fu.email || '';
    curRole = fu.role || '';
    curGrade = fu.grade || null;
    curName = fu.name || '';
  }

  const btn = document.getElementById('edBtn');
  btn.disabled = true; btn.classList.add('loading');
  errMsg('edErr', '');

  try {
    // Get current data so we know the role + can detect name change
    if (!isFace) {
      const snap = await authDb.collection('users').doc(userUid).get();
      if (!snap.exists) throw new Error('User data missing.');
      const cur = snap.data();
      curRole = cur.role;
      curGrade = cur.grade || cur.teachingGrade || null;
      curName  = cur.displayName || '';
    } else {
      // Face-signed user: also refresh role/grade/name from Firestore
      // (face session may be stale — e.g. created before the Firestore
      // refresh code was deployed). Firestore reads are public.
      try {
        const snap = await authDb.collection('users').doc(userUid).get();
        if (snap.exists) {
          const cur = snap.data();
          if (cur.role) curRole = cur.role;
          if (cur.grade != null) curGrade = cur.grade;
          else if (cur.teachingGrade != null) curGrade = cur.teachingGrade;
          if (cur.displayName) curName = cur.displayName;
        }
      } catch (e) {
        console.warn('Could not refresh role/grade from Firestore:', e);
      }
    }

    const newName = document.getElementById('edName').value.trim();
    if (!newName) throw new Error('Name is required.');

    const updates = { displayName: newName };
    const get = id => document.getElementById(id).value.trim();

    if (curRole === 'student') {
      const contact     = get('edStContact');
      const dob         = get('edStDOB');
      const gender      = get('edStGender');
      const guardName   = get('edGuardName');
      const guardPhone  = get('edGuardPhone');
      const guardEmail  = get('edGuardEmail');
      const address     = get('edStAddress');
      if (!contact || !dob || !gender || !guardName || !guardPhone || !address) {
        throw new Error('Please fill in all required fields (*).');
      }
      updates.admissionNo   = get('edAdmission');
      updates.contactNo     = contact;
      updates.dob           = dob;
      updates.gender        = gender;
      updates.guardianName  = guardName;
      updates.guardianPhone = guardPhone;
      updates.guardianEmail = guardEmail;
      updates.homeAddress   = address;
      updates.grade         = curGrade;
      updates.role          = 'student';
    } else if (curRole === 'teacher') {
      const phone   = get('edTcPhone');
      const contact = get('edTcContact');
      const address = get('edTcAddress');
      const grade   = get('edTcGrade');
      const subject = get('edTcSubject');
      const medium  = get('edTcMedium');
      const dob     = get('edTcDOB');
      const gender  = get('edTcGender');
      if (!phone || !contact || !address || !grade || !subject || !medium || !dob || !gender) {
        throw new Error('Please fill in all required fields (*).');
      }
      updates.phoneNo       = phone;
      updates.contactNo     = contact;
      updates.homeAddress   = address;
      updates.teachingGrade = grade;
      updates.subject       = subject;
      updates.medium        = medium;
      updates.dob           = dob;
      updates.gender        = gender;
      updates.role          = 'teacher';
    }

    const nameChanged = (newName !== curName);

    if (isFace) {
      // ── FACE-SIGNED USER: write to Apps Script only ──
      const res = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify({
          action: 'face_update_user_data',
          uid:    userUid,
          email:  userEmail,
          data:   updates
        })
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);

      // Update the face session in localStorage so it stays consistent
      try {
        fu.name = newName;
        localStorage.setItem('svFaceUser', JSON.stringify(fu));
      } catch (e) {}

      // If name changed, also update the Drive sheet
      if (nameChanged) {
        try {
          await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
              action: 'update_user_name',
              uid:    userUid,
              name:   newName,
              role:   curRole,
              grade:  curRole === 'student' ? curGrade : null
            })
          });
        } catch (e) { console.warn('Sheet name update failed:', e); }
      }
    } else {
      // ── FULL FIREBASE AUTH USER: write to Firestore (and mirror to Apps Script) ──
      const ref = authDb.collection('users').doc(userUid);
      await ref.update(updates);

      // Mirror to Apps Script so the data is available for future face edits
      try {
        await fetch(APPS_SCRIPT_URL, {
          method: 'POST',
          body: JSON.stringify({
            action: 'face_update_user_data',
            uid:    userUid,
            email:  userEmail,
            data:   updates
          })
        });
      } catch (e) { console.warn('Could not mirror to Apps Script:', e); }

      // Refresh admission mapping if changed
      if (curRole === 'student' && updates.admissionNo && userEmail) {
        try {
          await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
              action:    'register_admission',
              admission: updates.admissionNo,
              email:     userEmail
            })
          });
          localStorage.removeItem('svAdmMapped_' + userUid);
        } catch (e) {}
      }

      if (nameChanged) {
        try { await user.updateProfile({ displayName: newName }); } catch (e) {}
        try {
          await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
              action: 'update_user_name',
              uid:    userUid,
              name:   newName,
              role:   curRole,
              grade:  curRole === 'student' ? curGrade : null
            })
          });
        } catch (e) {}
      }
    }

    if (nameChanged) {
      syncLoginButtons(newName.split(/\s+/)[0], true);
    }

    okMsg('edErr', '✓ Profile updated successfully!');
    const lgName = document.getElementById('lgName');
    if (lgName) lgName.textContent = 'Welcome, ' + newName;

    setTimeout(() => { showPan('panLI'); }, 1100);

  } catch (e) {
    errMsg('edErr', e.message || 'Failed to save changes.');
  } finally {
    btn.disabled = false; btn.classList.remove('loading');
  }
}


/* ═══════════════════════════════════════════════════════════════════
   (Delete-account functions removed — feature no longer exposed to users.
   The deleteUser action still exists in Apps Script for admin use if
   needed manually via the script editor.)
   ═══════════════════════════════════════════════════════════════════ */


/* ═══════════════════════════════════════════════════════════════════
   MANUAL FACE PHOTO RE-REGISTRATION
   Called from the "Re-register Face Photo" button in Edit Profile.
   Re-uses the existing panRU panel + capture/submit flow, just with
   different greeting text so the user understands what's happening.
   ═══════════════════════════════════════════════════════════════════ */
async function openManualReupload() {
  const user = auth.currentUser;
  if (!user) return;

  let userData;
  try {
    const snap = await authDb.collection('users').doc(user.uid).get();
    userData = snap.data();
  } catch (e) { return; }

  // Customize panRU's text for manual re-registration (not the annual one)
  const greet  = document.getElementById('ruGreeting');
  const gradeE = document.getElementById('ruNewGrade');
  const msg    = document.querySelector('#panRU .ru-message');
  if (greet) greet.textContent = (userData.displayName ? userData.displayName.split(/\s+/)[0] : 'Friend') + ', re-register your face';
  if (gradeE) gradeE.textContent =
    userData.role === 'teacher' ? 'Teacher account' :
    'Grade ' + (userData.grade || '?');
  if (msg) msg.innerHTML =
    'Take a new face photo so face sign-in & the attendance scanner ' +
    'recognize you reliably. <span class="ru-new-grade" id="ruNewGrade">' +
    (userData.role === 'teacher' ? 'Teacher account' : 'Grade ' + (userData.grade || '?')) +
    '</span><br>This replaces your old photo (if any).';

  // Reset capture state
  reuploadFace = null;
  const preview = document.getElementById('ruPreview');
  if (preview) { preview.src = ''; preview.classList.remove('preview'); }
  const cam = document.getElementById('ruCamBtn');
  const snap = document.getElementById('ruSnapBtn');
  const ret  = document.getElementById('ruRetakeBtn');
  const btn  = document.getElementById('ruBtn');
  if (cam) cam.style.display = 'inline-block';
  if (snap) { snap.style.display = 'inline-block'; snap.disabled = true; }
  if (ret) ret.style.display = 'none';
  if (btn) btn.disabled = true;

  showPan('panRU');
  clearErrs();
}


/* ═══════════════════════════════════════════════════════════════════
   STUDENT / TEACHER SIGN-IN by name fragment
   Either role signs in with any part of their full name + password.
   Flow: queries Firestore DIRECTLY for users with matching displayName
         → uses the resolved email to call Firebase signInWithEmailAndPassword
   Firestore is the single source of truth — if an account is deleted from
   Firestore, it disappears from this lookup immediately.
   ═══════════════════════════════════════════════════════════════════ */
async function doSchoolSignIn() {
  const nameFrag = document.getElementById('siNm').value.trim();
  const pass     = document.getElementById('siNmPass').value;
  if (!nameFrag)            return errMsg('siNmErr', 'Enter your name (any part will work).');
  if (nameFrag.length < 2)  return errMsg('siNmErr', 'Enter at least 2 letters of your name.');
  if (!pass)                return errMsg('siNmErr', 'Enter your password.');

  const btn = document.getElementById('siNmBtn');
  btn.disabled = true; btn.classList.add('loading');
  errMsg('siNmErr', '');

  // Track the resolved name across try/catch so the password-error message
  // can include it (proves to the user that the name lookup DID work).
  let resolvedName = null;

  try {
    // 1. Get candidate matches from Apps Script (which scans the DESC_<uid>
    //    name index — this is keyed by content so we can search by fragment).
    const res = await fetch(APPS_SCRIPT_URL + '?action=lookup_name&name=' + encodeURIComponent(nameFrag));
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    if (!data.matches || data.matches.length === 0) {
      throw new Error('No school account found with name containing "' + nameFrag + '". Check your spelling.');
    }

    // 2. Cross-check each match against Firestore — Firestore is the source
    //    of truth, so a match that doesn't have a current Firestore document
    //    is a stale entry (Firestore account was deleted). We filter those out
    //    so they don't block sign-in or appear as duplicates.
    const validMatches = [];
    for (let i = 0; i < data.matches.length; i++) {
      const m = data.matches[i];
      if (!m.uid) continue;
      try {
        const snap = await authDb.collection('users').doc(m.uid).get();
        if (snap.exists) {
          const fd = snap.data();
          validMatches.push({
            uid:   m.uid,
            name:  fd.displayName || m.name,
            email: fd.email       || m.email,
            role:  fd.role        || m.role
          });
        }
      } catch (e) {
        console.warn('Firestore check failed for', m.uid, e);
      }
    }

    // 3. Decide what to do based on valid matches
    if (validMatches.length === 0) {
      throw new Error('No school account found with name containing "' + nameFrag + '". Check your spelling.');
    }
    const withEmail = validMatches.filter(m => m.email);
    if (withEmail.length === 0) {
      throw new Error('⚠ Found an account but no email is recorded for it. Please use the Sign Up tab to re-register, or migrate using the link below.');
    }
    if (withEmail.length > 1) {
      throw new Error('Multiple accounts match "' + nameFrag + '". Please type more of your full name.');
    }

    resolvedName = withEmail[0].name;

    // 4. Sign in to Firebase with the resolved email + entered password
    await auth.signInWithEmailAndPassword(withEmail[0].email, pass);

    // 5. The onAuthStateChanged listener handles UI updates from here
    okMsg('siNmErr', '✓ Welcome, ' + withEmail[0].name + '!');
    setTimeout(closeAuth, 800);
  } catch (e) {
    let msg;
    // If the name lookup succeeded (resolvedName is set) but Firebase Auth
    // rejected the password, make this explicit so the user doesn't think
    // their name wasn't recognized.
    if (resolvedName && (e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password' || e.code === 'auth/user-not-found')) {
      msg = '✓ Name recognized as "' + resolvedName + '" — but the password is incorrect. Click "Forgot password?" below to reset it.';
    } else {
      msg = e.code ? fErr(e.code) : (e.message || 'Sign-in failed.');
    }
    errMsg('siNmErr', msg);
  } finally {
    btn.disabled = false; btn.classList.remove('loading');
  }
}


/* ═══════════════════════════════════════════════════════════════════
   NORMAL / VISITOR SIGN-UP
   Simple email + password account. No school code required.
   No face capture. Role = 'normal'.
   ═══════════════════════════════════════════════════════════════════ */
async function doSignUpNormal() {
  const name   = document.getElementById('nmName').value.trim();
  const email  = document.getElementById('nmEmail').value.trim();
  const pass   = document.getElementById('nmPass').value;
  const gender = document.getElementById('nmGender').value.trim();

  if (!name)   return errMsg('nmErr', 'Please enter your name.');
  if (!email)  return errMsg('nmErr', 'Please enter your email.');
  if (!pass)   return errMsg('nmErr', 'Please enter a password.');
  if (!gender) return errMsg('nmErr', 'Please select your gender.');
  if (pass.length < 6) return errMsg('nmErr', 'Password must be at least 6 characters.');

  const btn = document.getElementById('nmBtn');
  btn.disabled = true; btn.classList.add('loading');
  errMsg('nmErr', '');

  try {
    // 0. BLOCK: refuse to create a guest account if this email is already
    //    registered as a student or teacher in the school.
    const existingRole = await checkEmailRole(email);
    if (existingRole === 'student' || existingRole === 'teacher') {
      errMsg('nmErr',
        '⚠ This email is registered as a ' + existingRole +
        '. You cannot create a guest account with it. Please sign in using the ' +
        (existingRole === 'student' ? 'Student' : 'Teacher / Email') +
        ' section instead.');
      btn.disabled = false; btn.classList.remove('loading');
      return;
    }

    // 1. Create Firebase Auth account
    const cred = await auth.createUserWithEmailAndPassword(email, pass);
    await cred.user.updateProfile({ displayName: name });
    const uid = cred.user.uid;

    // 2. Save to Firestore
    await authDb.collection('users').doc(uid).set({
      uid:         uid,
      role:        'normal',
      displayName: name,
      email:       email,
      gender:      gender,
      photoURL:    '',
      hasFace:     false,
      createdAt:   firebase.firestore.FieldValue.serverTimestamp()
    });

    okMsg('nmErr', '✓ Welcome to Sri Vipassi!');

    // Instant button update
    syncLoginButtons(name.split(/\s+/)[0], true);
    const lgName  = document.getElementById('lgName');
    const lgEmail = document.getElementById('lgEmail');
    const lgRole  = document.getElementById('lgRole');
    if (lgName)  lgName.textContent  = 'Welcome, ' + name;
    if (lgEmail) lgEmail.textContent = email;
    if (lgRole)  lgRole.textContent  = 'Community Member';

    setTimeout(() => { showPan('panLI'); setTimeout(closeAuth, 1400); }, 1100);
  } catch (e) {
    errMsg('nmErr', e.code ? fErr(e.code) : (e.message || 'Sign-up failed.'));
  } finally {
    btn.disabled = false; btn.classList.remove('loading');
  }
}


/* ═══════════════════════════════════════════════════════════════════
   ACCOUNT MIGRATION
   One-time flow for students/teachers who signed up BEFORE the
   name-based sign-in feature existed. Their Apps Script DESC_ entry
   doesn't have an email field, so name-lookup can't resolve to a login.
   This flow:
     1. Signs them in via email+password (bypasses the guest-block)
     2. Reads their role from Firestore
     3. Calls register_admission which backfills DESC_<uid> with email+role
     4. Keeps them signed in — next time they can use name-based sign-in
   ═══════════════════════════════════════════════════════════════════ */
function openMigration() {
  showPan('panMG');
  const e = document.getElementById('mgEmail');
  const p = document.getElementById('mgPass');
  if (e) e.value = '';
  if (p) p.value = '';
  errMsg('mgErr', '');
}

function cancelMigration() {
  showPan('panSI');
  clearErrs();
}

async function doMigrate() {
  const email = document.getElementById('mgEmail').value.trim();
  const pass  = document.getElementById('mgPass').value;
  if (!email) return errMsg('mgErr', 'Please enter your email.');
  if (!pass)  return errMsg('mgErr', 'Please enter your password.');

  const btn = document.getElementById('mgBtn');
  btn.disabled = true; btn.classList.add('loading');
  errMsg('mgErr', '');

  let signedInUser = null;
  try {
    // 1. Sign in via Firebase Auth — migration is the one place where
    //    we don't role-check at sign-in (we'll check after, for safety).
    const cred = await auth.signInWithEmailAndPassword(email, pass);
    signedInUser = cred.user;

    // 2. Look up the user's data in Firestore to confirm role + get admission
    const snap = await authDb.collection('users').doc(signedInUser.uid).get();
    if (!snap.exists) {
      await auth.signOut();
      throw new Error('User profile not found in Firestore. You may need to delete and re-sign-up.');
    }
    const userData = snap.data();
    const role = userData.role;

    if (role !== 'student' && role !== 'teacher') {
      await auth.signOut();
      throw new Error('Migration is only for student/teacher accounts. Your account role is "' + (role || 'unknown') + '" — please sign in via the Guest section instead.');
    }

    // 3. Push the backfill to Apps Script
    okMsg('mgErr', 'Signed in — backfilling your account data…');
    try {
      const admission = role === 'student'
        ? (userData.admissionNo || '')
        : ('TEACHER_' + signedInUser.uid);

      const res = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify({
          action:    'register_admission',
          admission: admission,
          email:     email,
          role:      role,
          uid:       signedInUser.uid
        })
      });
      const json = await res.json();
      if (json.error) console.warn('Backfill returned error:', json.error);
    } catch (e) {
      console.warn('Backfill network error:', e);
      // Not fatal — user is still signed in. They can try name-sign-in;
      // if it fails they can try migration again.
    }

    // 4. Clear the "already mapped" flag so the auth state listener
    //    ALSO writes the backfill once (belt + braces).
    try { localStorage.removeItem('svEmailMapped_' + signedInUser.uid); } catch (e) {}

    // 5. Success — keep them signed in, transition to profile panel
    okMsg('mgErr', '✓ Migration successful! Next time, sign in with your name in the section above.');

    setTimeout(() => {
      showPan('panLI');
      setTimeout(closeAuth, 1800);
    }, 1500);

  } catch (e) {
    const msg = e.code ? fErr(e.code) : (e.message || 'Migration failed.');
    errMsg('mgErr', msg);
    btn.disabled = false; btn.classList.remove('loading');
  }
}


/* ═══════════════════════════════════════════════════════════════════
   (Password-confirm panel removed — face-signed users now edit directly
   via Apps Script's faceUpdateUserData action, no password needed.)
   ═══════════════════════════════════════════════════════════════════ */