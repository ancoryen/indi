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
  /* ---- Conversation ----
     v2 studies get the graph-backed engine: a question is routed to query,
     variant, new panel or external verification before any answer is composed,
     so there is no path on which it improvises. Pre-v2 studies keep the old
     plain-text follow-ups. */
  const convoGraph = (memo.engineVersion === 2 && memo.graph && window.RConvo) ? memo.graph : null;
  const convoEv = convoGraph ? REvidence.evidence(convoGraph) : null;

  function renderAnswer(a) {
    if (typeof a === 'string') return `<div class="fu-a"><span>Panel</span>${esc(a)}</div>`;
    // A refusal must never be badged as an answer. An unanswered query carries
    // the query op, so using opLabel here would have labelled "nothing in this
    // study speaks to that" as "Answered from this study".
    const badge = a.answeredFromGraph
      ? '<span class="fu-op op-query">From this study</span>'
      : (a.op === 'query'
          ? '<span class="fu-op op-external">Not in this study</span>'
          : `<span class="fu-op op-${esc(a.op)}">${esc(a.opLabel || 'Needs more')}</span>`);
    return `<div class="fu-a">
      <span>Panel</span>
      <div class="fu-body">
        ${badge}
        <p>${esc(a.text)}</p>
        ${(a.quotes || []).length ? `<ul class="fu-quotes">${a.quotes.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
        ${a.nextStep ? `<p class="fu-next"><strong>What it would take:</strong> ${esc(a.nextStep)}</p>` : ''}
        ${a.answeredFromGraph && (a.cites || []).length
          ? `<p class="fu-cite">Computed from ${a.cites.length} node${a.cites.length === 1 ? '' : 's'} in this study${a.costsCredits ? '' : ' · no credits used'}</p>`
          : ''}
      </div>
    </div>`;
  }

  function renderFollowups() {
    const fu = study.followups || [];
    $('followups').innerHTML = fu.length
      ? fu.map(f => `
        <div class="fu">
          <div class="fu-q"><span>You</span>${esc(f.q)}</div>
          ${renderAnswer(f.a)}
        </div>`).join('')
      : '<p class="hint">No questions yet. Ask anything about these results — answers come from ' +
        'this study, or tell you what it would take to find out.</p>';
  }
  renderFollowups();

  /* ---- Suggested questions, derived from this study's own findings ---- */
  if (convoGraph && window.RViews) {
    try {
      const convo = RViews.conversation(convoGraph, convoEv, {});
      const host = document.createElement('div');
      host.className = 'fu-suggest';
      host.innerHTML = '<div class="fs-label">Try asking</div>' + convo.suggestions.map(s =>
        `<button type="button" class="fs-chip op-${esc(s.op)}" data-q="${esc(s.text)}" title="${esc(s.why)}">${esc(s.text)}</button>`
      ).join('');
      $('followups').parentNode.insertBefore(host, $('followups'));
      host.addEventListener('click', (e) => {
        const b = e.target.closest('.fs-chip');
        if (!b) return;
        $('ask-input').value = b.getAttribute('data-q');
        ask();
      });
    } catch (e) { if (window.console) console.warn('[report] suggestions failed:', e); }
  }

  $('ask-btn').addEventListener('click', ask);
  $('ask-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') ask(); });

  async function ask() {
    const q = $('ask-input').value.trim();
    if (!q) return;
    $('ask-btn').disabled = true;
    $('ask-msg').hidden = true;
    try {
      let answer;
      if (convoGraph) {
        // Graph-backed. A query is a read over data already paid for, so it
        // costs nothing — charging credits for a lookup would be exactly the
        // quiet upsell the confidence section refuses to make. Credits are
        // spent when a variant or new panel actually runs.
        answer = RConvo.ask(convoGraph, convoEv, q);
        if (answer.costsCredits && answer.requiresRun) {
          // Routing only: the run itself is a separate, priced operation.
          answer = Object.assign({}, answer, { pendingRun: true });
        }
      } else {
        answer = await RDB.askFollowup(study, q);   // pre-v2 study
      }
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
