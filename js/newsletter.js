// Indizilla — newsletter capture.
//
// One field, one promise. Delivery follows the house pattern: Supabase insert
// into `subscribers` (anon INSERT-only), mailto fallback if that fails, and
// never a fake success state.
(() => {
  const form = document.getElementById('nl-form');
  if (!form) return;
  const cfg = window.INDIZILLA_CONFIG || {};

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const input = document.getElementById('nl-email');
    const email = input.value.trim();
    if (!email || !/.+@.+\..+/.test(email)) { input.focus(); return; }

    const btn = document.getElementById('nl-btn');
    btn.disabled = true;
    btn.textContent = 'Adding…';

    let delivered = false;
    try {
      if (cfg.supabaseUrl && cfg.supabaseAnonKey) {
        const res = await fetch(cfg.supabaseUrl.replace(/\/+$/, '') + '/rest/v1/subscribers', {
          method: 'POST',
          headers: {
            apikey: cfg.supabaseAnonKey,
            Authorization: 'Bearer ' + cfg.supabaseAnonKey,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal'
          },
          body: JSON.stringify({ email, source: 'resources' })
        });
        delivered = res.ok;
      }
    } catch (e) { delivered = false; }

    if (delivered) {
      form.hidden = true;
      document.getElementById('nl-done').hidden = false;
    } else {
      // Honest fallback: their mail app carries the request instead.
      window.location.href = 'mailto:hi@indizilla.com?subject=' +
        encodeURIComponent('Newsletter signup') + '&body=' +
        encodeURIComponent('Please add me to the list: ' + email);
      btn.disabled = false;
      btn.textContent = 'Subscribe';
    }
  });
})();
