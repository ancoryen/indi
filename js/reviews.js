// Indizilla — client reviews, rendered honestly.
//
// The section renders ONLY rows a real client approved: the table's RLS
// exposes nothing unless `published` and `permission` are both true, and the
// public site has no write path at all. With zero rows the section stays
// hidden — an empty reviews block is more honest than a fabricated one, and
// this site has been burned by fabricated ones before.
(() => {
  const mount = document.getElementById('reviews-section');
  if (!mount) return;
  const cfg = window.INDIZILLA_CONFIG || {};
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) return;

  const esc = (s) => String(s == null ? '' : s)
    .replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  fetch(cfg.supabaseUrl.replace(/\/+$/, '') +
        '/rest/v1/reviews?select=author,business,quote,rating,source&order=created_at.desc&limit=6', {
    headers: { apikey: cfg.supabaseAnonKey, Authorization: 'Bearer ' + cfg.supabaseAnonKey }
  })
    .then((r) => (r.ok ? r.json() : []))
    .then((rows) => {
      if (!Array.isArray(rows) || !rows.length) return;   // stays hidden
      const grid = mount.querySelector('.reviews-grid');
      grid.innerHTML = rows.map((r) =>
        '<div class="card testimonial reveal">' +
        (r.rating ? '<div class="rating" aria-label="' + r.rating + ' out of 5 stars">' +
          '★★★★★'.slice(0, r.rating) + '</div>' : '') +
        '<blockquote>"' + esc(r.quote) + '"</blockquote>' +
        '<div class="who"><div>' +
        '<div class="name">' + esc(r.author) + '</div>' +
        (r.business ? '<div class="role">' + esc(r.business) + '</div>' : '') +
        '</div></div></div>').join('');
      mount.hidden = false;
    })
    .catch(() => { /* stays hidden */ });
})();
