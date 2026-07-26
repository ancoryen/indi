// Indizilla Research — study wizard (Describe → Audience → Survey → launch).
// Uses RDB (data layer) + ResearchEngine (via RDB helpers). Credits are deducted
// server-side by RDB.runStudy → create_study RPC.

(async () => {
  const user = await Auth.requireLogin();
  if (!user) return;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const MARKETS = ['India', 'United States', 'United Kingdom', 'Canada', 'Australia', 'Germany', 'France', 'UAE', 'Singapore', 'Japan', 'Brazil', 'Any market'];
  const AGES = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'];
  const ROLE_SUGGEST = ['Founder', 'Product Manager', 'CEO', 'CTO', 'Marketing Manager', 'Student', 'Consumer', 'Small Business Owner', 'Designer', 'Engineer', 'Sales Lead', 'Operations'];
  const USECASE_HINT = {
    validate: 'Validating a new idea — describe it and the go/no-go call you face.',
    messaging: 'Testing messaging — describe the idea and which framing you\'re unsure about.',
    features: 'Prioritising features — describe the product and the trade-off you\'re weighing.',
    campaign: 'Pre-testing a campaign — describe the concept and what you want it to achieve.',
    pricing: 'Pricing research — describe the offer and the price points you\'re considering.',
    'market-entry': 'Market entry — describe the offer and the new market or segment in question.'
  };

  const state = {
    step: 1,
    idea: '', decision: '', urls: [],
    mode: RDB.MODES[0].id,
    audience: null, inferred: false,
    survey: [], fitOverride: false, balance: 0
  };

  /* ---- balance ---- */
  async function loadBalance() {
    try { state.balance = await RDB.balance(); } catch (e) { state.balance = 0; }
    $('rc-balance').textContent = state.balance;
    if ($('ls-balance')) $('ls-balance').textContent = state.balance + ' credits';
  }

  /* ---- usecase hint ---- */
  const uc = new URLSearchParams(location.search).get('usecase');
  if (uc && USECASE_HINT[uc]) {
    const h = document.createElement('p');
    h.className = 'callout-inline';
    h.innerHTML = esc(USECASE_HINT[uc]);
    const panel = $('wiz-1');
    panel.insertBefore(h, panel.firstChild);
  }

  /* ================= STEP 1: DESCRIBE ================= */
  const idea = $('w-idea'), decision = $('w-decision');
  idea.addEventListener('input', () => { $('idea-count').textContent = idea.value.length; hideFit(); });
  decision.addEventListener('input', hideFit);
  function hideFit() { $('fit-banner').hidden = true; state.fitOverride = false; $('to-2').innerHTML = 'Continue <span class="arrow">→</span>'; }

  // URLs
  $('url-toggle').addEventListener('click', () => {
    const box = $('url-box'); const open = box.hidden;
    box.hidden = !open; $('url-toggle').setAttribute('aria-expanded', String(open));
    if (open && !$('url-list').children.length) addUrl();
  });
  function addUrl() {
    if ($('url-list').children.length >= 10) return;
    const row = document.createElement('div');
    row.className = 'url-row';
    row.innerHTML = '<input type="url" placeholder="https://example.com"><button type="button" class="url-x" aria-label="Remove">×</button>';
    row.querySelector('.url-x').addEventListener('click', () => row.remove());
    $('url-list').appendChild(row);
  }
  $('add-url').addEventListener('click', addUrl);

  // Mode cards
  function renderModes() {
    $('mode-list').innerHTML = RDB.MODES.map(m => `
      <label class="mode-card${m.id === state.mode ? ' is-sel' : ''}${m.gated ? ' is-gated' : ''}">
        <input type="radio" name="mode" value="${m.id}" ${m.id === state.mode ? 'checked' : ''} ${m.gated ? 'disabled' : ''}>
        <div class="mc-top"><span class="mc-name">${esc(m.name)}</span>${m.gated ? '<span class="pill-gated">advanced</span>' : ''}</div>
        <div class="mc-meta">${m.respondents} personas · ${esc(m.time)}</div>
        <div class="mc-credits">${m.credits} credits</div>
        <div class="mc-desc">${esc(m.desc)}</div>
      </label>`).join('');
    $('mode-list').querySelectorAll('input[name="mode"]').forEach(r => {
      r.addEventListener('change', () => { state.mode = r.value; renderModes(); });
    });
  }
  renderModes();

  $('to-2').addEventListener('click', () => {
    state.idea = idea.value.trim();
    state.decision = decision.value.trim();
    if (!state.idea) { idea.focus(); return; }

    if (!state.fitOverride) {
      const fit = RDB.studyFit(state.idea, state.decision);
      if (!fit.ok) {
        $('fit-issues').innerHTML = fit.issues.map(i => `<li>${esc(i)}</li>`).join('');
        $('fit-banner').hidden = false;
        state.fitOverride = true; // next click continues anyway
        $('to-2').innerHTML = 'Continue anyway <span class="arrow">→</span>';
        $('fit-banner').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }
    }
    goStep(2);
  });

  /* ================= STEP 2: AUDIENCE ================= */
  function buildChips(containerId, options, selected) {
    const c = $(containerId);
    c.innerHTML = options.map(o => `<button type="button" class="chip-btn${selected.includes(o) ? ' is-on' : ''}" data-v="${esc(o)}">${esc(o)}</button>`).join('');
    c.querySelectorAll('.chip-btn').forEach(b => b.addEventListener('click', () => b.classList.toggle('is-on')));
  }
  function readChips(containerId) {
    return Array.from($(containerId).querySelectorAll('.chip-btn.is-on')).map(b => b.dataset.v);
  }

  // Roles tag input
  const roles = [];
  function renderRoles() {
    const wrap = $('roles-tags');
    wrap.querySelectorAll('.tag').forEach(t => t.remove());
    roles.forEach((r, i) => {
      const t = document.createElement('span');
      t.className = 'tag';
      t.innerHTML = esc(r) + '<button type="button" aria-label="Remove">×</button>';
      t.querySelector('button').addEventListener('click', () => { roles.splice(i, 1); renderRoles(); });
      wrap.insertBefore(t, wrap.querySelector('.tag-field'));
    });
  }
  function addRole(v) { v = v.trim(); if (v && !roles.includes(v)) { roles.push(v); renderRoles(); } }
  function initRolesInput() {
    const wrap = $('roles-tags');
    wrap.innerHTML = '<input type="text" class="tag-field" placeholder="Add a role…">';
    const field = wrap.querySelector('.tag-field');
    field.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addRole(field.value); field.value = ''; }
      else if (e.key === 'Backspace' && !field.value && roles.length) { roles.pop(); renderRoles(); }
    });
    $('roles-suggest').innerHTML = ROLE_SUGGEST.map(r => `<button type="button" class="sug" data-v="${esc(r)}">+ ${esc(r)}</button>`).join('');
    $('roles-suggest').querySelectorAll('.sug').forEach(b => b.addEventListener('click', () => addRole(b.dataset.v)));
  }

  const sliders = [['s-tech', 'o-tech', v => v], ['s-skeptics', 'o-skeptics', v => v + '%'], ['s-pushback', 'o-pushback', v => v + '/10']];
  sliders.forEach(([sid, oid, fmt]) => {
    $(sid).addEventListener('input', () => { $(oid).textContent = fmt($(sid).value); });
  });

  function fillAudience() {
    const a = RDB.inferAudience(state.idea, state.decision);
    state.audience = a;
    buildChips('markets', MARKETS, a.markets);
    buildChips('ages', AGES, a.ages);
    roles.length = 0; (a.roles || []).forEach(r => roles.push(r)); initRolesInput(); renderRoles();
    $('w-company').value = a.company || '';
    $('w-industry').value = a.industry || '';
    $('s-tech').value = a.attitude.tech; $('o-tech').textContent = a.attitude.tech;
    $('s-skeptics').value = a.attitude.skeptics; $('o-skeptics').textContent = a.attitude.skeptics + '%';
    $('s-pushback').value = a.attitude.pushback; $('o-pushback').textContent = a.attitude.pushback + '/10';
    $('w-diversity').value = a.diversity || '';
    $('w-notes').value = a.notes || '';
    state.inferred = true;
  }

  function collectAudience() {
    return {
      markets: readChips('markets'), ages: readChips('ages'), roles: roles.slice(),
      company: $('w-company').value.trim(), industry: $('w-industry').value.trim(),
      attitude: { tech: +$('s-tech').value, skeptics: +$('s-skeptics').value, pushback: +$('s-pushback').value },
      diversity: $('w-diversity').value.trim(), notes: $('w-notes').value.trim()
    };
  }

  $('back-1').addEventListener('click', () => goStep(1));
  $('to-3').addEventListener('click', () => { state.audience = collectAudience(); goStep(3); });

  /* ================= STEP 3: SURVEY & LAUNCH ================= */
  function genSurvey() {
    state.survey = RDB.generateSurvey(state.idea, state.decision, state.audience);
    renderSurvey();
  }
  function renderSurvey() {
    $('survey-list').innerHTML = state.survey.map((q, i) => `
      <li class="survey-item">
        <span class="sq-num">${i + 1}</span>
        <textarea rows="2" data-i="${i}">${esc(q.text)}</textarea>
        <span class="sq-type">${esc(q.type)}</span>
      </li>`).join('');
    $('survey-list').querySelectorAll('textarea').forEach(t => {
      t.addEventListener('input', () => { state.survey[+t.dataset.i].text = t.value; });
    });
  }
  $('regen').addEventListener('click', genSurvey);
  $('back-2').addEventListener('click', () => goStep(2));

  function updateLaunch() {
    const m = RDB.modeById(state.mode);
    $('ls-mode').textContent = m.name;
    $('ls-detail').textContent = m.respondents + ' personas · ' + state.survey.length + ' questions';
    $('ls-credits').textContent = m.credits;
    $('ls-balance').textContent = state.balance + ' credits';
    const short = state.balance < m.credits;
    $('launch-warn').hidden = !short;
    if (short) $('launch-warn').innerHTML = `You need ${m.credits} credits but have ${state.balance}. <a href="dashboard.html#research">Buy more credits →</a>`;
    $('launch').disabled = short;
    $('launch').classList.toggle('is-disabled', short);
  }

  const RUN_MSGS = ['Assembling your panel…', 'Personas are reading your idea…', 'Collecting responses…', 'Weighing the objections…', 'Writing your decision memo…'];
  $('launch').addEventListener('click', async () => {
    const m = RDB.modeById(state.mode);
    if (state.balance < m.credits) { updateLaunch(); return; }

    const urls = Array.from(document.querySelectorAll('#url-list input')).map(i => i.value.trim()).filter(Boolean).slice(0, 10);
    const title = (state.idea.split(/\s+/).slice(0, 7).join(' ') || 'Untitled study').replace(/[.,;:]$/, '');
    const input = { title, idea: state.idea, decision_q: state.decision, urls, audience: state.audience, mode: state.mode };

    $('run-overlay').hidden = false;
    let mi = 0; $('run-status').textContent = RUN_MSGS[0];
    const cycle = setInterval(() => { mi = (mi + 1) % RUN_MSGS.length; $('run-status').textContent = RUN_MSGS[mi]; }, 900);

    try {
      const study = await RDB.runStudy(input, state.survey);
      clearInterval(cycle);
      $('run-status').textContent = 'Done — opening your memo…';
      location.href = 'research-report.html?id=' + encodeURIComponent(study.id);
    } catch (err) {
      clearInterval(cycle);
      $('run-overlay').hidden = true;
      alert('Could not run the study: ' + (err.message || 'please try again.'));
      await loadBalance();
    }
  });

  /* ================= STEP NAVIGATION ================= */
  function goStep(n) {
    state.step = n;
    [1, 2, 3].forEach(i => { $('wiz-' + i).hidden = i !== n; });
    document.querySelectorAll('.step-dot').forEach(d => {
      const s = +d.dataset.step;
      d.classList.toggle('is-current', s === n);
      d.classList.toggle('is-done', s < n);
    });
    if (n === 2 && !state.inferred) fillAudience();
    if (n === 3) { if (!state.survey.length) genSurvey(); updateLaunch(); }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  await loadBalance();
})();
