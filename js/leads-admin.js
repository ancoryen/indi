// Indizilla admin — the lead queue.
//
// Reads callback_requests with the signed-in admin's session (the RLS policy
// "admins can read leads" gates it server-side), renders newest-first with
// unhandled on top, and lets the admin tick a lead handled in place. This is
// the own-medicine gap closed: the business that sells CRM setup now works
// its own leads from a queue instead of an inbox.
(() => {
  const mount = document.getElementById('leads-list');
  if (!mount) return;

  const esc = (s) => String(s == null ? '' : s)
    .replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const fmt = (iso) => {
    try { return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
    catch (e) { return iso; }
  };

  async function load() {
    const sb = window.DB && DB.client;
    if (!sb) {
      mount.innerHTML = '<p class="hint">Leads live in the database — sign in on the live site to see them.</p>';
      return;
    }
    const { data, error } = await sb.from('callback_requests')
      .select('id, created_at, name, phone, email, context, intent, source, handled')
      .order('handled', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      // Most likely: the migration hasn't been run yet, so the table (or the
      // admin policy) doesn't exist. Say that, not a stack trace.
      mount.innerHTML = '<p class="hint">Could not load leads — run <code>node scripts/ship.mjs</code> ' +
        'once so the callback tables and admin policies exist. (' + esc(error.message).slice(0, 120) + ')</p>';
      return;
    }
    if (!data || !data.length) {
      mount.innerHTML = '<p class="hint">No leads yet. They arrive here from the visiting card, the contact page and the print quote list.</p>';
      return;
    }

    mount.innerHTML = data.map((l) =>
      '<div class="lead-row' + (l.handled ? ' is-handled' : '') + '">' +
      '<label class="lead-tick"><input type="checkbox" data-id="' + l.id + '"' +
        (l.handled ? ' checked' : '') + '><span></span></label>' +
      '<div class="lead-main">' +
      '<div class="lead-top"><strong>' + esc(l.name) + '</strong>' +
      '<span class="lead-src">' + esc(l.source) + (l.intent === 'promo' ? ' · promo' : '') + '</span>' +
      '<span class="lead-when">' + fmt(l.created_at) + '</span></div>' +
      '<div class="lead-contact"><a href="tel:' + esc(l.phone) + '">' + esc(l.phone) + '</a>' +
      (l.email ? ' · <a href="mailto:' + esc(l.email) + '">' + esc(l.email) + '</a>' : '') + '</div>' +
      (l.context ? '<div class="lead-ctx">' + esc(l.context) + '</div>' : '') +
      '</div></div>').join('');

    mount.querySelectorAll('input[type="checkbox"][data-id]').forEach((box) =>
      box.addEventListener('change', async () => {
        box.disabled = true;
        const { error: e2 } = await sb.from('callback_requests')
          .update({ handled: box.checked }).eq('id', box.dataset.id);
        box.disabled = false;
        if (e2) { box.checked = !box.checked; return; }
        box.closest('.lead-row').classList.toggle('is-handled', box.checked);
      }));
  }

  // Load when the tab is opened, and once at start in case it's already open.
  document.querySelectorAll('.dash-tab[data-tab="leads"]').forEach((b) =>
    b.addEventListener('click', load));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();
