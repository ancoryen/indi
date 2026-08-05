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

  // Largest-remainder rounding for any percentage column that has to add up.
  // Rounding each share independently has broken this engine three separate
  // times — seven objection categories totalling 104%, segments at 101%, and a
  // two-option fork reading 53% and 48%. Every figure was individually correct
  // and the table was still visibly wrong, so all share columns route here.
  function largestRemainder(counts, denom) {
    const exact = counts.map(c => (denom ? c / denom * 100 : 0));
    const target = Math.round(sum(exact));
    const floors = exact.map(Math.floor);
    let left = target - sum(floors);
    const order = exact.map((e, i) => ({ i, frac: e - Math.floor(e) }))
      .sort((a, b) => b.frac - a.frac);
    const out = floors.slice();
    for (let k = 0; k < order.length && left > 0; k++, left--) out[order[k].i]++;
    return out;
  }

  // Branch-preference and substitute responses are evidence for the branch and
  // for current behaviour respectively, not for how the idea landed. Keeping
  // them out of the headline statistics stops a fork from silently doubling the
  // apparent panel size. Allow-list rather than deny-list: a new `about` value
  // added later must opt IN to the headline figure, not leak into it.
  const isIdea = (u) => (u.about || 'idea') === 'idea';
  const ideaUtterances = (g) => G.of(g, 'utterance').filter(isIdea);
  const utteranceFor = (g, personaId) =>
    G.targets(g, personaId, 'voiced_by').filter(isIdea)[0] || null;

  /* ---- 1. panel stats: the raw distribution ---- */
  function panelStats(g) {
    const us = ideaUtterances(g);
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

  // The inverse, for the pre-flight estimate: what margin does a panel of n
  // buy, before a study is run and therefore before any p is known? p=0.5 is
  // the worst case and so the only honest assumption to quote up front —
  // quoting a narrower one would be selling a precision the study may not
  // deliver. Same Agresti-Coull adjustment as the real figure, so the estimate
  // and the result are computed the same way.
  function marginForN(n, p) {
    if (!n || n < 1) return null;
    const pv = p == null ? 0.5 : p;
    const nt = n + 4, pt = (pv * n + 2) / nt;
    return r1(1.96 * Math.sqrt(pt * (1 - pt) / nt) * 100);
  }

  /* ---- 3a. archetype segments: the ASSIGNED grouping ---- */
  // Kept, but no longer what the memo reports. These are an input — the roster
  // code decided them before anyone answered — so reporting them as a finding
  // was echoing our own configuration back at the reader. They survive for two
  // jobs: provenance (what mix was asked) and polarisation, which needs a
  // grouping that is INDEPENDENT of the responses being measured.
  function archetypeSegments(g) {
    return G.of(g, 'segment').map(seg => {
      const personas = G.sources(g, seg.id, 'in_segment');
      const memberIds = personas.map(p => p.id);
      const us = personas.map(p => utteranceFor(g, p.id)).filter(Boolean);
      const n = us.length;
      const pos = us.filter(u => u.sentiment === 'positive').length;
      const positivePct = n ? Math.round(pos / n * 100) : 0;
      return {
        id: seg.id, key: seg.key, name: seg.name, n, memberIds,
        // An assigned segment IS a graph node, so it can cite itself.
        cites: [seg.id],
        positivePct,
        meanIntent: r1(mean(us.map(u => u.intent))),
        // Signed. A real segment must be able to score BELOW the overall rate;
        // the old mock's segment was overall + random(0,12) and never could.
        vsOverall: positivePct - panelStats(g).positive.pct,
        marginOfError: propCI(pos, n)
      };
    }).sort((a, b) => b.positivePct - a.positivePct);
  }

  /* ---- 3b. response segments: the DISCOVERED grouping ---- */
  // What the memo reports. Groups come out of RClusters (answer similarity),
  // and this layer adds the statistics: signed delta against the panel and an
  // Agresti-Coull interval, exactly as for any other proportion.
  function responseSegments(g) {
    const RC = window.RClusters;
    // Degrade to the assigned grouping rather than to nothing. Returning an
    // empty list when the clustering module is absent silently deleted the
    // entire segment table — which is what a single missing script tag would
    // do in production, and what it did do across four test files here.
    if (!RC) {
      const fallback = archetypeSegments(g);
      return {
        segments: fallback, k: fallback.length, separation: 0, weak: true,
        method: 'assigned-archetype',
        note: 'Response clustering is unavailable, so these are the roster groups as ' +
              'assigned rather than groups discovered from the answers.'
      };
    }
    const res = RC.cluster(g);
    const overall = panelStats(g).positive.pct;
    return Object.assign({}, res, {
      segments: res.segments.map(s => Object.assign({}, s, {
        // A discovered group is computed, not stored, so its own id (`rc_1`) is
        // not a graph node and citing it produces a dangling reference — which
        // is exactly what the verifiers caught. It cites its members instead,
        // which is both valid and more useful: following the citation reaches
        // the people whose answers put them in this group.
        cites: (s.memberIds || []).slice(0, 3),
        vsOverall: s.positivePct - overall,
        // The positive COUNT has to be reconstructed for the interval; the
        // cluster reports a rounded percentage and rounding twice would put the
        // margin on a number the table never shows.
        marginOfError: propCI(Math.round(s.positivePct / 100 * s.n), s.n)
      }))
    });
  }

  /* ---- 4. polarisation: is the mean describing anybody? ---- */
  // eta-squared — the share of intent variance explained by segment membership.
  // High means the market splits and the headline average describes nobody, so
  // the memo should lead with the split rather than the mean.
  //
  // Measured over ASSIGNED archetypes, never over response clusters, and that
  // is not a leftover. Clusters are built partly FROM intent, so measuring how
  // much intent variance they explain would be circular — it would report high
  // polarisation on every study by construction, including panels that agree.
  // The grouping has to be independent of the quantity being explained.
  function polarisation(g) {
    const segs = G.of(g, 'segment').map(seg => {
      const us = G.sources(g, seg.id, 'in_segment')
        .map(p => utteranceFor(g, p.id)).filter(Boolean);
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
  // `segs` is the response-segment array, so "concentrated in" names a group
  // the reader can see in the segment table rather than an archetype label they
  // never chose. Falls back to assigned segments when it is absent.
  function objectionClusters(g, segs) {
    const nameByPersona = {};
    const segSizes = {};
    const definingCat = {};
    (segs || []).forEach(s => {
      segSizes[s.name] = s.n;
      if (s.topCategory) definingCat[s.name] = s.topCategory;
      (s.memberIds || []).forEach(id => { nameByPersona[id] = s.name; });
    });
    const segNameFor = (personaId) => {
      if (nameByPersona[personaId]) return nameByPersona[personaId];
      const seg = G.targets(g, personaId, 'in_segment')[0];
      return seg ? seg.name : null;
    };
    if (!(segs || []).length) {
      G.of(g, 'persona').forEach(p => {
        const name = segNameFor(p.id);
        if (name) segSizes[name] = (segSizes[name] || 0) + 1;
      });
    }
    const detail = objectionMass(g);
    const objectors = new Set();
    G.of(g, 'objection').forEach(o => {
      G.sources(g, o.id, 'supports').forEach(u => objectors.add(u.id));
    });
    const denom = objectors.size || panelStats(g).n || 1;
    const groups = {};
    detail.forEach(o => {
      const c = (groups[o.category] = groups[o.category] ||
        { category: o.category, count: 0, objections: [], evidence: [], segs: {} });
      c.count += o.count;
      c.objections.push(o.text);
      c.evidence = c.evidence.concat(o.evidence);
      if (o.concentratedIn) c.segs[o.concentratedIn] = (c.segs[o.concentratedIn] || 0) + o.count;
    });
    const list = Object.values(groups);
    const pcts = largestRemainder(list.map(c => c.count), denom);

    const rows = list.map((c, ci) => {
      // Recompute concentration across the whole cluster, not per objection.
      const segTally = {};
      G.of(g, 'objection').filter(o => o.category === c.category).forEach(o => {
        G.sources(g, o.id, 'supports').forEach(u => {
          const p = G.sources(g, u.id, 'voiced_by')[0];
          const name = p && segNameFor(p.id);
          if (name) segTally[name] = (segTally[name] || 0) + 1;
        });
      });
      const top = Object.entries(segTally).sort((a, b) => b[1] - a[1])[0];

      // "Concentrated in X" has to mean more than "X is the biggest group".
      //
      // The plain majority test reported a critical objection as concentrated
      // in a cluster holding 55% of the panel — which was simply where most of
      // everything was. Concentration is a LIFT: the group's share of this
      // objection against its share of the panel. Below the bar, the objection
      // is spread out, and saying so is more useful than naming a group.
      const segSize = top ? (segSizes[top[0]] || 0) : 0;
      const panelN = panelStats(g).n || 1;
      const objShare = top ? top[1] / c.count : 0;
      const baseShare = segSize / panelN;
      const lift = baseShare > 0 ? objShare / baseShare : 0;
      // And it must not be tautological. Objection category is one of the
      // features groups are formed from, so a group is often DEFINED by this
      // very objection — at which point "safeguarding is concentrated in the
      // safeguarding-worried group" restates the group's own name and tells
      // the reader nothing. The segment table already shows that group, its
      // size and who is in it.
      const tautological = !!top && definingCat[top[0]] === c.category;
      const concentrated = !!top && top[1] > 1 && objShare >= 0.3 &&
                           lift >= 1.5 && !tautological;

      // Severity is the assigned tier and nothing else.
      //
      // A first version also escalated a tier when the objection threatened a
      // verdict-bearing or externally-blocked assumption. It fired on three of
      // seven categories in the first real run, because `assemble` attaches
      // branches to assumptions by index — so the rule was reading graph
      // bookkeeping, not meaning, and a tier that most things reach is not a
      // tier. Whether an assumption carries the verdict is already reported,
      // measured and explained, in the leverage section. It belongs there.
      const severity = G.OBJECTION_SEVERITY[c.category] || 'low';

      return {
        category: c.category,
        count: c.count,
        pct: pcts[ci],
        distinctObjections: c.objections.length,
        objections: c.objections,
        evidence: c.evidence.slice(0, 3),
        concentratedIn: concentrated ? top[0] : null,
        concentration: concentrated ? Math.round(objShare * 100) : null,
        // How much more than its share of the panel — the figure that makes
        // the claim mean something.
        concentrationLift: concentrated ? Math.round(lift * 10) / 10 : null,
        // An assigned prior about what this KIND of objection costs to be wrong
        // about. Not a measurement, and never to be rendered as one — the panel
        // did not vote on it.
        severity,
        severityBasis: 'assigned',
        severityWhy: G.SEVERITY_WHY[c.category] || null
      };
    });

    // Two orderings, because they answer different questions. `count` order is
    // what the panel talked about most; `priority` order is what to deal with
    // first. A critical objection at 6% outranks an execution detail at 40%,
    // and collapsing that into one column was the reasoning gap.
    const byMass = rows.slice().sort((a, b) => b.count - a.count);
    const tier = (s) => G.SEVERITY_TIERS.indexOf(s);
    byMass.forEach((r, i) => { r.massRank = i + 1; });
    rows.slice().sort((a, b) => tier(a.severity) - tier(b.severity) || b.count - a.count)
        .forEach((r, i) => { r.priorityRank = i + 1; });
    return byMass;
  }

  /* ---- 6. load-bearing: how much of the verdict rests on each assumption ---- */
  function loadBearing(g) {
    const masses = {};
    objectionMass(g).forEach(o => { masses[o.id] = o.pct; });

    return G.of(g, 'assumption').map(a => {
      // Dedupe by node id before summing. The graph now enforces unique edges,
      // but a mass that can exceed 100% is a silent lie in a user-facing figure,
      // so this stays as a second line of defence.
      const seen = {};
      const attackers = G.sources(g, a.id, 'threatens')
        .filter(n => n.type === 'objection')
        .filter(n => (seen[n.id] ? false : (seen[n.id] = true)));
      const threatenedMass = Math.min(sum(attackers.map(o => masses[o.id] || 0)), 100);
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
  // `segs` is passed in by `evidence()` so clustering runs once per study
  // rather than once per consumer; it falls back to computing its own.
  function confidence(g, segs) {
    const err = samplingError(g);
    segs = segs || responseSegments(g).segments;
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

  /* ---- 9b. branch shares, rounded so the column adds up ---- */
  // Rounding each branch independently made a two-option fork read 53% and 48%.
  // Largest-remainder keeps the displayed shares summing to the true total —
  // the same fix the objection table needed.
  function branchShares(g) {
    const panelN = panelStats(g).n || 1;
    const rows = G.of(g, 'branch').map(b => {
      const votes = G.sources(g, b.id, 'supports').filter(u => u.type === 'utterance');
      return { b, votes, evaluated: votes.length > 0 && b.verdict != null };
    });
    const shares = largestRemainder(rows.map(r => r.votes.length), panelN);
    return rows.map((r, i) => Object.assign({}, r, { share: shares[i] }));
  }

  /* ---- 9c. substitutes: what the audience does today ---- */
  // The competitive question a panel can actually answer is not "who are the
  // competitors" — it cannot know that — but "what are these people doing
  // instead, and would they stop". Stickiness matters more than enthusiasm:
  // the respondents most willing to switch are often the ones using nothing,
  // who have neither a switching cost nor a demonstrated willingness to pay.
  // Reporting switch intent without that split flatters the result.
  function substitutes(g) {
    const nodes = G.of(g, 'substitute');
    const panelN = panelStats(g).n || 1;
    if (!nodes.length) return { n: 0, byKind: [], named: [], note: 'No substitute data in this study.' };

    const rows = nodes.map(s => {
      const us = G.sources(g, s.id, 'supports').filter(u => u.type === 'utterance');
      return { node: s, utterances: us, count: us.length };
    });

    const kinds = {};
    rows.forEach(r => {
      const k = (kinds[r.node.kind] = kinds[r.node.kind] ||
        { kind: r.node.kind, count: 0, intents: [], texts: [] });
      k.count += r.count;
      r.utterances.forEach(u => k.intents.push(u.intent));
      k.texts.push(r.node.text);
    });

    const kindList = Object.values(kinds).sort((a, b) => b.count - a.count);
    const total = sum(kindList.map(k => k.count)) || 1;
    const kindPct = largestRemainder(kindList.map(k => k.count), total);

    const byKind = kindList.map((k, i) => {
      const spec = G.SUBSTITUTE_KINDS[k.kind] || {};
      const willing = k.intents.filter(x => x >= 4).length;
      return {
        kind: k.kind, label: spec.label || k.kind,
        count: k.count, pct: kindPct[i],
        monetised: spec.monetised === true,
        stickiness: spec.stickiness,
        meanSwitchIntent: r1(mean(k.intents)),
        wouldSwitchPct: k.count ? Math.round(willing / k.count * 100) : 0,
        wouldSwitchN: willing,
        marginOfError: propCI(willing, k.count)
      };
    });

    const paid = byKind.filter(k => k.monetised);
    const free = byKind.filter(k => !k.monetised);
    const paidN = sum(paid.map(k => k.count));
    const freeN = sum(free.map(k => k.count));
    const paidSwitch = sum(paid.map(k => k.wouldSwitchN));
    const freeSwitch = sum(free.map(k => k.wouldSwitchN));

    const named = rows.sort((a, b) => b.count - a.count).slice(0, 8).map(r => ({
      text: r.node.text, kind: r.node.kind, count: r.count,
      pct: Math.round(r.count / total * 100)
    }));

    const paidSwitchPct = paidN ? Math.round(paidSwitch / paidN * 100) : null;
    const freeSwitchPct = freeN ? Math.round(freeSwitch / freeN * 100) : null;

    return {
      n: total,
      coverage: Math.round(total / panelN * 100),
      byKind, named,
      monetisedPct: Math.round(paidN / total * 100),
      paidSwitchPct, freeSwitchPct,
      // Stated as a comparison of two measured rates, never as a forecast of
      // who will actually convert.
      note: paidSwitchPct != null && freeSwitchPct != null
        ? (freeSwitchPct > paidSwitchPct + 10
            ? 'Switching interest is concentrated among respondents who pay for nothing today (' +
              freeSwitchPct + '% vs ' + paidSwitchPct + '%). Demand here is not the same as revenue.'
            : paidSwitchPct > freeSwitchPct + 10
              ? 'Respondents already paying for something are the more willing switchers (' +
                paidSwitchPct + '% vs ' + freeSwitchPct + '%) — the budget already exists.'
              : 'Switching interest is similar whether or not the respondent pays for something today.')
        : 'Not enough substitute data to compare paid and unpaid alternatives.'
    };
  }

  /* ---- 9d. flip conditions: what would change the answer ---- */
  // Three tests, all computed. This is the part a founder actually needs and
  // the part a generated "risk assessment" would invent: not a self-assigned
  // confidence penalty, but the specific, checkable circumstances under which
  // the recommendation reverses.
  function flipConditions(g, branchRows, segs, lev) {
    const flips = [];
    const evaluated = (branchRows || []).filter(b => b.evaluated);

    // (1) Is the lead inside the noise?
    //
    // For a two-option forced choice the shares are one proportion, not two
    // independent ones: the right test is whether the winner's interval still
    // clears 50%. Summing the two margins (the obvious move) treats a paired
    // comparison as two separate polls and roughly doubles the bound, which
    // would report a genuine 60/40 result as a tie.
    if (evaluated.length === 2) {
      const [a, b] = evaluated.slice().sort((x, y) => y.preferenceShare - x.preferenceShare);
      const moe = a.marginOfError || 0;
      if (a.preferenceShare - moe <= 50) {
        flips.push({
          type: 'margin', measured: true,
          text: '"' + a.label + '" took ' + a.preferenceShare + '% against ' +
                b.preferenceShare + '%, but at ±' + moe + 'pp that interval still ' +
                'includes an even split. This panel cannot separate the two options — ' +
                'a rerun could reverse the order.',
          fixedBy: 'a larger panel'
        });
      }
    } else if (evaluated.length > 2) {
      // Three or more options: no single 50% threshold applies, so fall back to
      // the conservative sum-of-intervals bound and say that is what it is.
      const [a, b] = evaluated.slice().sort((x, y) => y.preferenceShare - x.preferenceShare);
      const lead = a.preferenceShare - b.preferenceShare;
      const bound = r1((a.marginOfError || 0) + (b.marginOfError || 0));
      if (lead <= bound) {
        flips.push({
          type: 'margin', measured: true,
          text: '"' + a.label + '" leads "' + b.label + '" by ' + lead + 'pp, within the ±' +
                bound + 'pp this panel can resolve across ' + evaluated.length +
                ' options. The order between the leaders is not settled.',
          fixedBy: 'a larger panel'
        });
      }
    }

    // (2) Does any discovered group want the other option? Fully measured, and
    // the most useful of the three: it converts "who is your real market" from
    // a philosophical question into an arithmetic one.
    if (evaluated.length >= 2) {
      const overallTop = evaluated.slice()
        .sort((x, y) => y.preferenceShare - x.preferenceShare)[0];
      (segs || []).forEach(s => {
        if (!s.branchPreference || !s.n) return;
        if (s.branchPreference.value === overallTop.label) return;
        // The group's OWN preference has to clear its OWN interval. Without
        // this the section manufactured findings: a 25-person cluster split
        // 52/48 was being reported as "the answer reverses here", when ±18pp
        // on that n cannot distinguish it from a coin toss. A flip condition
        // that is itself noise is worse than no flip condition.
        const segMoe = propCI(Math.round(s.branchPreference.pct / 100 * s.n), s.n);
        if (segMoe == null || s.branchPreference.pct - segMoe <= 50) return;
        flips.push({
          type: 'segment', measured: true,
          text: 'If your real market is "' + s.name + '" (' + s.n + ' of ' +
                (panelStats(g).n || 0) + ' respondents), the answer reverses: that group backed "' +
                s.branchPreference.value + '" by ' + s.branchPreference.pct + '% (±' + segMoe + 'pp).',
          segment: s.name, prefers: s.branchPreference.value, n: s.n, marginOfError: segMoe
        });
      });
    }

    // (3) The load-bearing assumption. Mass is measured; the consequence is
    // explicitly conditional and labelled a ceiling like everywhere else.
    const top = (lev || [])[0];
    if (top) {
      flips.push({
        type: 'assumption', measured: false, conditional: true,
        text: 'If "' + top.assumption + '" turns out to be false, the ' +
              top.addressableMass + '% of objections attached to it come back into play.',
        addressableMass: top.addressableMass,
        isCeilingNotForecast: true,
        needsExternalVerification: top.needsExternalVerification
      });
    }

    return flips;
  }

  /* ---- 10. one call: everything the Strategist is allowed to consume ---- */
  function evidence(g) {
    const check = G.validate(g);
    // Clustering is the one expensive step (O(n²) for the silhouette), so it
    // runs once here and is threaded into everything that needs it.
    const rs = responseSegments(g);
    const lev = leverage(g);
    const branchRows = branchShares(g).map(({ b, votes, evaluated, share }) => ({
      id: b.id, label: b.label,
      evaluated,
      verdict: evaluated ? b.verdict : null,
      why: evaluated ? b.why : 'Not evaluated by this panel.',
      n: votes.length,
      preferenceShare: evaluated ? share : null,
      meanIntent: evaluated && votes.length ? r1(mean(votes.map(u => u.intent))) : null,
      marginOfError: evaluated ? propCI(votes.length, panelStats(g).n || 1) : null,
      restsOn: G.targets(g, b.id, 'depends_on').map(a => a.text)
    }));

    return {
      valid: check.ok,
      errors: check.errors,
      stats: panelStats(g),
      sampling: samplingError(g),
      // What the memo reports: groups DISCOVERED from how people answered.
      segments: rs.segments,
      clustering: {
        method: rs.method, k: rs.k, separation: rs.separation,
        weak: rs.weak, note: rs.note
      },
      // The ASSIGNED roster mix, kept for provenance — this is an input.
      archetypeSegments: archetypeSegments(g),
      polarisation: polarisation(g),
      objections: objectionClusters(g, rs.segments),
      objectionDetail: objectionMass(g),
      substitutes: substitutes(g),
      assumptions: loadBearing(g),
      leverage: lev,
      confidence: confidence(g, rs.segments),
      flips: flipConditions(g, branchRows, rs.segments, lev),
      experiments: experiments(g),
      // A branch reports what was MEASURED. `evaluated` is false when no
      // persona assessed it, and an unevaluated branch carries no verdict, no
      // share and no margin — there is nowhere in the shape to put one.
      branches: branchRows,
      branchesEvaluated: G.of(g, 'branch')
        .every(b => G.sources(g, b.id, 'supports').length > 0 && b.verdict != null),
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
    panelStats, samplingError, nForMargin, marginForN, propCI, largestRemainder,
    archetypeSegments, responseSegments, polarisation,
    objectionMass, objectionClusters, substitutes, flipConditions,
    loadBearing, leverage, confidence, experiments, branchShares, evidence,
    // Retained so older callers keep resolving; the memo now reports the
    // discovered grouping, not this one.
    segments: archetypeSegments
  };
})();
