// Indizilla — callback request form, on the visiting-card page (/ANC).
//
// Someone standing with the card in hand should not have to compose a message.
// They leave a name and a number, pick why, and the pressure is off — Ashish
// calls them. The escape hatches (call now, save the contact) stay visible the
// whole time, because a form must never feel like the only door.
//
// Delivery, in order of preference:
//   1. Supabase REST insert into `callback_requests` (anon INSERT-only policy,
//      see supabase/migration.sql). No SDK needed — one fetch.
//   2. If that fails for any reason — table not migrated yet, network, RLS —
//      a prefilled mailto to hi@indizilla.com opens instead. The visitor's
//      details are never lost to a failed request they can't see.
window.Callback = (() => {
  const cfg = window.INDIZILLA_CONFIG || {};
  const $ = (id) => document.getElementById(id);

  const state = { intent: 'callback' };

  function setIntent(intent) {
    state.intent = intent;
    document.querySelectorAll('.cbf-tab').forEach((b) => {
      const on = b.dataset.intent === intent;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    const note = $('cbf-note');
    if (note) {
      note.textContent = intent === 'promo'
        ? 'We call you, understand your use case, and shape a voucher to it — made for your business, not a generic percent-off. First 50 businesses onboarded from this card.'
        : 'Leave your number and expect a call back within one business day. A conversation, not a pitch.';
    }
    const btn = $('cbf-submit');
    if (btn) btn.innerHTML = (intent === 'promo' ? 'Get my promo code' : 'Ask for a callback') +
      ' <span class="arrow">↗</span>';
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

  function mailtoFallback(record) {
    const subject = record.intent === 'promo'
      ? 'Promo code request (from the card)'
      : 'Callback request (from the card)';
    const body = [
      'Name: ' + record.name,
      'Phone: ' + record.phone,
      record.email ? 'Email: ' + record.email : null,
      record.context ? 'Context: ' + record.context : null,
      'Request: ' + (record.intent === 'promo' ? 'promo code (first 50)' : 'callback')
    ].filter(Boolean).join('\n');
    window.location.href = 'mailto:hi@indizilla.com?subject=' +
      encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  }

  async function submit(ev) {
    ev.preventDefault();
    const name = $('cbf-name').value.trim();
    const phone = $('cbf-phone').value.trim();
    if (!name || !phone) {
      (!name ? $('cbf-name') : $('cbf-phone')).focus();
      return;
    }
    const record = {
      name,
      phone,
      email: $('cbf-email').value.trim() || null,
      context: $('cbf-context').value.trim() || null,
      intent: state.intent,
      // Which page produced the lead — /ANC by default, overridden per page.
      source: document.body.dataset.cbfSource || 'ANC'
    };

    const btn = $('cbf-submit');
    btn.disabled = true;
    btn.textContent = 'Sending…';

    let delivered = false;
    try { delivered = await submitToSupabase(record); } catch (e) { delivered = false; }

    const done = $('cbf-done');
    if (delivered) {
      $('cbf-form').hidden = true;
      done.hidden = false;
      done.querySelector('h3').textContent = state.intent === 'promo'
        ? 'You’re in the queue.'
        : 'Done — expect a call.';
      done.querySelector('p').textContent = state.intent === 'promo'
        ? 'Ashish will call ' + phone + ', talk through your use case, and put together your voucher. Nothing else to do.'
        : 'Ashish will call ' + phone + ' within one business day. Nothing else to do.';
    } else {
      // The request could not be recorded — hand the same details to their mail
      // app instead, and say so honestly rather than faking a success screen.
      mailtoFallback(record);
      btn.disabled = false;
      setIntent(state.intent);   // restores the button label
      const note = $('cbf-note');
      if (note) { note.hidden = false; } // contact keeps it hidden until needed
      if (note) note.textContent =
        'Your email app should have opened with everything filled in — press send there. ' +
        'If it didn’t, call or email directly using the details above.';
    }
  }

  function init() {
    const form = $('cbf-form');
    if (!form) return;
    document.querySelectorAll('.cbf-tab').forEach((b) =>
      b.addEventListener('click', () => setIntent(b.dataset.intent)));
    form.addEventListener('submit', submit);
    setIntent('callback');
    // Arriving via the promo button preselects the promo intent.
    if (location.hash === '#promo') setIntent('promo');
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();

  return { setIntent };
})();
