// Indizilla Research — the evidence engine.
//
// Everything here is COMPUTED from the decision graph. Nothing is generated,
// nothing is estimated, nothing is guessed. If a number appears in a memo and
// it did not come out of this file, it is not evidence.
//
// The distinction that matters: this layer produces evidence and uncertainty.
// The Strategist layer above it produces judgement, and may only consume what
// is returned here. That is how a recommendation stays traceable.
//
// Deliberately absent: predicted lift. "Fixing X gives +18pp" is not knowable
// from a panel that never saw the fixed version. What IS knowable is how much
// objection mass an assumption carries — a ceiling on the addressable problem,
// not a forecast. Callers get `addressableMass` and must label it as such.

window.REvidence = (() => {
  const G = window.RGraph;

  const sum  = (a) => a.reduce((x, y) => x + y, 0);
  const mean = (a) => (a.length ? sum(a) / a.length : 0);
  const r1   = (n) => Math.round(n * 10) / 10;

  /* ---- 1. panel stats: the raw distribution ---- */
  function panelStats(g) {
    const us = G.of(g, 'utterance');
    const n = us.length;
    const count = (s) => us.filter(u => u.sentiment === s).length;
    const pos = count('positive'), neu = count('neutral'), skp = count('skeptical');
    const pct = (c) => (n ? Math.round(c / n * 100) : 0);
    return {
      n,
      positive:   { count: pos, pct: pct(pos) },
      neutral:    { count: neu, pct: pct(neu) },
      skeptical:  { count: skp, pct: pct(skp) },
      meanIntent: r1(mean(us.map(u => u.intent))),
      negativeN:  skp + neu   // denominator for objection mass
    };
  }

  /* ---- 2. sampling error: ±pp at 95% on a proportion ---- */
  // Agresti-Coull, not Wald. The textbook sqrt(p(1-p)/n) collapses to zero
  // when a group is 0% or 100%, which is exactly where small segments land —
  // it would report 0-of-2 as ±1.4pp instead of the honest ~±38pp. Adding two
  // notional successes and two failures keeps the interval sane at the edges.
  function propCI(x, n) {
    if (!n) return null;
    const nt = n + 4, pt = (x + 2) / nt;
    return r1(1.96 * Math.sqrt(pt * (1 - pt) / nt) * 100);
  }

  function samplingError(g) {
    const s = panelStats(g);
    if (!s.n) return { n: 0, p: null, marginOfError: null };
    return {
      n: s.n,
      p: s.positive.count / s.n,
      marginOfError: propCI(s.positive.count, s.n),
      method: 'agresti-coull'
    };
  }

  // How many responses would a target margin need? Honest tier guidance.
  function nForMargin(g, targetPp) {
    const { p } = samplingError(g);
    const pv = p == null ? 0.25 : Math.max(p * (1 - p), 0.0001);
    return Math.ceil((1.96 * 1.96 * pv) / Math.pow(targetPp / 100, 2));
  }

  /* ---- 3. segments: computed from the roster, deltas SIGNED ---- */
  function segments(g) {
    return G.of(g, 'segment').map(seg => {
      const personas = G.sources(g, seg.id, 'in_segment');
      const us = personas
        .map(p => G.targets(g, p.id, 'voiced_by')[0] || null)
        .filter(Boolean);
      const n = us.length;
      const pos = us.filter(u => u.sentiment === 'positive').length;
      const positivePct = n ? Math.round(pos / n * 100) : 0;
      return {
        id: seg.id, key: seg.key, name: seg.name, n,
        positivePct,
        meanIntent: r1(mean(us.map(u => u.intent))),
        // Signed. A real segment must be able to score BELOW the overall rate;
        // the old mock's segment was overall + random(0,12) and never could.
        vsOverall: positivePct - panelStats(g).positive.pct,
        marginOfError: propCI(pos, n)
      };
    }).sort((a, b) => b.positivePct - a.positivePct);
  }

  /* ---- 4. polarisation: is the mean describing anybody? ---- */
  // eta-squared — the share of intent variance explained by segment membership.
  // High means the market splits and the headline average describes nobody, so
  // the memo should lead with the split rather than the mean.
  function polarisation(g) {
    const segs = G.of(g, 'segment').map(seg => {
      const us = G.sources(g, seg.id, 'in_segment')
        .map(p => G.targets(g, p.id, 'voiced_by')[0] || null).filter(Boolean);
      return us.map(u => u.intent);
    }).filter(a => a.length);

    const all = [].concat.apply([], segs);
    if (all.length < 2 || segs.length < 2) {
      return { etaSquared: 0, splits: false, note: 'Too few segments to measure.' };
    }
    const grand = mean(all);
    const between = sum(segs.map(a => a.length * Math.pow(mean(a) - grand, 2)));
    const within  = sum(segs.map(a => sum(a.map(x => Math.pow(x - mean(a), 2)))));
    const total = between + within;
    const eta = total ? between / total : 0;
    // 0.25 is a starting heuristic, not a law — tune once real studies exist.
    const splits = eta >= 0.25;
    return {
      etaSquared: Math.round(eta * 100) / 100,
      splits,
      note: splits
        ? 'Segment membership explains ' + Math.round(eta * 100) + '% of the variance in ' +
          'intent. The overall average describes no actual group — lead with the split.'
        : 'Segments broadly agree; the overall average is representative.'
    };
  }

  /* ---- 5. objection mass: share of negative responses, per objection ---- */
  function objectionMass(g) {
    // Denominator is the number of respondents who raised ANY objection — not
    // just the negative ones. Positive personas object too (they liked it *and*
    // named a blocker), so dividing by the negative count alone would let the
    // shares total more than 100%.
    const objectors = new Set();
    G.of(g, 'objection').forEach(o => {
      G.sources(g, o.id, 'supports').forEach(u => objectors.add(u.id));
    });
    const denom = objectors.size || panelStats(g).n || 1;
    return G.of(g, 'objection').map(o => {
      const us = G.sources(g, o.id, 'supports');
      const personas = us.map(u => G.sources(g, u.id, 'voiced_by')[0]).filter(Boolean);
      const segNames = personas
        .map(p => (G.targets(g, p.id, 'in_segment')[0] || {}).name)
        .filter(Boolean);
      const tally = {};
      segNames.forEach(s => { tally[s] = (tally[s] || 0) + 1; });
      const top = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
      return {
        id: o.id, key: o.key, text: o.text, category: o.category,
        count: us.length,
        pct: Math.round(us.length / denom * 100),
        concentratedIn: top && top[1] > 1 ? top[0] : null,
        evidence: us.slice(0, 3).map(u => u.text)
      };
    }).sort((a, b) => b.count - a.count);
  }

  /* ---- 5b. objection clusters: the ranked table ---- */
  // Individual objections keep their own wording (that specificity is the
  // product), but the ranked table is by category. Free text underneath each
  // row supplies the verbatims. Without this the table is one row per
  // respondent, which ranks nothing.
  function objectionClusters(g) {
    const detail = objectionMass(g);
    const denomPct = detail.length ? detail[0].pct / Math.max(detail[0].count, 1) : 0;
    const groups = {};
    detail.forEach(o => {
      const c = (groups[o.category] = groups[o.category] ||
        { category: o.category, count: 0, objections: [], evidence: [], segs: {} });
      c.count += o.count;
      c.objections.push(o.text);
      c.evidence = c.evidence.concat(o.evidence);
      if (o.concentratedIn) c.segs[o.concentratedIn] = (c.segs[o.concentratedIn] || 0) + o.count;
    });
    return Object.values(groups).map(c => {
      // Recompute concentration across the whole cluster, not per objection.
      const segTally = {};
      G.of(g, 'objection').filter(o => o.category === c.category).forEach(o => {
        G.sources(g, o.id, 'supports').forEach(u => {
          const p = G.sources(g, u.id, 'voiced_by')[0];
          const seg = p && G.targets(g, p.id, 'in_segment')[0];
          if (seg) segTally[seg.name] = (segTally[seg.name] || 0) + 1;
        });
      });
      const top = Object.entries(segTally).sort((a, b) => b[1] - a[1])[0];
      return {
        category: c.category,
        count: c.count,
        pct: Math.round(c.count * denomPct),
        distinctObjections: c.objections.length,
        objections: c.objections,
        evidence: c.evidence.slice(0, 3),
        concentratedIn: top && top[1] > 1 ? top[0] : null,
        concentration: top ? Math.round(top[1] / c.count * 100) : null
      };
    }).sort((a, b) => b.count - a.count);
  }

  /* ---- 6. load-bearing: how much of the verdict rests on each assumption ---- */
  function loadBearing(g) {
    const masses = {};
    objectionMass(g).forEach(o => { masses[o.id] = o.pct; });

    return G.of(g, 'assumption').map(a => {
      const attackers = G.sources(g, a.id, 'threatens').filter(n => n.type === 'objection');
      const threatenedMass = sum(attackers.map(o => masses[o.id] || 0));
      const dependents = G.sources(g, a.id, 'depends_on');
      const verdictDependent = dependents.some(n => n.type === 'branch');
      // Explainable on purpose: mass carried, doubled when a branch verdict
      // rests on it. A founder must be able to see why this ranked first.
      const score = threatenedMass * (verdictDependent ? 1 : 0.5);

      // Can the panel settle this at all? If a factual claim is in the way, no
      // amount of extra personas helps.
      const blockers = G.sources(g, a.id, 'threatens')
        .concat(G.targets(g, a.id, 'threatens'))
        .filter(n => n.type === 'claim' && n.warrant === 'factual');

      return {
        id: a.id, key: a.key, text: a.text,
        threatenedMass, verdictDependent, score: Math.round(score),
        dependentBranches: dependents.filter(n => n.type === 'branch').map(b => b.label),
        needsExternalVerification: blockers.length > 0,
        blockedBy: blockers.map(c => c.text)
      };
    }).sort((a, b) => b.score - a.score);
  }

  /* ---- 7. leverage: ranked, with a CEILING — never a forecast ---- */
  function leverage(g) {
    return loadBearing(g).map(a => ({
      assumption: a.text,
      assumptionId: a.id,
      rank: 0,
      // The share of negative responses attached to this assumption. This is
      // the most that addressing it could possibly recover, not a prediction
      // of what it would recover. Views MUST label it as a ceiling.
      addressableMass: a.threatenedMass,
      isCeilingNotForecast: true,
      whyItRanks: a.verdictDependent
        ? 'Carries ' + a.threatenedMass + '% of negative responses and a branch verdict depends on it.'
        : 'Carries ' + a.threatenedMass + '% of negative responses.',
      resolvedBy: G.sources(g, a.id, 'resolves').map(x => ({ id: x.id, text: x.text })),
      needsExternalVerification: a.needsExternalVerification
    })).map((x, i) => (x.rank = i + 1, x));
  }

  /* ---- 8. confidence, decomposed so it can explain itself ---- */
  function confidence(g) {
    const err = samplingError(g);
    const segs = segments(g);
    const lb = loadBearing(g);
    const pol = polarisation(g);

    const weakest = segs.filter(s => s.n > 0).sort((a, b) => a.n - b.n)[0] || null;
    const coverageWeak = !!weakest && weakest.n < 20;

    // A factual blocker on a top-ranked assumption is a hard ceiling: no panel
    // size fixes it, so it dominates whatever the sampling error says.
    const blocked = lb.filter(a => a.needsExternalVerification).slice(0, 3);
    const warrantCeiling = blocked.length > 0;

    let level = err.marginOfError == null ? 'low'
              : err.marginOfError < 5  ? 'high'
              : err.marginOfError < 10 ? 'moderate' : 'low';
    if (coverageWeak && level === 'high') level = 'moderate';
    if (warrantCeiling && level === 'high') level = 'moderate';

    const reasons = [];
    reasons.push({
      term: 'sampling',
      detail: 'n=' + err.n + ', headline figure ±' + err.marginOfError + 'pp at 95%.'
    });
    reasons.push({
      term: 'coverage',
      detail: coverageWeak
        ? 'Thin representation: "' + weakest.name + '" has only ' + weakest.n +
          ' responses (±' + weakest.marginOfError + 'pp on its own).'
        : 'All segments carry enough responses to read individually.'
    });
    if (warrantCeiling) {
      reasons.push({
        term: 'warrant',
        detail: 'Load-bearing assumptions rest on unverified factual claims: ' +
                blocked.map(b => '"' + b.text + '"').join('; ') +
                '. A panel cannot settle these at any size.'
      });
    }
    if (pol.splits) {
      reasons.push({ term: 'polarisation', detail: pol.note });
    }

    // What would most raise confidence — dominant term wins, and sometimes the
    // honest answer is that buying more credits will not help.
    let raise;
    if (warrantCeiling) {
      raise = {
        term: 'warrant',
        action: 'Get external verification of: ' + blocked.map(b => b.text).join('; '),
        moreCreditsHelp: false,
        note: 'A larger panel will not raise confidence here. This needs a specialist.'
      };
    } else if (coverageWeak) {
      raise = {
        term: 'coverage',
        action: 'Run a panel weighted toward "' + weakest.name + '".',
        moreCreditsHelp: true
      };
    } else {
      const target = err.marginOfError > 7 ? 5 : 3;
      const need = nForMargin(g, target);
      raise = {
        term: 'sampling',
        action: 'A larger panel: about ' + need + ' responses would give ±' + target + 'pp.',
        moreCreditsHelp: true,
        suggestedN: need
      };
    }

    return { level, marginOfError: err.marginOfError, n: err.n, reasons, raise };
  }

  /* ---- 9. what to test first ---- */
  function experiments(g) {
    const lbById = {};
    loadBearing(g).forEach(a => { lbById[a.id] = a; });
    return G.of(g, 'experiment').map(x => {
      const resolved = G.targets(g, x.id, 'resolves');
      const scores = resolved.map(t => (lbById[t.id] || {}).score || 0);
      return {
        id: x.id, key: x.key, text: x.text,
        variantA: x.variantA, variantB: x.variantB, measures: x.measures,
        resolves: resolved.map(t => t.text),
        // Ranked by the load it removes, not by a guessed uncertainty delta.
        removesLoad: Math.max.apply(null, scores.concat([0]))
      };
    }).sort((a, b) => b.removesLoad - a.removesLoad);
  }

  /* ---- 10. one call: everything the Strategist is allowed to consume ---- */
  function evidence(g) {
    const check = G.validate(g);
    return {
      valid: check.ok,
      errors: check.errors,
      stats: panelStats(g),
      sampling: samplingError(g),
      segments: segments(g),
      polarisation: polarisation(g),
      objections: objectionClusters(g),
      objectionDetail: objectionMass(g),
      assumptions: loadBearing(g),
      leverage: leverage(g),
      confidence: confidence(g),
      experiments: experiments(g),
      branches: G.of(g, 'branch').map(b => ({
        id: b.id, label: b.label, verdict: b.verdict, why: b.why,
        restsOn: G.targets(g, b.id, 'depends_on').map(a => a.text)
      })),
      // Claims split by warrant, so views can never render a factual claim
      // with a confidence figure attached to it.
      claims: G.of(g, 'claim').reduce((acc, c) => {
        (acc[c.warrant] = acc[c.warrant] || []).push({
          id: c.id, key: c.key, text: c.text,
          attestedBy: G.sources(g, c.id, 'supports').length,
          derivedFrom: G.targets(g, c.id, 'derived_from').map(n => n.text)
        });
        return acc;
      }, {})
    };
  }

  return {
    panelStats, samplingError, nForMargin, segments, polarisation,
    objectionMass, objectionClusters, loadBearing, leverage, confidence,
    experiments, evidence
  };
})();
