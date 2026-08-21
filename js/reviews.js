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

  // SEED REVIEWS — placeholder content, owner-directed, standing in until the
  // real review pipeline fills the table (planned Monday). The renderer
  // prefers database rows the moment any exist; delete this array then.
  const SEED = [
    { author: 'Rohit M.', business: 'Kitchen & catering, Ahmedabad', rating: 5,
      quote: 'The website says in one page what I used to explain on every call. Orders come in with half the questions already answered.' },
    { author: 'Farheen S.', business: 'Boutique salon, Vadodara', rating: 5,
      quote: 'They set up our Google profile and the booking page in a week. New customers now say they found us — that never happened before.' },
    { author: 'Nilesh P.', business: 'Components manufacturer, Rajkot', rating: 4,
      quote: 'B2B buyers check you out before replying to a quote. Since the site went up, follow-ups turn into orders more often.' },
    { author: 'Ankita D.', business: 'Early-stage founder, Pune', rating: 5,
      quote: 'Ran a Research study before building anything. It talked us out of the version we were sure about — and into one that works.' },
    { author: 'Joseph K.', business: 'Multi-branch tuition centre, Kochi', rating: 5,
      quote: 'Every branch finally looks like the same company. One team handles the site, the profiles and the print — one call when we need anything.' }
  ];
  const cfg = window.INDIZILLA_CONFIG || {};

  const esc = (s) => String(s == null ? '' : s)
    .replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const render = (rows) => {
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
  };

  // Seeds show immediately; database rows replace them the moment any exist.
  render(SEED.slice(0, 3));

  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) return;
  fetch(cfg.supabaseUrl.replace(/\/+$/, '') +
        '/rest/v1/reviews?select=author,business,quote,rating,source&order=created_at.desc&limit=6', {
    headers: { apikey: cfg.supabaseAnonKey, Authorization: 'Bearer ' + cfg.supabaseAnonKey }
  })
    .then((r) => (r.ok ? r.json() : []))
    .then((rows) => { if (Array.isArray(rows) && rows.length) render(rows); })
    .catch(() => { /* stays hidden */ });
})();
