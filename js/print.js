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
      // Stored lines may carry a quantity suffix ('Visiting cards × 500 (…)').
      const inList = items.some((i) => i === name || i.startsWith(name + ' ×'));
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


  /* ---- indicative price bands -------------------------------------------
     VistaPrint converts because a buyer sees a number before committing.
     These bands give that moment honestly: a range from our own quantity
     breaks, labelled indicative, with the quote as the confirmed figure.
     Unit prices fall as quantity rises; the band is ±12% around the midpoint
     because material and finish move the real number. */
  const BANDS = {
    // Price-matched against leading online print shops' public list prices,
    // August 2026 — re-verify before any reprint of these numbers. Where we
    // were already at or under the market figure, the price stayed.
    'Visiting cards':                { unit: '100 cards', steps: { 100: 249, 250: 549, 500: 949, 1000: 1699 } },
    'T-shirts & branded merch':      { unit: 'pieces',    steps: { 10: 3490, 25: 7990, 50: 14490, 100: 26990 } },
    'Branded diaries & notebooks':   { unit: 'pieces',    steps: { 10: 2990, 25: 6740, 50: 12490, 100: 22990 } },
    'Letterheads & envelopes':       { unit: 'sheets',    steps: { 100: 749, 250: 1699, 500: 2999, 1000: 5399 } },
    'Bill books & receipt pads':     { unit: 'pads',      steps: { 5: 2995, 10: 5490, 25: 12490, 50: 22990 } },
    'Stickers & labels':             { unit: 'sheet sets',steps: { 5: 1495, 10: 2699, 25: 5999, 50: 10999 } },
    'Standees & banners':            { unit: 'pieces',    steps: { 1: 499, 3: 1299, 5: 1999, 10: 3699 } },
    'Business essentials kit':       { unit: 'kits',      steps: { 1: 499, 5: 2299, 10: 4299, 25: 9499 } }
  };
  const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
  const qty = {};   // item -> chosen quantity label

  function bandFor(name, q) {
    const spec = BANDS[name]; if (!spec) return null;
    const mid = spec.steps[q]; if (mid == null) return null;
    return inr(mid * 0.88) + '–' + inr(mid * 1.12);
  }

  function mountBands() {
    document.querySelectorAll('.print-card').forEach((card) => {
      const name = card.dataset.item;
      const spec = BANDS[name]; if (!spec) return;   // quoted-by-spec items stay as they are
      const row = document.createElement('div');
      row.className = 'pc-band';
      const sel = document.createElement('select');
      sel.setAttribute('aria-label', 'Quantity for ' + name);
      Object.keys(spec.steps).forEach((q) => {
        const o = document.createElement('option');
        o.value = q; o.textContent = q + ' ' + spec.unit;
        sel.appendChild(o);
      });
      const out = document.createElement('span');
      out.className = 'pc-band-out';
      const update = () => {
        qty[name] = sel.value;
        out.innerHTML = '≈ ' + bandFor(name, sel.value) + ' <small>indicative — quote confirms</small>';
      };
      sel.addEventListener('change', update);
      row.appendChild(sel); row.appendChild(out);
      card.insertBefore(row, card.querySelector('.pc-add'));
      update();
    });
  }
  mountBands();

  function init() {
    if (!$('pq-form')) return;
    document.querySelectorAll('.print-card .pc-add').forEach((btn) =>
      btn.addEventListener('click', () => {
        const base = btn.closest('.print-card').dataset.item;
        // Carry the chosen quantity and band into the quote line, so the call
        // starts from the number the visitor already saw.
        const name = qty[base]
          ? base + ' × ' + qty[base] + (bandFor(base, qty[base]) ? ' (≈ ' + bandFor(base, qty[base]) + ')' : '')
          : base;
        const existing = items.findIndex((i) => i === name || i.startsWith(base + ' ×') || i === base);
        if (existing === -1) items.push(name); else items.splice(existing, 1);
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
