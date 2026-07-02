/* ═══════════ SHARED CHANGE PASSWORD MODAL ═══════════
   Requires window._auth (Firebase Auth) to be initialized before use.
   Trigger from any button: onclick="openChangePassword()"
═══════════════════════════════════════════════════════ */

(function injectChangePasswordModal() {
  const html = `
  <div id="cp-modal" style="display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.75);align-items:center;justify-content:center;padding:2rem;font-family:Inter,sans-serif">
    <div style="background:#1a0606;border:1px solid rgba(212,175,55,0.35);border-radius:16px;padding:32px 28px;max-width:380px;width:100%;box-shadow:0 24px 64px rgba(0,0,0,0.6);color:#e8d5a0">
      <div style="text-align:center;font-size:11px;letter-spacing:3px;color:#d4af37;font-weight:600;margin-bottom:6px">SRI VIPASSI DHAMMA SCHOOL</div>
      <div style="text-align:center;font-size:20px;font-weight:700;color:#f5e6c8;margin-bottom:4px">Change Password</div>
      <div id="cp-user-label" style="text-align:center;font-size:11px;color:#a89060;margin-bottom:22px">—</div>
      <input id="cp-current" type="password" placeholder="Current password" autocomplete="current-password" style="width:100%;padding:12px 16px;background:rgba(255,255,255,0.06);border:1px solid rgba(212,175,55,0.35);border-radius:10px;font-size:14px;margin-bottom:12px;color:#f5e6c8;box-sizing:border-box;outline:none"/>
      <input id="cp-new" type="password" placeholder="New password (min 6 characters)" autocomplete="new-password" style="width:100%;padding:12px 16px;background:rgba(255,255,255,0.06);border:1px solid rgba(212,175,55,0.35);border-radius:10px;font-size:14px;margin-bottom:12px;color:#f5e6c8;box-sizing:border-box;outline:none"/>
      <input id="cp-confirm" type="password" placeholder="Confirm new password" autocomplete="new-password" style="width:100%;padding:12px 16px;background:rgba(255,255,255,0.06);border:1px solid rgba(212,175,55,0.35);border-radius:10px;font-size:14px;margin-bottom:8px;color:#f5e6c8;box-sizing:border-box;outline:none"/>
      <div id="cp-err" style="color:#e57373;font-size:12px;min-height:16px;margin-bottom:8px;text-align:center;line-height:1.4"></div>
      <button id="cp-btn" onclick="submitPasswordChange()" style="width:100%;padding:13px;background:linear-gradient(135deg,#d4af37,#b8941f);color:#1a0606;border:none;border-radius:10px;font-size:12px;font-weight:700;letter-spacing:2px;cursor:pointer;text-transform:uppercase;margin-bottom:8px">Update Password</button>
      <button onclick="closeChangePassword()" style="width:100%;padding:12px;background:transparent;color:#d4af37;border:1px solid rgba(212,175,55,0.35);border-radius:10px;font-size:12px;font-weight:600;letter-spacing:2px;cursor:pointer;text-transform:uppercase">Cancel</button>
    </div>
  </div>`;
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  document.addEventListener('DOMContentLoaded', function() {
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
    ['cp-current','cp-new','cp-confirm'].forEach(function(id) {
      const el = document.getElementById(id);
      if (el) el.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') submitPasswordChange();
      });
    });
  });
})();

function openChangePassword() {
  const authSource = window._auth || (typeof auth !== 'undefined' && auth);
  const user = authSource && authSource.currentUser;
  if (!user) { alert('You are not signed in.'); return; }
  const modal = document.getElementById('cp-modal');
  document.getElementById('cp-user-label').textContent = user.email;
  document.getElementById('cp-current').value = '';
  document.getElementById('cp-new').value = '';
  document.getElementById('cp-confirm').value = '';
  const err = document.getElementById('cp-err');
  err.textContent = '';
  err.style.color = '#e57373';
  const btn = document.getElementById('cp-btn');
  btn.disabled = false;
  btn.textContent = 'Update Password';
  modal.style.display = 'flex';
}

function closeChangePassword() {
  const modal = document.getElementById('cp-modal');
  if (modal) modal.style.display = 'none';
}

async function submitPasswordChange() {
  const currentPw = document.getElementById('cp-current').value;
  const newPw     = document.getElementById('cp-new').value;
  const confirmPw = document.getElementById('cp-confirm').value;
  const errEl = document.getElementById('cp-err');
  const btn   = document.getElementById('cp-btn');
  errEl.textContent = ''; errEl.style.color = '#e57373';

  if (!currentPw || !newPw || !confirmPw) { errEl.textContent = '⚠ Please fill in all three fields.'; return; }
  if (newPw.length < 6)   { errEl.textContent = '⚠ New password must be at least 6 characters.'; return; }
  if (newPw !== confirmPw) { errEl.textContent = '⚠ New passwords do not match.'; return; }
  if (newPw === currentPw) { errEl.textContent = '⚠ New password must be different from current.'; return; }

  const authSource = window._auth || (typeof auth !== 'undefined' && auth);
  const user = authSource && authSource.currentUser;
  if (!user) { errEl.textContent = '⚠ Not signed in.'; return; }

  btn.disabled = true;
  btn.textContent = 'Updating…';
  try {
    const credential = firebase.auth.EmailAuthProvider.credential(user.email, currentPw);
    await user.reauthenticateWithCredential(credential);
    await user.updatePassword(newPw);
    errEl.style.color = '#4caf50';
    errEl.textContent = '✓ Password updated successfully.';
    btn.textContent = 'Done';
    setTimeout(closeChangePassword, 1600);
  } catch (e) {
    let msg = e.message;
    if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') msg = '⚠ Current password is incorrect.';
    else if (e.code === 'auth/weak-password') msg = '⚠ New password is too weak.';
    else if (e.code === 'auth/too-many-requests') msg = '⚠ Too many attempts. Try again later.';
    else if (e.code === 'auth/requires-recent-login') msg = '⚠ Please sign out, sign in again, then retry.';
    errEl.textContent = msg;
    btn.disabled = false;
    btn.textContent = 'Update Password';
  }
}