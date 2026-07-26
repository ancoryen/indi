// Indizilla platform — super admin console.
// Full visibility and edit rights: jobs, alerts, bills, clients, credits, coupons.

(async () => {
  const user = await Auth.requireLogin();
  if (!user) return;
  if (!DB.isAdmin(user)) { window.location.href = 'dashboard.html'; return; }

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const dateVal = (iso) => new Date(iso).toISOString().slice(0, 10);

  $('logout-top').addEventListener('click', Auth.logout);

  document.querySelectorAll('.dash-tab[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.dash-tab').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.dash-panel').forEach(p => { p.hidden = p.id !== 'panel-' + btn.dataset.tab; });
    });
  });

  const STATUSES = ['queued', 'in-progress', 'review', 'delivered'];

  /* ---- alerts ---- */
  function renderAlerts() {
    const alerts = DB.jobAlerts();
    $('alert-count').textContent = alerts.length;
    const label = { delayed: 'Delayed', issue: 'Issue', 'due-soon': 'Due soon' };
    $('alerts').innerHTML = alerts.length
      ? alerts.map(a => `
        <div class="alert-item alert-${a.level}">
          <span class="alert-tag">${label[a.level]}</span>
          <span>${esc(a.text)}</span>
        </div>`).join('')
      : '<div class="alert-item"><span class="alert-tag" style="background:var(--accent-tint); color:var(--accent-ink);">All clear</span><span>No delays, no open issues. Nothing on fire.</span></div>';
  }

  /* ---- job sheet ---- */
  function renderJobs() {
    const jobs = DB.allJobs();
    const now = Date.now();
    $('jobs-list').innerHTML = jobs.length
      ? jobs.map((j) => {
        const client = DB.getUser(j.userId) || {};
        const overdue = j.status !== 'delivered' && new Date(j.dueAt).getTime() < now;
        const openIssues = j.issues.filter(i => i.open);
        return `
        <div class="job-row" data-job="${j.id}">
          <div>
            <div class="row-title" style="font-size:14px;">${esc(j.serviceName)}</div>
            <div class="row-sub">${esc(client.name || client.email || 'Client')} · ordered ${fmtDate(j.createdAt)}</div>
            ${openIssues.map(i => `<div class="row-sub" style="color:#B26A00;">⚠ ${esc(i.text)} <button class="btn-mini" data-resolve="${i.id}" style="margin-left:6px; padding:2px 10px;">Resolve</button></div>`).join('')}
          </div>
          <div>
            <select data-status>${STATUSES.map(s => `<option value="${s}" ${s === j.status ? 'selected' : ''}>${s}</option>`).join('')}</select>
          </div>
          <div>
            <input type="date" data-due value="${dateVal(j.dueAt)}">
            <div style="margin-top:6px;"><span class="status-pill ${overdue ? 'overdue' : ''}">${j.status === 'delivered' ? 'Delivered' : overdue ? 'OVERDUE' : Math.ceil((new Date(j.dueAt) - now) / 86400000) + 'd left'}</span></div>
          </div>
          <div>
            <button class="btn-mini" data-issue>+ Issue</button>
          </div>
        </div>`;
      }).join('')
      : '<p style="font-size:14px; color:var(--text-muted);">No jobs yet — they appear automatically when clients order.</p>';
  }

  $('jobs-list').addEventListener('change', async (e) => {
    const row = e.target.closest('[data-job]');
    if (!row) return;
    if (e.target.matches('[data-status]')) await DB.updateJob(row.dataset.job, { status: e.target.value });
    if (e.target.matches('[data-due]')) await DB.updateJob(row.dataset.job, { dueAt: new Date(e.target.value + 'T18:00:00').toISOString() });
    renderAlerts(); renderJobs();
  });

  $('jobs-list').addEventListener('click', async (e) => {
    const row = e.target.closest('[data-job]');
    if (!row) return;
    if (e.target.matches('[data-issue]')) {
      const text = window.prompt('Describe the issue (visible only to admins):');
      if (text && text.trim()) { await DB.addJobIssue(row.dataset.job, text.trim()); renderAlerts(); renderJobs(); }
    }
    const res = e.target.closest('[data-resolve]');
    if (res) { await DB.resolveJobIssue(row.dataset.job, res.dataset.resolve); renderAlerts(); renderJobs(); }
  });

  /* ---- bills ---- */
  function renderBills() {
    $('bills-list').innerHTML = Bills.rowsHtml(DB.allBills(), { showUser: true });
  }
  Bills.bindList($('bills-list'));

  /* ---- clients ---- */
  function renderUsers() {
    const tbody = $('users-table').querySelector('tbody');
    const users = DB.listUsers();
    tbody.innerHTML = users.length
      ? users.map(u => `
        <tr data-user="${u.id}">
          <td>
            <strong>${esc(u.name || '—')}</strong>${DB.isAdmin(u) ? ' <span class="status-pill">admin</span>' : ''}<br>
            <span style="font-size:12px; color:var(--text-muted);">${esc(u.email)}${u.business ? ' · ' + esc(u.business) : ''}</span>
          </td>
          <td>${DB.ordersFor(u.id).length}</td>
          <td><strong>${DB.inrRaw(DB.creditBalance(u.id))}</strong></td>
          <td style="white-space:nowrap;">
            <input type="number" data-amt placeholder="±₹" style="width:90px;">
            <button class="btn-mini" data-adjust>Apply</button>
          </td>
        </tr>`).join('')
      : '<tr><td colspan="4" style="color:var(--text-muted);">No clients yet.</td></tr>';
  }

  $('users-table').addEventListener('click', async (e) => {
    if (!e.target.matches('[data-adjust]')) return;
    const row = e.target.closest('[data-user]');
    const amt = parseInt(row.querySelector('[data-amt]').value, 10);
    if (!amt) return;
    await DB.addCredit(row.dataset.user, amt, 'Admin adjustment');
    renderUsers();
  });

  /* ---- coupons ---- */
  function renderCoupons() {
    $('coupons-admin').innerHTML = DB.listAllCoupons().map(c => `
      <div class="row-item">
        <div>
          <code style="font-weight:700; font-size:13px;">${esc(c.code)}</code>
          <span class="status-pill" style="margin-left:8px; ${c.active === false ? '' : 'background:var(--accent-tint); color:var(--accent-ink);'}">${c.active === false ? 'off' : 'active'}</span>
          <div style="font-size:12px; color:var(--text-muted); margin-top:3px;">${esc(c.desc || '')} · ${c.type === 'percent' ? c.value + '%' : DB.inrRaw(c.value)}${c.minAmount ? ' · min ' + DB.inrRaw(c.minAmount) : ''}${c.maxDiscount ? ' · cap ' + DB.inrRaw(c.maxDiscount) : ''}</div>
        </div>
        <button class="btn-mini" data-toggle="${esc(c.code)}">${c.active === false ? 'Enable' : 'Disable'}</button>
      </div>`).join('');
  }

  $('coupons-admin').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-toggle]');
    if (!btn) return;
    const c = DB.listAllCoupons().find(x => x.code === btn.dataset.toggle);
    await DB.setCouponActive(btn.dataset.toggle, c.active === false);
    renderCoupons();
  });

  $('c-save').addEventListener('click', async () => {
    const r = await DB.upsertCoupon({
      code: $('c-code').value,
      type: $('c-type').value,
      value: parseInt($('c-value').value, 10) || 0,
      minAmount: parseInt($('c-min').value, 10) || 0,
      maxDiscount: parseInt($('c-max').value, 10) || 0,
      desc: $('c-desc').value.trim(),
      active: true
    });
    const msg = $('c-msg');
    msg.textContent = r.ok ? 'Coupon saved.' : r.error;
    msg.hidden = false;
    setTimeout(() => { msg.hidden = true; }, 2500);
    if (r.ok) { ['c-code', 'c-value', 'c-min', 'c-max', 'c-desc'].forEach(id => { $(id).value = ''; }); renderCoupons(); }
  });

  renderAlerts();
  renderJobs();
  renderBills();
  renderUsers();
  renderCoupons();

  // Research admin tab (js/research-admin.js) — optional, isolated module.
  if (window.ResearchAdmin) { try { await window.ResearchAdmin.init(user); } catch (e) { /* research admin unavailable */ } }
})();
