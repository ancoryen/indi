// Indizilla Research — live inference.
//
// The seam between the deterministic parts and the Anthropic-powered ones. The
// roster is still built in code (that is what makes segments computable), the
// graph is still assembled in code, the evidence engine is still arithmetic,
// and the verifiers still bite. Only two things move to the model: what each
// persona says, and the strategist's judgement.
//
// Falls back to the mock automatically. If the Edge Function is not deployed,
// the key is missing, or generation fails, a study still completes — with
// provenance recording which engine produced it, so a mock-generated study is
// never mistaken for a real one.

window.RLive = (() => {
  const cfg = window.INDIZILLA_CONFIG || {};
  const FN = 'research';

  function endpoint() {
    const base = (cfg.supabaseUrl || '').replace(/\/+$/, '');
    return base ? base + '/functions/v1/' + FN : null;
  }

  // Live generation needs a signed-in Supabase session: the function reads the
  // study row as the caller to decide the panel size.
  function available() {
    return !!(endpoint() && window.DB && DB.isRemote && DB.client);
  }

  async function call(payload) {
    const url = endpoint();
    if (!url) throw new Error('No Supabase URL configured');
    const { data: { session } } = await DB.client.auth.getSession();
    if (!session) throw new Error('Not signed in');

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + session.access_token,
        'apikey': cfg.supabaseAnonKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const body = await res.json().catch(() => ({ error: 'Bad response from the engine' }));
    if (!res.ok || body.error) throw new Error(body.error || ('HTTP ' + res.status));
    return body;
  }

  /* ---- the live panel ---- */
  async function panel(study) {
    const P = window.RPanel;
    const n = study.respondents || 50;
    const seedStr = String(study.idea) + JSON.stringify(study.audience || {});
    const personas = P.roster(study.audience || {}, n, seedStr);
    const branches = P.detectBranches(study.decision_q);

    const out = await call({
      action: 'panel',
      studyId: study.id,
      personas: personas.map(p => ({
        role: p.role, age: p.age, market: p.market,
        worldview: p.worldview, incentive: p.incentive,
        bias: p.bias, experience: p.experience
      })),
      branches
    });

    // Normalise into the shape assemble() expects. A response the model failed
    // to produce is marked, not dropped — a short panel would understate every
    // share downstream.
    const responses = personas.map((p, i) => {
      const r = (out.responses || [])[i] || {};
      return {
        sentiment: r.sentiment || 'neutral',
        intent: r.intent || 3,
        category: r.category || 'other',
        text: r.text || 'No clear reaction recorded.',
        branch: r.branch || null,
        branchIntent: r.branchIntent || null,
        missing: !!r.missing
      };
    });

    const graph = P.assemble(study, personas, responses);
    graph.meta = Object.assign(graph.meta || {}, {
      personaModel: out.model, engine: 'live',
      usage: out.usage || null,
      missingResponses: responses.filter(r => r.missing).length
    });
    return graph;
  }

  /* ---- the live strategist ---- */
  // Generated judgement goes through the SAME verifier as everything else. A
  // model that fabricates a figure is discarded in favour of the rules
  // baseline — better a plain recommendation than a confident invented one.
  async function strategist(graph, ev) {
    const S = window.RStrategist;
    try {
      const out = await call({ action: 'strategist', request: S.requestFor(graph, ev) });
      const generated = Object.assign({}, out.strategist, {
        strategistVersion: S.STRATEGIST_VERSION,
        producedBy: out.model
      });
      return S.strategise(graph, ev, generated);
    } catch (err) {
      const fallback = S.strategise(graph, ev);
      fallback.strategistNote = 'Live strategist unavailable: ' + (err.message || 'error');
      return fallback;
    }
  }

  /* ---- one call: study in, graph out, live or mock ---- */
  async function run(study, onStage) {
    const stage = (s) => { try { onStage && onStage(s); } catch (e) { /* ignore */ } };
    if (!available()) {
      stage('mock');
      const g = window.RPanel.run(study);
      g.meta = Object.assign(g.meta || {}, { engine: 'mock' });
      return g;
    }
    try {
      stage('panel');
      return await panel(study);
    } catch (err) {
      // A study must still complete. Provenance records what actually ran, so
      // the report can say so rather than implying a real panel.
      stage('fallback');
      const g = window.RPanel.run(study);
      g.meta = Object.assign(g.meta || {}, {
        engine: 'mock',
        liveError: err.message || String(err),
        refusal: /refusal:/.test(err.message || '')
      });
      return g;
    }
  }

  return { available, endpoint, call, panel, strategist, run };
})();
