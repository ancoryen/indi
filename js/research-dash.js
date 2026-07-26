// Indizilla Research — dashboard tab (balance, buy packs, studies, ledger).
// Loaded on dashboard.html; initialised by dashboard.js after auth.

window.ResearchDash = (() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const VERDICT = {
    go: { cls: 'verdict-go', label: 'Go' },
    conditional: { cls: 'verdict-conditional', label: 'Conditional' },
    no: { cls: 'verdict-no', label: 'Reconsider' }
  };

  async function init(user) {
    await renderBalance();
    await renderPacks(user);
    await renderStudies();
    await renderLedger();

    // Deep link from pricing "Buy" buttons: research-pricing → dashboard.html#research
    if (location.hash === '#research') {
      const btn = document.querySelector('.dash-tab[data-tab="research"]');
      if (btn) btn.click();
    }
  }

  async function renderBalance() {
    try { $('rd-balance').textContent = await RDB.balance(); }
    catch (e) { $('rd-balance').textContent = '0'; }
  }

  async function renderPacks(user) {
    let packs = [];
    try { packs = await RDB.packs(); } catch (e) { packs = []; }
    $('rd-packs').innerHTML = packs.map(p => `
      <div class="rd-pack${p.popular ? ' is-pop' : ''}">
        ${p.popular ? '<span class="rd-pop">Popular</span>' : ''}
        <div class="rd-pack-name">${esc(p.name)}</div>
        <div class="rd-pack-credits">${p.credits} credits</div>
        <button class="btn btn-secondary btn-sm rd-buy" data-pack="${esc(p.id)}" data-price="${p.price_inr}" data-credits="${p.credits}" data-name="${esc(p.name)}">${DB.inr(p.price_inr)}</button>
      </div>`).join('');

    // Buy flow (Razorpay → buy_research_credits). Bind once.
    if (!$('rd-packs').dataset.bound) {
      $('rd-packs').dataset.bound = '1';
      $('rd-packs').addEventListener('click', (e) => {
        const btn = e.target.closest('.rd-buy'); if (!btn) return;
        const d = btn.dataset;
        Payments.pay({
          amount: +d.price,
          description: 'Indizilla Research credits — ' + d.name + ' (' + d.credits + ')',
          user,
          onSuccess: async ({ paymentId }) => {
            try {
              const r = await RDB.buyCredits(d.pack, paymentId);
              showBuyMsg('✓ ' + (r.credits || d.credits) + ' credits added.', true);
              await renderBalance(); await renderLedger();
            } catch (err) {
              showBuyMsg('Payment succeeded but crediting failed: ' + (err.message || 'contact support.'), false);
            }
          },
          onFailure: () => showBuyMsg('Payment cancelled.', false)
        });
      });
    }
  }

  function showBuyMsg(text, ok) {
    const m = $('rd-buy-msg');
    m.textContent = text; m.hidden = false;
    m.style.color = ok ? 'var(--accent-ink)' : 'var(--text-muted)';
    setTimeout(() => { m.hidden = true; }, 4000);
  }

  async function renderStudies() {
    let studies = [];
    try { studies = await RDB.studies(); } catch (e) { studies = []; }
    $('rd-studies').innerHTML = studies.length
      ? studies.map(s => {
        const m = RDB.modeById(s.mode);
        const v = s.status === 'ready' && s.memo && s.memo.verdict ? VERDICT[s.memo.verdict] : null;
        return `
        <a class="row-item rd-study" href="research-report.html?id=${encodeURIComponent(s.id)}">
          <div>
            <div class="row-title" style="font-size:14px;">${esc(s.title)}</div>
            <div class="row-sub">${fmtDate(s.created_at)} · ${esc(m.name)} · ${s.credits_cost} credits</div>
          </div>
          <div style="text-align:right;">
            ${v ? `<span class="memo-verdict ${v.cls}" style="font-size:11px; padding:3px 10px;">${v.label}</span>`
                : `<span class="status-pill">${esc(s.status)}</span>`}
          </div>
        </a>`;
      }).join('')
      : '<p style="font-size:14px; color:var(--text-muted);">No studies yet. <a href="research-new.html" style="color:var(--accent-ink); font-weight:600;">Start your first →</a></p>';
  }

  async function renderLedger() {
    let led = [];
    try { led = await RDB.ledger(); } catch (e) { led = []; }
    $('rd-ledger').innerHTML = led.length
      ? led.map(e => `
        <div class="row-item">
          <div>
            <div class="row-title" style="font-size:14px;">${esc(e.reason)}</div>
            <div class="row-sub">${fmtDate(e.at)}</div>
          </div>
          <strong style="color:${e.amount > 0 ? 'var(--accent-ink)' : 'var(--text-soft)'};">${e.amount > 0 ? '+' : ''}${e.amount} cr</strong>
        </div>`).join('')
      : '<p style="font-size:14px; color:var(--text-muted);">Purchases and study spends show up here.</p>';
  }

  return { init };
})();
