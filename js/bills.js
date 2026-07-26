// Indizilla platform — printable bill viewer, shared by dashboard and admin.

window.Bills = (() => {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

  function open(billId) {
    const bill = DB.getBill(billId);
    if (!bill) return;
    const user = DB.getUser(bill.userId) || { name: '', email: '', business: '' };

    const overlay = document.createElement('div');
    overlay.className = 'bill-overlay';
    overlay.innerHTML = `
      <div class="bill-doc">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:16px;">
          <div>
            <img src="assets/logo-mark-black.png" alt="Indizilla" style="width:44px; height:44px; object-fit:contain;">
            <div style="font-family:var(--font-disp); font-weight:800; letter-spacing:-0.02em; margin-top:8px;">INDIZILLA</div>
            <div style="font-size:12px; color:#8C8F91;">indizilla.com · hello@indizilla.com</div>
          </div>
          <div style="text-align:right;">
            <div style="font-family:var(--font-disp); font-weight:800; font-size:20px;">${esc(bill.number)}</div>
            <div style="font-size:13px; color:#8C8F91;">${fmtDate(bill.date)}</div>
            <div style="font-size:12px; font-weight:700; color:#1E7A45; margin-top:4px;">PAID</div>
          </div>
        </div>

        <div style="margin-top:26px; font-size:14px;">
          <div style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; color:#8C8F91; margin-bottom:4px;">Billed to</div>
          <strong>${esc(user.name || '—')}</strong>${user.business ? ' · ' + esc(user.business) : ''}<br>
          <span style="color:#3A3D40;">${esc(user.email || '')}</span>
        </div>

        <div class="bill-rows">
          ${bill.items.map(i => `<div class="sum-line"><span>${esc(i.label)}</span><strong>${DB.inrRaw(i.amount)}</strong></div>`).join('')}
          ${bill.discount ? `<div class="sum-line"><span>Coupon${bill.couponCode ? ' (' + esc(bill.couponCode) + ')' : ''}</span><strong>−${DB.inrRaw(bill.discount)}</strong></div>` : ''}
          ${bill.creditsUsed ? `<div class="sum-line"><span>Credits redeemed</span><strong>−${DB.inrRaw(bill.creditsUsed)}</strong></div>` : ''}
          <div class="sum-line bill-total"><span>Total paid</span><strong>${DB.inrRaw(bill.total)}</strong></div>
        </div>

        <div style="font-size:12px; color:#8C8F91; line-height:1.6;">
          Payment method: ${esc(bill.method)}${bill.paymentId ? ' · Ref: ' + esc(bill.paymentId) : ''}<br>
          This is a system-generated bill. For GST details or corrections, write to hello@indizilla.com.
        </div>

        <div class="bill-actions" style="display:flex; gap:10px; margin-top:26px;">
          <button class="btn btn-primary" type="button" data-print>Print / Save PDF</button>
          <button class="btn btn-secondary" type="button" data-close>Close</button>
        </div>
      </div>`;

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.closest('[data-close]')) close();
      if (e.target.closest('[data-print]')) window.print();
    });
    function close() {
      overlay.remove();
      document.body.classList.remove('bill-open');
    }
    document.body.appendChild(overlay);
    document.body.classList.add('bill-open');
  }

  function rowsHtml(bills, { showUser } = {}) {
    if (!bills.length) return '<p style="font-size:14px; color:var(--text-muted);">No bills yet — they appear automatically with your first order.</p>';
    return bills.map(b => {
      const u = showUser ? (DB.getUser(b.userId) || {}) : null;
      return `
      <div class="row-item">
        <div>
          <div class="row-title" style="font-size:14px;">${esc(b.number)}</div>
          <div class="row-sub">${new Date(b.date).toLocaleDateString('en-IN')} · ${esc(b.items[0].label)}${u ? ' · ' + esc(u.name || u.email || '') : ''}</div>
        </div>
        <div style="display:flex; align-items:center; gap:12px;">
          <strong>${DB.inrRaw(b.total)}</strong>
          <button class="btn-mini" type="button" data-bill="${b.id}">View</button>
        </div>
      </div>`;
    }).join('');
  }

  function bindList(container) {
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-bill]');
      if (btn) open(btn.dataset.bill);
    });
  }

  return { open, rowsHtml, bindList };
})();
