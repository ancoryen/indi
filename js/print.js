// Indizilla — the print & merch quote list.
//
// Marketplace-lite, deliberately. Print pricing turns on quantity, material
// and finish, so a fixed-price checkout would quote a number the invoice
// couldn't honour. Instead: browse, collect items into a quote list
// (localStorage, survives the visit), send one enquiry for the lot.
//
// Delivery reuses the callback pipeline: a Supabase insert into
// `callback_requests` with source 'PRINT' and the item list in `context`,
// falling back to a prefilled mailto when the insert fails. One table, one
// operational queue, one fallback path to maintain.
window.PrintQuote = (() => {
  const cfg = window.INDIZILLA_CONFIG || {};
  const KEY = 'indizilla_print_quote';
  const $ = (id) => document.getElementById(id);

  let items = [];
  try { items = JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { items = []; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) { /* private mode */ } };

  function renderList() {
    const list = $('pq-list'), empty = $('pq-empty');
    if (!list) return;
    list.innerHTML = items.map((it, i) =>
      '<li><span>' + it.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])) +
      '</span><button type="button" class="pq-remove" data-i="' + i + '" aria-label="Remove ' +
      it.replace(/"/g, '') + '">×</button></li>').join('');
    empty.hidden = items.length > 0;
    list.querySelectorAll('.pq-remove').forEach((b) =>
      b.addEventListener('click', () => { items.splice(Number(b.dataset.i), 1); save(); renderList(); syncButtons(); }));
  }

  function syncButtons() {
    document.querySelectorAll('.print-card').forEach((card) => {
      const name = card.dataset.item;
      const btn = card.querySelector('.pc-add');
      const inList = items.includes(name);
      btn.textContent = inList ? 'Added ✓' : 'Add to quote';
      btn.classList.toggle('is-added', inList);
    });
  }

  async function submitToSupabase(record) {
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) return false;
    const res = await fetch(cfg.supabaseUrl.replace(/\/+$/, '') + '/rest/v1/callback_requests', {
      method: 'POST',
      headers: {
        apikey: cfg.supabaseAnonKey,
        Authorization: 'Bearer ' + cfg.supabaseAnonKey,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(record)
    });
    return res.ok;
  }

  async function submit(ev) {
    ev.preventDefault();
    const name = $('pq-name').value.trim();
    const phone = $('pq-phone').value.trim();
    if (!name || !phone) { (!name ? $('pq-name') : $('pq-phone')).focus(); return; }

    const notes = $('pq-notes').value.trim();
    const context = 'Print quote — items: ' + (items.length ? items.join('; ') : '(described in notes)') +
      (notes ? ' | Notes: ' + notes : '');
    const record = {
      name, phone,
      email: $('pq-email').value.trim() || null,
      context,
      intent: 'callback',
      source: 'PRINT'
    };

    const btn = $('pq-submit');
    btn.disabled = true;
    btn.textContent = 'Sending…';

    let delivered = false;
    try { delivered = await submitToSupabase(record); } catch (e) { delivered = false; }

    if (delivered) {
      $('pq-form').hidden = true;
      const done = $('pq-done');
      done.hidden = false;
      done.querySelector('p').textContent =
        'We call ' + phone + ' with one quote covering everything on the list — quantities, materials and timelines included.';
      items = []; save(); renderList(); syncButtons();
    } else {
      // Never a fake success: hand the same enquiry to their mail app and say so.
      window.location.href = 'mailto:hi@indizilla.com?subject=' +
        encodeURIComponent('Print & merch quote') + '&body=' +
        encodeURIComponent('Name: ' + name + '\nPhone: ' + phone +
          (record.email ? '\nEmail: ' + record.email : '') + '\n' + context);
      btn.disabled = false;
      btn.innerHTML = 'Get my quote <span class="arrow">↗</span>';
      $('pq-empty').hidden = false;
      $('pq-empty').textContent =
        'Your email app should have opened with the enquiry filled in — press send there. If it didn’t, write to hi@indizilla.com.';
    }
  }

  function init() {
    if (!$('pq-form')) return;
    document.querySelectorAll('.print-card .pc-add').forEach((btn) =>
      btn.addEventListener('click', () => {
        const name = btn.closest('.print-card').dataset.item;
        if (!items.includes(name)) items.push(name); else items.splice(items.indexOf(name), 1);
        save(); renderList(); syncButtons();
      }));
    $('pq-form').addEventListener('submit', submit);
    renderList();
    syncButtons();
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();

  return { get items() { return items.slice(); } };
})();
