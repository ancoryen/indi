// Indizilla Research — admin tab (all studies overview + adjust study credits).
// Loaded on admin.html; initialised by admin.js after the admin check passes.

window.ResearchAdmin = (() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const VERDICT = { go: 'verdict-go', conditional: 'verdict-conditional', no: 'verdict-no' };
  const VLABEL = { go: 'Go', conditional: 'Conditional', no: 'Reconsider' };

  async function init(user) {
    // Client picker — reuse the admin's already-loaded profiles.
    const users = DB.listUsers();
    const byId = {};
    users.forEach(u => { byId[u.id] = u; });
    $('ra-user').innerHTML = users.map(u => `<option value="${esc(u.id)}">${esc(u.name || u.email)}</option>`).join('')
      || '<option value="">No clients</option>';

    await renderStudies(byId);

    $('ra-apply').addEventListener('click', async () => {
      const uid = $('ra-user').value;
      const amt = parseInt($('ra-amt').value, 10);
      const msg = $('ra-msg');
      if (!uid || !amt) { return; }
      try {
        await RDB.adminAdjust(uid, amt, $('ra-reason').value.trim() || 'Admin adjustment');
        msg.textContent = 'Applied ' + (amt > 0 ? '+' : '') + amt + ' credits.';
        msg.style.color = 'var(--accent-ink)';
        msg.hidden = false;
        $('ra-amt').value = ''; $('ra-reason').value = '';
        setTimeout(() => { msg.hidden = true; }, 3000);
      } catch (err) {
        msg.textContent = 'Could not adjust: ' + (err.message || 'try again.');
        msg.style.color = 'var(--text-muted)';
        msg.hidden = false;
      }
    });
  }

  async function renderStudies(byId) {
    let studies = [];
    try { studies = await RDB.allStudies(); } catch (e) { studies = []; }
    const tbody = $('rstudies-table').querySelector('tbody');
    tbody.innerHTML = studies.length
      ? studies.map(s => {
        const u = byId[s.userId] || {};
        const m = RDB.modeById(s.mode);
        const ready = s.status === 'ready' && s.memo && s.memo.verdict;
        return `
        <tr>
          <td><strong>${esc(s.title)}</strong><br><span style="font-size:12px; color:var(--text-muted);">${fmtDate(s.created_at)}</span></td>
          <td><span style="font-size:13px;">${esc(u.name || u.email || s.userId.slice(0, 8))}</span></td>
          <td>${esc(m.name)}</td>
          <td>${s.credits_cost}</td>
          <td>${ready ? `<span class="memo-verdict ${VERDICT[s.memo.verdict]}" style="font-size:11px; padding:3px 10px;">${VLABEL[s.memo.verdict]}</span>` : `<span class="status-pill">${esc(s.status)}</span>`}</td>
        </tr>`;
      }).join('')
      : '<tr><td colspan="5" style="color:var(--text-muted);">No studies yet.</td></tr>';
  }

  return { init };
})();
