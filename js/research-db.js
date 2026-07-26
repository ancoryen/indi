// Indizilla Research — data layer for the market-research product.
// Same two-backend shape as js/db.js: real Supabase (when the anon key is set)
// or a localStorage demo. Study credits are a SEPARATE currency from the ₹
// referral credits in js/db.js. Persona/survey/memo GENERATION is mocked in
// js/research-engine.js; credit deduction + persistence are server-authoritative
// via the RPCs in supabase/migration.sql.

window.RDB = (() => {
  const cfg = window.INDIZILLA_CONFIG || {};
  const REMOTE = !!(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase);
  // Reuse the DB module's Supabase client (one auth client per page); only fall
  // back to a fresh client if RDB is somehow loaded without js/db.js.
  const sb = REMOTE ? ((window.DB && window.DB.client) || window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey)) : null;
  const E = window.ResearchEngine;

  // Server-owned economics, mirrored here for display only (SQL is the source of truth).
  const MODES = [
    { id: 'quick-pulse', name: 'Quick Pulse',  respondents: 50,  credits: 100, time: '10–15 min', desc: 'A fast read on a single decision.' },
    { id: 'pulse-plus',  name: 'Pulse Plus',   respondents: 100, credits: 200, time: '15–25 min', desc: 'More depth and a wider panel.' },
    { id: 'signal-plus', name: 'Signal Plus',  respondents: 200, credits: 400, time: '25–40 min', desc: 'High-confidence read across segments.' },
    { id: 'prism',       name: 'Prism',        respondents: 400, credits: 900, time: '40–60 min', desc: 'Advanced, high-volume research.', gated: true }
  ];
  const FOLLOWUP_COST = 2;
  const modeById = (id) => MODES.find(m => m.id === id) || MODES[0];

  /* ============================ DEMO backend ============================ */
  const LS = 'indizilla_research_v1';
  function demoLoad() {
    try { const d = JSON.parse(localStorage.getItem(LS)); if (d && d.ledger) return d; } catch (e) { /* ignore */ }
    return { ledger: [{ amount: 300, reason: 'Welcome credits', at: new Date().toISOString() }], studies: [] };
  }
  function demoSave(d) { try { localStorage.setItem(LS, JSON.stringify(d)); } catch (e) { /* ignore */ } }

  const DEMO_PACKS = [
    { id: 'starter', name: 'Starter', price_inr: 399,  credits: 450,  popular: false },
    { id: 'growth',  name: 'Growth',  price_inr: 899,  credits: 1050, popular: true  },
    { id: 'pro',     name: 'Pro',     price_inr: 1499, credits: 1900, popular: false }
  ];

  const demo = {
    async packs() { return DEMO_PACKS; },
    async balance() { return demoLoad().ledger.reduce((s, e) => s + e.amount, 0); },
    async ledger() { return demoLoad().ledger.slice().reverse(); },
    async buyCredits(packId, paymentId) {
      const p = DEMO_PACKS.find(x => x.id === packId); if (!p) throw new Error('Unknown pack');
      const d = demoLoad();
      d.ledger.push({ amount: p.credits, reason: p.name + ' pack (ref ' + (paymentId || 'demo') + ')', at: new Date().toISOString() });
      demoSave(d);
      return { ok: true, credits: p.credits, balance: d.ledger.reduce((s, e) => s + e.amount, 0) };
    },
    async createStudy(input) {
      const m = modeById(input.mode);
      const d = demoLoad();
      const bal = d.ledger.reduce((s, e) => s + e.amount, 0);
      if (bal < m.credits) throw new Error('Not enough credits (need ' + m.credits + ', have ' + bal + ')');
      const study = {
        id: 'std_' + Date.now().toString(36), title: input.title || 'Untitled study',
        idea: input.idea, decision_q: input.decision_q, urls: input.urls || [],
        audience: input.audience || {}, mode: m.id, respondents: m.respondents,
        credits_cost: m.credits, status: 'running', survey: [], personas: [], memo: {},
        followups: [], created_at: new Date().toISOString()
      };
      d.studies.push(study);
      d.ledger.push({ amount: -m.credits, reason: 'Study: ' + study.title, at: new Date().toISOString() });
      demoSave(d);
      return study;
    },
    async saveResult(id, survey, personas, memo) {
      const d = demoLoad();
      const s = d.studies.find(x => x.id === id); if (!s) throw new Error('Study not found');
      Object.assign(s, { survey, personas, memo, status: 'ready' });
      demoSave(d); return s;
    },
    async studies() { return demoLoad().studies.slice().reverse(); },
    async getStudy(id) { return demoLoad().studies.find(s => s.id === id) || null; },
    async followup(id, question, answer) {
      const d = demoLoad();
      const s = d.studies.find(x => x.id === id); if (!s) throw new Error('Study not found');
      const bal = d.ledger.reduce((acc, e) => acc + e.amount, 0);
      if (bal < FOLLOWUP_COST) throw new Error('Not enough credits (need 2, have ' + bal + ')');
      d.ledger.push({ amount: -FOLLOWUP_COST, reason: 'Follow-up question', at: new Date().toISOString() });
      s.followups = (s.followups || []).concat({ q: question, a: answer, at: new Date().toISOString() });
      demoSave(d);
      return { ok: true, balance: d.ledger.reduce((acc, e) => acc + e.amount, 0) };
    },
    // admin (demo is single-user, so these mirror the normal calls)
    async allStudies() { return demoLoad().studies.slice().reverse(); },
    async userBalance() { return demoLoad().ledger.reduce((s, e) => s + e.amount, 0); },
    async adminAdjust(userId, amount, reason) {
      const d = demoLoad();
      d.ledger.push({ amount, reason: reason || 'Admin adjustment', at: new Date().toISOString() });
      demoSave(d);
      return { ok: true };
    }
  };

  /* ============================ REMOTE backend ============================ */
  const mapStudy = (r) => ({
    id: r.id, userId: r.user_id, title: r.title, idea: r.idea, decision_q: r.decision_q,
    urls: r.urls || [], audience: r.audience || {}, mode: r.mode, respondents: r.respondents,
    credits_cost: r.credits_cost, status: r.status, survey: r.survey || [], personas: r.personas || [],
    memo: r.memo || {}, followups: r.followups || [], created_at: r.created_at
  });

  const remote = {
    async packs() {
      const { data } = await sb.from('research_packs').select('*').eq('active', true).order('sort');
      return (data || []).map(p => ({ id: p.id, name: p.name, price_inr: p.price_inr, credits: p.credits, popular: p.popular }));
    },
    async balance() {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return 0;
      const { data } = await sb.rpc('research_credit_balance', { uid: user.id });
      return data || 0;
    },
    async ledger() {
      const { data } = await sb.from('research_credit_ledger').select('*').order('created_at', { ascending: false });
      return (data || []).map(r => ({ amount: r.amount, reason: r.reason, at: r.created_at }));
    },
    async buyCredits(packId, paymentId) {
      const { data, error } = await sb.rpc('buy_research_credits', { p_pack_id: packId, p_payment_id: paymentId || null });
      if (error) throw error; return data;
    },
    async createStudy(input) {
      const { data, error } = await sb.rpc('create_study', {
        p_title: input.title || 'Untitled study', p_idea: input.idea, p_decision_q: input.decision_q,
        p_urls: input.urls || [], p_audience: input.audience || {}, p_mode: input.mode
      });
      if (error) throw error; return mapStudy(data);
    },
    async saveResult(id, survey, personas, memo) {
      const { data, error } = await sb.rpc('save_study_result', {
        p_study_id: id, p_survey: survey, p_personas: personas, p_memo: memo
      });
      if (error) throw error; return mapStudy(data);
    },
    async studies() {
      const { data } = await sb.from('research_studies').select('*').order('created_at', { ascending: false });
      return (data || []).map(mapStudy);
    },
    async getStudy(id) {
      const { data } = await sb.from('research_studies').select('*').eq('id', id).maybeSingle();
      return data ? mapStudy(data) : null;
    },
    async followup(id, question, answer) {
      const { data, error } = await sb.rpc('research_followup', { p_study_id: id, p_question: question, p_answer: answer });
      if (error) throw error; return data;
    },
    // admin — RLS lets admins select every study; the RPC gates the write to admins
    async allStudies() {
      const { data } = await sb.from('research_studies').select('*').order('created_at', { ascending: false });
      return (data || []).map(mapStudy);
    },
    async userBalance(userId) {
      const { data } = await sb.rpc('research_credit_balance', { uid: userId });
      return data || 0;
    },
    async adminAdjust(userId, amount, reason) {
      const { error } = await sb.rpc('admin_adjust_research_credits', { p_user_id: userId, p_amount: amount, p_reason: reason || 'Admin adjustment' });
      if (error) throw error;
      return { ok: true };
    }
  };

  const back = REMOTE ? remote : demo;

  /* ---- Orchestration: run a study end-to-end (create → generate → save) ---- *
   * Credits are deducted by createStudy() on the server; generation is the mock
   * engine; saveResult() persists the output. Swap the engine block for an Edge
   * Function call to make generation server-side.                              */
  async function runStudy(input, presetSurvey) {
    const study = await back.createStudy(input);          // server deducts credits
    const survey = (presetSurvey && presetSurvey.length)
      ? presetSurvey
      : E.generateSurvey(study.idea, study.decision_q, study.audience);
    const panel = E.simulatePanel(Object.assign({}, study, { survey }));
    const memo = E.synthesizeMemo(study, panel);
    const personas = { count: panel.n, mix: { positive: panel.pos, neutral: panel.neu, skeptical: panel.skp }, avgScore: panel.avgScore, shown: panel.shown };
    const saved = await back.saveResult(study.id, survey, personas, memo);
    return saved;
  }

  async function askFollowup(study, question) {
    const answer = E.followupAnswer(study, question);
    await back.followup(study.id, question, answer);
    return answer;
  }

  return Object.assign({
    isRemote: REMOTE, MODES, FOLLOWUP_COST, modeById,
    // pass-throughs
    packs: (...a) => back.packs(...a),
    balance: (...a) => back.balance(...a),
    ledger: (...a) => back.ledger(...a),
    buyCredits: (...a) => back.buyCredits(...a),
    studies: (...a) => back.studies(...a),
    getStudy: (...a) => back.getStudy(...a),
    // admin
    allStudies: (...a) => back.allStudies(...a),
    userBalance: (...a) => back.userBalance(...a),
    adminAdjust: (...a) => back.adminAdjust(...a),
    // engine helpers (client-side, unbilled)
    studyFit: (idea, decision) => E.studyFit(idea, decision),
    inferAudience: (idea, decision) => E.inferAudience(idea, decision),
    generateSurvey: (idea, decision, audience) => E.generateSurvey(idea, decision, audience),
    // orchestration
    runStudy, askFollowup
  });
})();
