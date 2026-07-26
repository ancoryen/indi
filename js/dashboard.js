// Indizilla platform — dashboard page logic.

(async () => {
  const user = await Auth.requireLogin();
  if (!user) return;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  $('u-first').textContent = (user.name || 'there').split(' ')[0];
  $('logout-top').addEventListener('click', Auth.logout);
  $('logout-btn').addEventListener('click', Auth.logout);
  if (DB.isAdmin(user)) $('admin-link').hidden = false;

  /* ---- tabs ---- */
  document.querySelectorAll('.dash-tab[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.dash-tab').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.dash-panel').forEach(p => { p.hidden = p.id !== 'panel-' + btn.dataset.tab; });
    });
  });

  /* ---- bills ---- */
  function renderBills() {
    $('bills-list').innerHTML = Bills.rowsHtml(DB.billsFor(user.id));
  }
  Bills.bindList($('bills-list'));

  /* ---- overview ---- */
  function renderCredits() {
    const bal = DB.creditBalance(user.id);
    $('credit-balance').textContent = DB.inrRaw(bal);
    $('credits-available').textContent = DB.inrRaw(bal);
    $('credits-row').hidden = bal <= 0;
  }

  function renderOrders() {
    const orders = DB.ordersFor(user.id);
    $('orders-list').innerHTML = orders.length
      ? orders.map(o => `
        <div class="row-item">
          <div>
            <div class="row-title">${esc(o.serviceName)}</div>
            <div class="row-sub">${fmtDate(o.createdAt)}${o.couponCode ? ' · coupon ' + esc(o.couponCode) : ''}${o.creditsUsed ? ' · ' + DB.inr(o.creditsUsed) + ' credits used' : ''}</div>
          </div>
          <div style="text-align:right;">
            <div class="row-title">${DB.inr(o.payable)}</div>
            <div class="row-sub status-paid">Paid</div>
          </div>
        </div>`).join('')
      : '<p style="font-size:14px; color:var(--text-muted);">No orders yet. Your first one is a tab away.</p>';
  }

  function renderCreditHistory() {
    const hist = DB.creditHistory(user.id);
    $('credit-history').innerHTML = hist.length
      ? hist.map(e => `
        <div class="row-item">
          <div>
            <div class="row-title" style="font-size:14px;">${esc(e.reason)}</div>
            <div class="row-sub">${fmtDate(e.date)}</div>
          </div>
          <strong style="color:${e.amount > 0 ? 'var(--accent-ink)' : 'var(--text-soft)'};">${e.amount > 0 ? '+' : ''}${DB.inrRaw(e.amount)}</strong>
        </div>`).join('')
      : '<p style="font-size:14px; color:var(--text-muted);">Nothing yet — referral bonuses and redemptions show up here.</p>';
  }

  function renderCoupons() {
    $('coupon-list').innerHTML = DB.listCoupons().map(c => `
      <div style="margin-bottom:10px;">
        <code style="font-weight:700; font-size:13px;">${esc(c.code)}</code>
        <div style="font-size:13px; color:var(--text-soft);">${esc(c.desc)}</div>
      </div>`).join('');
  }

  /* ---- order & checkout ---- */
  const state = { service: null, coupon: null, discount: 0, useCredits: false };

  const sel = $('svc-select');
  DB.SERVICES.forEach((s) => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = `${s.name} — ${DB.inr(s.price)}${s.monthly ? '/month' : ''}`;
    sel.appendChild(opt);
  });

  function currentService() { return DB.SERVICES.find(s => s.id === sel.value); }

  function recalc() {
    const svc = currentService();
    state.service = svc;
    const bal = DB.creditBalance(user.id);
    const price = svc.price;

    // re-validate coupon against the selected service price
    if (state.coupon) {
      const v = DB.validateCoupon(state.coupon.code, price);
      if (v.ok) { state.discount = v.discount; }
      else { state.coupon = null; state.discount = 0; $('coupon-msg').textContent = v.error; $('coupon-msg').style.color = 'var(--text-muted)'; }
    }

    const afterCoupon = price - state.discount;
    const creditsUsed = state.useCredits ? Math.min(bal, afterCoupon) : 0;
    const payable = afterCoupon - creditsUsed;

    $('sum-service').textContent = svc.name + (svc.monthly ? ' (first month)' : '');
    $('sum-price').textContent = DB.inr(price);
    $('sum-discount-row').hidden = state.discount <= 0;
    $('sum-discount').textContent = '−' + DB.inr(state.discount);
    $('sum-credits-row').hidden = creditsUsed <= 0;
    $('sum-credits').textContent = '−' + DB.inr(creditsUsed);
    $('sum-total').textContent = DB.inr(payable);
    $('monthly-note').hidden = !svc.monthly;
    $('pay-btn').textContent = payable > 0 ? 'Pay ' + DB.inr(payable) + ' with Razorpay' : 'Complete order with credits';

    state.creditsUsed = creditsUsed;
    state.payable = payable;
  }

  sel.addEventListener('change', recalc);
  $('use-credits').addEventListener('change', (e) => { state.useCredits = e.target.checked; recalc(); });

  $('apply-coupon').addEventListener('click', () => {
    const code = $('coupon-input').value;
    const v = DB.validateCoupon(code, currentService().price);
    const msg = $('coupon-msg');
    if (v.ok) {
      state.coupon = v.coupon;
      msg.textContent = '✓ ' + v.coupon.desc;
      msg.style.color = 'var(--accent-ink)';
    } else {
      state.coupon = null;
      msg.textContent = v.error;
      msg.style.color = 'var(--text-muted)';
    }
    recalc();
  });

  $('pay-btn').addEventListener('click', () => {
    recalc();
    const svc = state.service;
    Payments.pay({
      amount: state.payable,
      description: svc.name + (svc.monthly ? ' (monthly)' : ''),
      user,
      onSuccess: async ({ paymentId, method }) => {
        await DB.createOrder({
          userId: user.id, serviceId: svc.id, serviceName: svc.name,
          amount: svc.price, discount: state.discount,
          couponCode: state.coupon ? state.coupon.code : null,
          creditsUsed: state.creditsUsed, payable: state.payable,
          paymentId, method
        });
        state.coupon = null; state.discount = 0; state.useCredits = false;
        $('coupon-input').value = ''; $('coupon-msg').textContent = ''; $('use-credits').checked = false;
        renderAll();
        document.querySelector('.dash-tab[data-tab="overview"]').click();
      }
    });
  });

  /* ---- referrals ---- */
  function renderReferrals() {
    const eligible = DB.isEligibleReferrer(user.id);
    $('referral-locked').hidden = eligible;
    $('referral-open').hidden = !eligible;
    $('ref-quarter').textContent = DB.quarterKey();
    $('ref-count').textContent = DB.creditedThisQuarter(user.id);

    if (eligible) {
      const code = DB.ensureReferralCode(user.id);
      $('ref-code').textContent = code;
      $('ref-link').value = (window.INDIZILLA_CONFIG.siteUrl || location.origin) + '/login.html?ref=' + code;
    }

    const refs = DB.referralsBy(user.id);
    $('referral-list').innerHTML = refs.length
      ? refs.map(r => `
        <div class="row-item">
          <div>
            <div class="row-title" style="font-size:14px;">${esc(r.newUserName || 'New client')}</div>
            <div class="row-sub">${fmtDate(r.date)} · ${r.quarter}</div>
          </div>
          <span class="row-sub" style="color:${r.credited ? 'var(--accent-ink)' : 'var(--text-muted)'};">${r.credited ? '+' + DB.inrRaw(DB.REFERRAL_BONUS) : 'Cap reached'}</span>
        </div>`).join('')
      : '<p style="font-size:14px; color:var(--text-muted);">No referrals yet. Share your link with a business owner you know.</p>';
  }

  function bindCopy(btnId, getText) {
    $(btnId).addEventListener('click', () => {
      navigator.clipboard.writeText(getText()).then(() => {
        $('copy-msg').hidden = false;
        setTimeout(() => { $('copy-msg').hidden = true; }, 2000);
      });
    });
  }
  bindCopy('copy-code', () => $('ref-code').textContent);
  bindCopy('copy-link', () => $('ref-link').value);

  /* ---- account ---- */
  $('acc-name').value = user.name || '';
  $('acc-business').value = user.business || '';
  $('acc-email').value = user.email || '';
  $('save-account').addEventListener('click', async () => {
    await DB.updateUser(user.id, { name: $('acc-name').value.trim(), business: $('acc-business').value.trim() });
    $('u-first').textContent = ($('acc-name').value.trim() || 'there').split(' ')[0];
    $('save-msg').hidden = false;
    setTimeout(() => { $('save-msg').hidden = true; }, 2000);
  });

  function renderAll() {
    renderCredits();
    renderOrders();
    renderCreditHistory();
    renderCoupons();
    renderBills();
    renderReferrals();
    recalc();
  }
  renderAll();

  // Research product tab (js/research-dash.js) — optional, isolated module.
  if (window.ResearchDash) { try { await window.ResearchDash.init(user); } catch (e) { /* research tab unavailable */ } }
})();
