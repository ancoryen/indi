// Indizilla Research — decision-memo report view + follow-up chat.

(async () => {
  const user = await Auth.requireLogin();
  if (!user) return;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  const VERDICT = {
    go: { cls: 'verdict-go', label: 'Go' },
    conditional: { cls: 'verdict-conditional', label: 'Conditional go' },
    no: { cls: 'verdict-no', label: 'Reconsider' }
  };

  const id = new URLSearchParams(location.search).get('id');
  let study = null;

  async function loadBalance() {
    try { $('rc-balance').textContent = await RDB.balance(); } catch (e) { $('rc-balance').textContent = '—'; }
  }

  if (!id) { $('report-state').textContent = 'No study specified.'; return; }
  try { study = await RDB.getStudy(id); } catch (e) { study = null; }

  if (!study) { $('report-state').innerHTML = 'Study not found. <a href="dashboard.html#research">Back to your studies</a>.'; return; }
  if (study.status !== 'ready' || !study.memo || !study.memo.verdict) {
    $('report-state').textContent = 'This study is still running. Refresh in a moment.';
    return;
  }

  await loadBalance();
  $('report-state').hidden = true;
  $('report-body').hidden = false;

  const memo = study.memo;
  const personas = study.personas || {};
  const v = VERDICT[memo.verdict] || VERDICT.conditional;
  const mode = RDB.modeById(study.mode);

  /* ---- Memo ---- */
  $('memo').innerHTML = `
    <header class="memo-head">
      <div class="memo-meta">Decision memo · ${esc(mode.name)} · ${personas.count || study.respondents} personas · ${fmtDate(study.created_at)}</div>
      <div class="memo-verdict ${v.cls}">${v.label}</div>
      <h1 class="memo-headline">${esc(memo.headline)}</h1>
      <p class="memo-sub">Decision tested: ${esc(study.decision_q || '—')}</p>
    </header>
    <div class="memo-stats">
      ${(memo.stats || []).map(s => `<div class="memo-stat"><div class="ms-num">${esc(s.value)}</div><div class="ms-lab">${esc(s.label)}</div></div>`).join('')}
    </div>
    <div class="memo-cols">
      <div class="memo-main">
        <h3>What the panel is telling you</h3>
        <p>${esc(memo.headline)} Confidence in this read is <strong>${esc(memo.confidence)}</strong>, based on ${personas.count || study.respondents} simulated responses to your survey.</p>
        <h3>The idea you tested</h3>
        <p>${esc(study.idea)}</p>
      </div>
      <aside class="memo-side">
        <div class="memo-box">
          <div class="mb-label">Strongest segment</div>
          <div class="mb-value">${esc((memo.segment || {}).name || '—')}</div>
          <div class="mb-pct">${(memo.segment || {}).pct != null ? memo.segment.pct + '% positive' : ''}</div>
        </div>
        <div class="memo-box warn">
          <div class="mb-label">Watch out for</div>
          <p>${esc(memo.objection)}</p>
        </div>
        <div class="memo-box next">
          <div class="mb-label">Recommended next test</div>
          <p>${esc(memo.nextTest)}</p>
        </div>
      </aside>
    </div>
    <footer class="memo-foot">
      <div><strong>Reading this memo:</strong> a simulated panel is a starting point, not the final word. Confirm the strongest signal with a small real-world test before you commit.</div>
    </footer>`;

  /* ---- v2 decision sections ----
     Studies carrying a decision graph get the sections a flat memo could not
     express: confidence that explains itself, a ranked objection table, what
     the decision rests on, unverified claims held apart, and the moves.
     Pre-v2 studies simply skip this and keep the memo above. */
  try {
    if (window.RDecision) RDecision.mount('decision-sections', study);
  } catch (e) {
    if (window.console) console.warn('[report] decision sections failed:', e);
  }

  /* ---- Response breakdown ---- */
  const mix = personas.mix || { positive: 0, neutral: 0, skeptical: 0 };
  const total = (mix.positive + mix.neutral + mix.skeptical) || 1;
  const pct = (n) => Math.round((n / total) * 100);
  $('mix-bar').innerHTML = `
    <span class="mix-seg pos" style="width:${pct(mix.positive)}%"></span>
    <span class="mix-seg neu" style="width:${pct(mix.neutral)}%"></span>
    <span class="mix-seg skep" style="width:${pct(mix.skeptical)}%"></span>`;
  $('mix-legend').innerHTML = `
    <span><i class="dot pos"></i> Positive ${pct(mix.positive)}%</span>
    <span><i class="dot neu"></i> Neutral ${pct(mix.neutral)}%</span>
    <span><i class="dot skep"></i> Skeptical ${pct(mix.skeptical)}%</span>
    <span class="mix-score">Mean intent ${esc(personas.avgScore != null ? personas.avgScore : '—')}/5</span>`;

  const shown = personas.shown || [];
  $('voices').innerHTML = shown.length
    ? '<h4 class="voices-h">Sample voices</h4>' + shown.map(p => `
        <blockquote class="memo-quote ${p.sentiment === 'positive' ? 'pos' : p.sentiment === 'neutral' ? 'neu' : 'skep'}">
          ${esc(p.quote)}<cite>— ${esc(p.name)}, ${esc(p.role)} · ${esc(p.score)}/5</cite>
        </blockquote>`).join('')
    : '';

  /* ---- Survey ---- */
  $('report-survey').innerHTML = (study.survey || []).map(q => `<li>${esc(q.text)} <span class="sq-type">${esc(q.type)}</span></li>`).join('');

  /* ---- Follow-ups ---- */
  function renderFollowups() {
    const fu = study.followups || [];
    $('followups').innerHTML = fu.length
      ? fu.map(f => `
        <div class="fu">
          <div class="fu-q"><span>You</span>${esc(f.q)}</div>
          <div class="fu-a"><span>Panel</span>${esc(typeof f.a === 'string' ? f.a : JSON.stringify(f.a))}</div>
        </div>`).join('')
      : '<p class="hint">No follow-ups yet. Ask the panel anything about these results.</p>';
  }
  renderFollowups();

  $('ask-btn').addEventListener('click', ask);
  $('ask-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') ask(); });

  async function ask() {
    const q = $('ask-input').value.trim();
    if (!q) return;
    $('ask-btn').disabled = true;
    $('ask-msg').hidden = true;
    try {
      const answer = await RDB.askFollowup(study, q);
      study.followups = (study.followups || []).concat({ q, a: answer, at: new Date().toISOString() });
      $('ask-input').value = '';
      renderFollowups();
      await loadBalance();
    } catch (err) {
      $('ask-msg').hidden = false;
      $('ask-msg').innerHTML = (/credit/i.test(err.message || '') ? 'Not enough credits. <a href="dashboard.html#research">Buy more →</a>' : 'Could not ask: ' + esc(err.message || 'try again.'));
    } finally {
      $('ask-btn').disabled = false;
    }
  }
})();
