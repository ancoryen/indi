// Indizilla platform — authentication.
// Supabase Auth (Google OAuth + email magic link) when the anon key is set in
// js/config.js; localStorage demo sign-in otherwise. DB owns the session.

window.Auth = (() => {
  const cfg = window.INDIZILLA_CONFIG || {};

  async function requireLogin() {
    const user = await DB.init();
    if (!user) { window.location.href = 'login.html'; return null; }
    return user;
  }

  async function logout() {
    await DB.signOut();
    window.location.href = 'login.html';
  }

  function referralCodeFromPage() {
    const field = document.getElementById('f-referral');
    const typed = field ? field.value : '';
    const fromUrl = new URLSearchParams(location.search).get('ref') || '';
    return (typed || fromUrl).trim();
  }

  function nextTarget() {
    return new URLSearchParams(location.search).get('next') || '';
  }

  const GOOGLE_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8l3.7 2.9c2.3-2.1 3.7-5.1 3.7-8.6z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.7-2.9c-1 .7-2.4 1.2-4.2 1.2-3.2 0-5.9-2.1-6.9-5.1l-3.9 3C3.2 21.3 7.3 24 12 24z"/><path fill="#FBBC05" d="M5.1 14.3c-.2-.7-.4-1.5-.4-2.3s.1-1.6.4-2.3l-3.9-3C.4 8.3 0 10.1 0 12s.4 3.7 1.2 5.3l3.9-3z"/><path fill="#EA4335" d="M12 4.7c1.8 0 3 .8 3.7 1.4l3.3-3.2C17.9 1.1 15.2 0 12 0 7.3 0 3.2 2.7 1.2 6.7l3.9 3c1-3 3.7-5 6.9-5z"/></svg>';

  /* ---- demo-only helpers (no Supabase key configured) ---- */

  function demoFinishLogin({ email, name, picture, provider }) {
    const { user, isNew } = DB.upsertUserByEmail({ email, name, picture, provider });
    if (isNew) {
      const code = referralCodeFromPage();
      if (code) DB.recordReferral(code, user.id);
    }
    DB.setSession(user.id);
    const next = nextTarget();
    window.location.href = /^(dashboard|cart|admin|research-new)\.html$/.test(next) ? next : 'dashboard.html';
  }

  /* ---- Google button ---- */

  function initGoogleButton(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-secondary google-btn';
    btn.innerHTML = GOOGLE_ICON + ' Continue with Google';
    el.appendChild(btn);

    if (DB.isRemote) {
      // Real Google login through Supabase Auth (provider configured in the
      // Supabase dashboard). Referral codes survive the redirect.
      btn.addEventListener('click', () => {
        DB.rememberPendingReferral(referralCodeFromPage());
        DB.signInGoogle(nextTarget());
      });
      return;
    }

    btn.addEventListener('click', () => {
      const email = window.prompt('Demo Google sign-in.\n(Real Google login activates once the Supabase anon key is set in js/config.js.)\n\nEnter an email to continue:', '');
      if (!email || !email.includes('@')) return;
      demoFinishLogin({ email, name: email.split('@')[0], provider: 'google-demo' });
    });
  }

  /* ---- email form ---- */

  function bindEmailForm(formId) {
    const form = document.getElementById(formId);
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = form.querySelector('[name="name"]').value.trim();
      const email = form.querySelector('[name="email"]').value.trim();
      if (!email) return;

      if (DB.isRemote) {
        DB.rememberPendingReferral(referralCodeFromPage());
        let note = document.getElementById('login-note');
        if (!note) {
          note = document.createElement('p');
          note.id = 'login-note';
          note.style.cssText = 'font-size:14px; margin-top:14px; color:var(--accent-ink);';
          form.appendChild(note);
        }
        try {
          await DB.signInEmailOtp(email);
          note.textContent = 'Check your inbox — we emailed you a sign-in link. It works once and expires soon.';
        } catch (err) {
          note.textContent = 'Could not send the sign-in link: ' + (err.message || 'please try again.');
          note.style.color = 'var(--text-muted)';
        }
        return;
      }

      demoFinishLogin({ email, name, provider: 'email' });
    });
  }

  return { requireLogin, logout, initGoogleButton, bindEmailForm };
})();
