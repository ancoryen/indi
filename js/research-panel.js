// Indizilla Research — panel generation and graph assembly.
//
// This is still a mock: no inference happens here. What it is NOT is the old
// mock. Three structural differences, and they are the point:
//
//   1. The roster is built deterministically in code from the audience spec.
//      Because we ASSIGN each persona's attributes, segments are computable —
//      that is what makes a real segment analysis possible at all.
//   2. Each persona carries behavioural priors (worldview, incentive, bias,
//      lived experience, risk tolerance) and its reaction is driven by ITS OWN
//      priors, not by one global skepticism slider. Disagreement therefore
//      emerges from the roster rather than being injected for effect.
//   3. Output is a decision graph, not a memo. The Edge Function will replace
//      the CONTENT this file invents; the assembly below stays.
//
// Everything is seeded from the study inputs, so a study is reproducible until
// real inference arrives — at which point determinism goes away and the margin
// of error becomes the honest substitute (see docs/RESEARCH-ENGINE-V2.md §7).

window.RPanel = (() => {
  const G = window.RGraph;

  /* ---- seeded PRNG, same approach as the old engine ---- */
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  }
  const pick = (r, a) => a[Math.floor(r() * a.length)];

  /* ---- prior banks -------------------------------------------------------
     A persona is a role plus a stance. `lean` shifts that archetype's baseline
     receptiveness, which is what produces divergence between segments: a
     gatekeeper and an early adopter looking at the same idea genuinely differ.
     Real inference will draw richer priors; the shape is what matters here. */

  const ARCHETYPES = [
    { id: 'early-adopter', lean: +1.1, segment: 'Early adopters',
      worldviews: ['Tries new tools before they are proven', 'Assumes friction is a solvable problem'],
      incentives: ['Wants the newest thing that works', 'Wants to stop duct-taping tools together'],
      biases: ['Discounts institutional caution', 'Over-weights their own workflow'],
      experiences: ['Has adopted three tools this year', 'Switched stack twice in two years'], risk: 4 },

    { id: 'pragmatist', lean: 0, segment: 'Pragmatic buyers',
      worldviews: ['Buys once the case is obvious, not before', 'Wants proof on their own data'],
      incentives: ['Wants a defensible decision', 'Wants fewer moving parts'],
      biases: ['Anchors on the status quo', 'Needs social proof before committing'],
      experiences: ['Ran a paid pilot last year', 'Rolled back a bad purchase once'], risk: 3 },

    { id: 'gatekeeper', lean: -1.2, segment: 'Gatekeepers & practitioners',
      worldviews: ['This is institutional work, not software', 'Process exists because something went wrong'],
      incentives: ['Protects the standard they enforce', 'Protects the people they are responsible for'],
      biases: ['Over-indexes on the worst case', 'Hostile to being disintermediated'],
      experiences: ['Has cleaned up after a failure like this', 'Owns the process this would replace'], risk: 2 },

    { id: 'economic-buyer', lean: -0.4, segment: 'Economic buyers',
      worldviews: ['Unit economics decide, not enthusiasm', 'Every subscription is a renewal risk'],
      incentives: ['Needs a number that defends itself', 'Answers for the budget line'],
      biases: ['Discounts anything without margin', 'Assumes vendor claims are inflated'],
      experiences: ['Passed on three similar tools', 'Cut two tools last quarter'], risk: 2 },

    { id: 'frontline', lean: -0.6, segment: 'Frontline users',
      worldviews: ['If it does not survive a bad day it does not work', 'The hardest cases decide'],
      incentives: ['Wants their actual day to get easier', 'Distrusts tools built without them'],
      biases: ['Distrusts anything demoed rather than used', 'Assumes edge cases are the norm'],
      experiences: ['Does this work daily', 'Has been handed three tools that did not fit'], risk: 2 },

    { id: 'sceptic', lean: -1.6, segment: 'Hard sceptics',
      worldviews: ['Most of this category is repackaged', 'My current workaround is free'],
      incentives: ['Avoids wasted effort', 'Will not be an early guinea pig'],
      biases: ['Assumes the demo is the best case', 'Needs to be shown, not told'],
      experiences: ['Tried a competitor and dropped it', 'Was burned by a similar promise'], risk: 1 }
  ];

  // Objection wording per category. The category ranks; this text is the
  // verbatim underneath the row.
  const OBJECTIONS = {
    trust:        ['I cannot verify the output, so I cannot bet a decision on it',
                   'Nothing here shows me how the result was reached'],
    price:        ['The price is a real barrier at our stage',
                   'The value has to be obvious before we add another line item'],
    relevance:    ['This solves a problem I do not actually have',
                   'It bundles two audiences that do not overlap'],
    alternatives: ['What I use today is free and good enough',
                   'Established players already cover most of this'],
    effort:       ['Setup would cost more than it saves in the first month',
                   'More friction than the thing I do now'],
    regulatory:   ['The compliance path here is not obvious',
                   'Someone has to own the legal exposure and it would be us'],
    dignity:      ['The framing treats people as inventory',
                   'This would feel extractive to the people it claims to serve'],
    safeguarding: ['The people most affected are the least able to consent',
                   'This creates a new way for someone to be exploited'],
    other:        ['Interesting, but I would need to see it work first']
  };

  // Which objection an archetype reaches for first. Priors shape what people
  // notice, not just how warmly they respond.
  const ARCHETYPE_OBJECTIONS = {
    'early-adopter':  ['effort', 'relevance'],
    'pragmatist':     ['trust', 'alternatives'],
    'gatekeeper':     ['safeguarding', 'regulatory'],
    'economic-buyer': ['price', 'regulatory'],
    'frontline':      ['effort', 'safeguarding'],
    'sceptic':        ['alternatives', 'trust']
  };

  // Categories a panel cannot settle. An objection here becomes a `factual`
  // claim, which the graph then forbids from carrying confidence.
  const NEEDS_EXTERNAL = ['regulatory'];

  /* ---- 1. roster: stratified, deterministic, attributes ASSIGNED ---- */
  function roster(audience, n, seedStr) {
    const r = rng(hash('roster' + seedStr + n));
    const markets = (audience.markets && audience.markets.length) ? audience.markets : ['India'];
    const ages = (audience.ages && audience.ages.length) ? audience.ages : ['25-34', '35-44'];
    const roles = (audience.roles && audience.roles.length) ? audience.roles : ['Founder'];

    // Skew the archetype mix by the audience's skepticism setting, without
    // letting it become the only thing that matters. Note `?? 40` rather than
    // `|| 40`: a slider genuinely set to 0 must mean 0.
    const skeptics = audience.attitude && audience.attitude.skeptics != null
      ? audience.attitude.skeptics : 40;
    const weights = ARCHETYPES.map(a => {
      const base = 1 + a.lean * ((50 - skeptics) / 50);
      return Math.max(base, 0.15);
    });
    const totalW = weights.reduce((x, y) => x + y, 0);

    const out = [];
    for (let i = 0; i < n; i++) {
      let t = r() * totalW, idx = 0;
      while (idx < weights.length - 1 && (t -= weights[idx]) > 0) idx++;
      const a = ARCHETYPES[idx];
      out.push({
        archetype: a.id,
        segment: a.segment,
        role: pick(r, roles),
        market: pick(r, markets),
        age: pick(r, ages),
        worldview: pick(r, a.worldviews),
        incentive: pick(r, a.incentives),
        bias: pick(r, a.biases),
        experience: pick(r, a.experiences),
        riskTolerance: a.risk,
        lean: a.lean
      });
    }
    return out;
  }

  /* ---- 2. respond: driven by the persona's OWN priors ---- */
  function respond(persona, study, i) {
    const r = rng(hash('resp' + study.idea + study.decision_q + persona.archetype + i));
    // Receptiveness is the archetype's lean plus its own noise — not a global
    // roll against one threshold. Two personas in the same segment can differ;
    // two in different segments usually do.
    const score = persona.lean + (r() * 2 - 1) * 0.9;
    const sentiment = score > 0.45 ? 'positive' : score > -0.45 ? 'neutral' : 'skeptical';
    const intent = sentiment === 'positive' ? (r() > 0.5 ? 5 : 4)
                 : sentiment === 'neutral' ? 3
                 : (r() > 0.5 ? 2 : 1);
    const cats = ARCHETYPE_OBJECTIONS[persona.archetype] || ['other'];
    const category = pick(r, cats);
    return {
      sentiment, intent, category,
      text: pick(r, OBJECTIONS[category] || OBJECTIONS.other)
    };
  }

  /* ---- 3. branches: answer the question that was asked ---- */
  // A decision question is often a fork. Splitting it lets the memo verdict
  // each option rather than grading the idea in the abstract.
  function detectBranches(decisionQ) {
    const q = String(decisionQ || '').replace(/\?+$/, '').trim();
    const m = q.split(/\s+(?:or|versus|vs\.?)\s+/i);
    if (m.length !== 2) return null;
    const clean = (s) => s
      .replace(/^(should we|should i|do we|shall we|would it be better to)\s+/i, '')
      .replace(/\s+/g, ' ').trim();
    let a = clean(m[0]), b = clean(m[1]);

    // A label must describe the option, not where it sat in the sentence.
    // "Should we charge per clinic or per filled slot" attaches the shared verb
    // to whichever option comes first, so the same option got a different label
    // — and therefore a different seed — depending on order. Dropping a shared
    // leading verb when only one side carries it restores symmetry, which is
    // what makes the reordering invariant hold.
    const VERB = /^(charge|price|sell|launch|build|buy|lease|offer|target|use|go|do|hire|run|take|make|ship|focus|start|bill|serve)\s+/i;
    const aVerb = VERB.test(a), bVerb = VERB.test(b);
    if (aVerb && !bVerb) a = a.replace(VERB, '');
    else if (bVerb && !aVerb) b = b.replace(VERB, '');

    if (!a || !b || a.length < 3 || b.length < 3) return null;
    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    // Truncate on a word boundary — a branch label is user-facing, and cutting
    // "profiles" to "profile" quietly changes what the option says.
    const clip = (s, max) => {
      if (s.length <= max) return s;
      const cut = s.slice(0, max);
      const sp = cut.lastIndexOf(' ');
      return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[,;:]$/, '') + '…';
    };
    return [clip(cap(a), 70), clip(cap(b), 70)];
  }

  // Candidate assumption per objection category — what has to be true for that
  // objection not to bite.
  const ASSUMPTION_FOR = {
    trust:        'Users will believe the output without verifying it themselves',
    price:        'The price sits below what this audience will pay',
    relevance:    'This audience actually has the problem we are solving',
    alternatives: 'We are enough better than the free workaround to displace it',
    effort:       'Onboarding is light enough that value arrives before patience runs out',
    regulatory:   'The compliance and licensing path is workable',
    dignity:      'The people this affects would accept how it treats them',
    safeguarding: 'The most vulnerable users can be protected at scale',
    other:        'The core premise holds once people see it working'
  };

  const EXPERIMENT_FOR = {
    trust:        { text: 'Show ten users the output alongside its provenance and measure whether they act on it',
                    variantA: 'Result only', variantB: 'Result plus how it was derived', measures: 'action taken' },
    price:        { text: 'Test two price points with a smaller panel to find the ceiling',
                    variantA: 'Lower price', variantB: 'Higher price', measures: 'stated intent to buy' },
    relevance:    { text: 'Put a fake-door page in front of the target audience',
                    variantA: 'Current framing', variantB: 'Problem-first framing', measures: 'click-to-signup' },
    alternatives: { text: 'Ask current workaround users to switch for one task',
                    variantA: 'Our tool', variantB: 'Their workaround', measures: 'task completion time' },
    effort:       { text: 'Time five real users from signup to first useful result',
                    variantA: 'Guided setup', variantB: 'Self-serve setup', measures: 'time to first value' },
    regulatory:   { text: 'Get written confirmation of the compliance path before building',
                    variantA: null, variantB: null, measures: 'specialist sign-off' },
    dignity:      { text: 'Put the framing in front of the affected group, not just buyers',
                    variantA: 'Current framing', variantB: 'Reframed', measures: 'acceptability rating' },
    safeguarding: { text: 'Run a supervised pilot with the most vulnerable cohort',
                    variantA: 'Supervised', variantB: 'Unsupervised', measures: 'incidents per hundred users' },
    other:        { text: 'Run a five-person interview with the strongest segment',
                    variantA: null, variantB: null, measures: 'qualitative confirmation' }
  };

  /* ---- 4. assemble: responses in, decision graph out ---- */
  function assemble(study, personas, responses) {
    const b = G.create({ studyId: study.id, panelId: study.panelId || ('pnl_' + study.id) });

    const segNodes = {};
    const utterances = [];
    const objByCat = {};

    personas.forEach((p, i) => {
      const res = responses[i];
      if (!segNodes[p.segment]) segNodes[p.segment] = b.segment(p.segment);
      const pn = b.persona(p);
      p._node = pn;   // branch evaluation below needs the node back
      b.link(pn, segNodes[p.segment], 'in_segment', true);

      const u = b.utterance({ text: res.text, sentiment: res.sentiment, intent: res.intent });
      b.link(pn, u, 'voiced_by', true);
      b.link(u, pn, 'voiced_by', true);
      utterances.push(u);

      const o = b.objection({ text: res.text, category: res.category });
      b.link(u, o, 'supports', true);
      (objByCat[res.category] = objByCat[res.category] || []).push(o);
    });

    // Category ranking decides which assumptions are worth modelling at all.
    const ranked = Object.keys(objByCat)
      .sort((a, c) => objByCat[c].length - objByCat[a].length);

    const assumptions = {};
    ranked.slice(0, 4).forEach(cat => {
      const a = b.assumption(ASSUMPTION_FOR[cat] || ASSUMPTION_FOR.other);
      assumptions[cat] = a;
      objByCat[cat].forEach(o => b.link(o, a, 'threatens', true));
    });

    // Claims, one per warrant class where the panel supports one.
    if (utterances.length) {
      const pref = b.claim('The audience responds to this framing at the rate shown', 'preference');
      b.link(utterances[0], pref, 'supports', true);

      if (ranked.length) {
        const sal = b.claim(ranked[0] + ' is the most salient objection in this panel', 'salience');
        b.link(objByCat[ranked[0]][0], sal, 'supports', true);
        b.link(utterances[Math.min(1, utterances.length - 1)], sal, 'supports', true);

        // Inference, explicitly tethered to something attested.
        const causal = b.claim(
          'The ' + ranked[0] + ' objection is what stalls adoption, not the idea itself', 'causal');
        b.link(causal, pref, 'derived_from', false);
      }

      // Anything a panel cannot settle becomes a factual claim, which the graph
      // then forbids from carrying confidence.
      ranked.filter(c => NEEDS_EXTERNAL.includes(c)).forEach(cat => {
        const f = b.claim('The ' + cat + ' position assumed here has not been verified', 'factual');
        b.link(objByCat[cat][0], f, 'supports', true);
        if (assumptions[cat]) b.link(f, assumptions[cat], 'threatens', true);
      });
    }

    // Branches — MEASURED, not assigned.
    //
    // The stress batch caught the old behaviour: verdicts came from overall
    // sentiment plus position in the sentence, so swapping "A or B" to "B or A"
    // swapped the verdicts and the strategist picked the second option in 10 of
    // 10 unrelated studies. Nothing had evaluated either option.
    //
    // Now every persona states a preference between the options and an intent
    // toward the one they picked. The verdict is counted from that. The seed
    // uses the label TEXT, never the index, so order cannot move the result.
    const labels = detectBranches(study.decision_q);
    const assumeList = Object.values(assumptions);

    if (labels) {
      const nodes = labels.map(l => b.branch(l, null, null));
      const votes = labels.map(() => []);

      personas.forEach((p, i) => {
        const scored = labels.map(label => {
          const r = rng(hash('branch' + label + p.archetype + p.worldview + i));
          return { label, score: p.lean * 0.5 + (r() * 2 - 1), r };
        });
        const win = scored.slice().sort((x, y) => y.score - x.score)[0];
        const idx = labels.indexOf(win.label);
        const enthusiasm = win.score + p.lean * 0.5;
        const intent = enthusiasm > 0.9 ? 5 : enthusiasm > 0.3 ? 4
                     : enthusiasm > -0.3 ? 3 : enthusiasm > -0.9 ? 2 : 1;
        const u = b.utterance({
          text: 'I would go with ' + win.label + '.',
          sentiment: intent >= 4 ? 'positive' : intent === 3 ? 'neutral' : 'skeptical',
          intent,
          about: 'branch'          // excluded from the idea-level statistics
        });
        b.link(personas[i]._node, u, 'voiced_by', true);
        b.link(u, personas[i]._node, 'voiced_by', true);
        b.link(u, nodes[idx], 'supports', true);   // <- the evidential chain
        votes[idx].push(intent);
      });

      // Verdict from the counted preference and the enthusiasm behind it.
      nodes.forEach((node, i) => {
        const n = votes[i].length;
        const share = personas.length ? n / personas.length * 100 : 0;
        const meanIntent = n ? votes[i].reduce((x, y) => x + y, 0) / n : 0;
        node.verdict = (share >= 55 && meanIntent >= 3.5) ? 'go'
                     : (share >= 35 || (share >= 25 && meanIntent >= 3.5)) ? 'conditional'
                     : 'no';
        node.why = n + ' of ' + personas.length + ' preferred this option (' +
                   Math.round(share) + '%), mean intent ' +
                   (Math.round(meanIntent * 10) / 10) + '/5.';
        const a = assumeList[i] || assumeList[0];
        if (a) b.link(node, a, 'depends_on', false);
      });
    } else {
      // No fork in the question, so the panel evaluated the idea as described.
      // Those utterances are the evidence, so the branch is legitimately
      // verdicted from them.
      const pos = responses.filter(r => r.sentiment === 'positive').length;
      const posPct = responses.length ? pos / responses.length * 100 : 0;
      const only = b.branch('As described',
        posPct >= 55 ? 'go' : posPct >= 35 ? 'conditional' : 'no',
        'Single option — the decision question did not present a fork.');
      utterances.forEach(u => b.link(u, only, 'supports', true));
      if (assumeList[0]) b.link(only, assumeList[0], 'depends_on', false);
    }

    // Experiments against the assumptions that actually carry load.
    ranked.slice(0, 2).forEach(cat => {
      const spec = EXPERIMENT_FOR[cat] || EXPERIMENT_FOR.other;
      const x = b.experiment(spec);
      if (assumptions[cat]) b.link(x, assumptions[cat], 'resolves', false);
    });

    return b.seal({
      personaModel: 'mock-priors-v1',
      memoModel: 'mock-rules-v1',
      mode: study.mode || null,
      respondents: personas.length
    });
  }

  /* ---- 5. one call: study in, decision graph out ---- */
  function run(study) {
    const n = study.respondents || 50;
    // The roster is a sample of the AUDIENCE, so it is seeded on the idea and
    // the audience spec — never on the decision question. Two consequences,
    // both wanted: rephrasing the question cannot reshuffle who was asked, and
    // a variant run against the same idea and audience gets the same people,
    // which is what makes the comparison paired rather than two separate polls.
    const seedStr = String(study.idea) + JSON.stringify(study.audience || {});
    const personas = roster(study.audience || {}, n, seedStr);
    const responses = personas.map((p, i) => respond(p, study, i));
    return assemble(study, personas, responses);
  }

  return {
    ARCHETYPES, OBJECTIONS, ASSUMPTION_FOR, EXPERIMENT_FOR, NEEDS_EXTERNAL,
    roster, respond, detectBranches, assemble, run
  };
})();
