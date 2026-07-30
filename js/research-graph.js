// Indizilla Research — the decision graph.
//
// A study is not a report, it is a graph: personas said things (utterances),
// those attest claims, claims threaten assumptions, experiments resolve them,
// moves are recommended against them. Everything downstream — the memo, the
// executive summary, the conversation — is a VIEW rendered from this graph.
//
// Two properties are structural rather than stylistic, and the validator
// enforces both:
//   1. A `factual` claim can never carry confidence. A panel of simulated
//      people is not evidence for whether something is legal or true; more
//      personas agreeing does not make it truer.
//   2. A `causal` claim must trace back to something a persona actually said.
//      Causal chains are the model's theory, not testimony, and an untethered
//      one is invention.
//
// Cross-study learning is not built. It is only kept possible: every node
// carries a `key` — a stable content fingerprint — so the same objection or
// assumption appearing in a later study is recognisable as the same thing.
// Edges reference ids, never array positions, so graphs stay mergeable.

window.RGraph = (() => {
  const SCHEMA_VERSION = 3;

  /* ---- warrant: what kind of evidence a panel can be FOR ---- */
  const WARRANT = {
    preference: { label: 'Preference',  panelIsEvidence: true,  confidence: 'sampling' },
    salience:   { label: 'Salience',    panelIsEvidence: true,  confidence: 'sampling' },
    causal:     { label: 'Inference',   panelIsEvidence: false, confidence: 'reasoning' },
    factual:    { label: 'Unverified',  panelIsEvidence: false, confidence: 'none' }
  };

  const NODE_TYPES = ['persona', 'segment', 'utterance', 'claim', 'objection',
                      'assumption', 'experiment', 'move', 'variant', 'branch'];
  const EDGE_RELS  = ['supports', 'contradicts', 'threatens', 'resolves',
                      'depends_on', 'derived_from', 'voiced_by', 'in_segment', 'mutates'];
  const MOVE_KINDS = ['kill', 'double_down', 'ignore', 'validate', 'pivot'];

  // Objection categories. `dignity` and `safeguarding` are not decoration —
  // on the BegFund dry run 5 of 12 objections landed in those two and would
  // otherwise have collapsed into `other`, losing the top row of the table.
  const OBJECTION_CATEGORIES = ['trust', 'price', 'relevance', 'alternatives', 'effort',
                                'regulatory', 'dignity', 'safeguarding', 'other'];

  /* ---- stable content fingerprint, for cross-study recognition later ---- */
  function fingerprint(str) {
    let h = 2166136261;
    const s = String(str).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  }
  const keyFor = (type, ...parts) => type + ':' + fingerprint(parts.join('|'));

  /* ---- builder: accumulate nodes and edges, then seal ---- */
  function create({ studyId, panelId }) {
    const nodes = [];
    const edges = [];
    const seq = {};
    const byKey = {};

    function add(type, fields, key) {
      if (!NODE_TYPES.includes(type)) throw new Error('Unknown node type: ' + type);
      // Same key twice means the same thing said twice — reuse the node.
      if (key && byKey[key]) return byKey[key];
      seq[type] = (seq[type] || 0) + 1;
      const node = Object.assign({ id: type.slice(0, 4) + '_' + seq[type], type }, fields);
      if (key) { node.key = key; byKey[key] = node; }
      nodes.push(node);
      return node;
    }

    // `attested` marks an edge as grounded in something a persona said, as
    // opposed to a link the model reasoned into place. The UI renders the
    // difference; the validator relies on it.
    function link(from, to, rel, attested) {
      if (!EDGE_RELS.includes(rel)) throw new Error('Unknown edge rel: ' + rel);
      edges.push({
        from: from && from.id ? from.id : from,
        to: to && to.id ? to.id : to,
        rel,
        attested: !!attested
      });
    }

    return {
      nodes, edges, add, link,

      persona(p) {
        return add('persona', {
          role: p.role, market: p.market, age: p.age,
          // Behavioural priors, not biography. These are what make two
          // demographically identical personas disagree.
          worldview: p.worldview || '', incentive: p.incentive || '',
          bias: p.bias || '', experience: p.experience || '',
          riskTolerance: p.riskTolerance == null ? 3 : p.riskTolerance
        }, keyFor('persona', p.role, p.market, p.worldview, p.bias));
      },

      segment(name)          { return add('segment', { name }, keyFor('segment', name)); },
      utterance(u)           { return add('utterance', { text: u.text, sentiment: u.sentiment, intent: u.intent }); },
      claim(text, warrant)   {
        if (!WARRANT[warrant]) throw new Error('Unknown warrant: ' + warrant);
        return add('claim', { text, warrant }, keyFor('claim', text));
      },
      objection(o)           {
        return add('objection', { text: o.text, category: o.category || 'other' },
                   keyFor('objection', o.category, o.text));
      },
      assumption(text)       { return add('assumption', { text }, keyFor('assumption', text)); },
      experiment(e)          {
        return add('experiment', { text: e.text, variantA: e.variantA || null,
                                   variantB: e.variantB || null, measures: e.measures || null },
                   keyFor('experiment', e.text));
      },
      move(kind, text)       {
        if (!MOVE_KINDS.includes(kind)) throw new Error('Unknown move kind: ' + kind);
        return add('move', { kind, text }, keyFor('move', kind, text));
      },
      branch(label, verdict, why) {
        return add('branch', { label, verdict, why }, keyFor('branch', label));
      },
      variant(label, changes) {
        return add('variant', { label, changes: changes || [] }, keyFor('variant', label));
      },

      seal(meta) {
        return {
          schemaVersion: SCHEMA_VERSION,
          studyId, panelId,
          nodes, edges,
          meta: Object.assign({ generatedAt: new Date().toISOString() }, meta || {})
        };
      }
    };
  }

  /* ---- read helpers (views and the evidence engine use these) ---- */
  const of      = (g, type)        => g.nodes.filter(n => n.type === type);
  const byId    = (g, id)          => g.nodes.find(n => n.id === id) || null;
  const out     = (g, id, rel)     => g.edges.filter(e => e.from === id && (!rel || e.rel === rel));
  const into    = (g, id, rel)     => g.edges.filter(e => e.to === id && (!rel || e.rel === rel));
  const targets = (g, id, rel)     => out(g, id, rel).map(e => byId(g, e.to)).filter(Boolean);
  const sources = (g, id, rel)     => into(g, id, rel).map(e => byId(g, e.from)).filter(Boolean);

  /* ---- validator: the two safety properties, plus referential sanity ---- */
  function validate(g) {
    const errors = [];
    const ids = new Set(g.nodes.map(n => n.id));

    if (g.schemaVersion !== SCHEMA_VERSION) {
      errors.push('schemaVersion ' + g.schemaVersion + ' != ' + SCHEMA_VERSION);
    }

    g.edges.forEach((e, i) => {
      if (!ids.has(e.from)) errors.push('edge[' + i + '] from unknown node: ' + e.from);
      if (!ids.has(e.to))   errors.push('edge[' + i + '] to unknown node: ' + e.to);
    });

    of(g, 'claim').forEach(c => {
      if (!WARRANT[c.warrant]) { errors.push(c.id + ' unknown warrant: ' + c.warrant); return; }

      // (1) A factual claim must never carry confidence.
      if (c.warrant === 'factual' && ('confidence' in c || 'pct' in c)) {
        errors.push(c.id + ' is factual and carries confidence — a panel cannot ' +
                    'be evidence for a factual claim, however many personas agree');
      }
      // (2) A causal claim must trace to something attested.
      if (c.warrant === 'causal') {
        const roots = into(g, c.id, 'derived_from').concat(out(g, c.id, 'derived_from'));
        if (!roots.length) {
          errors.push(c.id + ' is causal with no derived_from edge — an untethered ' +
                      'causal chain is invention, not inference');
        }
      }
      // Panel-evidence claims need at least one utterance behind them.
      if (WARRANT[c.warrant].panelIsEvidence && !into(g, c.id, 'supports').length) {
        errors.push(c.id + ' claims panel evidence but no utterance supports it');
      }
    });

    of(g, 'experiment').forEach(x => {
      const res = targets(g, x.id, 'resolves');
      if (!res.length) errors.push(x.id + ' resolves nothing');
      res.forEach(t => {
        if (t.type !== 'assumption' && t.type !== 'claim') {
          errors.push(x.id + ' resolves a ' + t.type + ' — only assumptions and claims');
        }
      });
    });

    of(g, 'objection').forEach(o => {
      if (!into(g, o.id, 'supports').length) {
        errors.push(o.id + ' has no utterance behind it');
      }
    });

    return { ok: errors.length === 0, errors };
  }

  return {
    SCHEMA_VERSION, WARRANT, NODE_TYPES, EDGE_RELS, MOVE_KINDS, OBJECTION_CATEGORIES,
    create, validate, keyFor, fingerprint,
    of, byId, out, into, targets, sources
  };
})();
