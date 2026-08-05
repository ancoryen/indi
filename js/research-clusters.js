// Indizilla Research — response clustering.
//
// A segment should be a FINDING, not an input. Until now ours were neither:
// the six archetypes were assigned when the roster was built, so every study
// ever run reported the same six groups with the same names, and the stress
// batch duly found "Early adopters" strongest in 10 of 10 unrelated ideas.
// That is not a result about the market, it is a result about our own roster
// code being echoed back at the reader.
//
// So attributes are still ASSIGNED for generation — that is what makes a panel
// computable at all — but groups are DISCOVERED from how people actually
// answered. A cluster is then described by what its members happen to share,
// which is the part a founder can act on: "the people blocked on price are 80%
// gatekeepers on an in-house tool" is a sentence the archetype model could
// never produce, because it had already decided the answer.
//
// Everything here is deterministic. No RNG: seeds come from farthest-first
// traversal over a stable point order, so the same panel always yields the same
// clusters. That matters because the alternative — segments that reshuffle on
// re-read — would make the memo disagree with itself.

window.RClusters = (() => {
  const G = window.RGraph;

  /* ---- feature weights ------------------------------------------------
     What counts as "answering similarly". These are a starting point tuned so
     that no single dimension can dominate: two people who differ only in
     objection category sit about as far apart as two who differ across the
     whole intent scale. Worth revisiting against real panels — but they must
     be revisited deliberately, not drifted into. */
  const W = {
    intent:    1.0,   // 1 dim, normalised 0..1
    sentiment: 0.5,   // 1 dim, correlated with intent so deliberately lighter
    category:  1.0,   // one-hot over objection categories
    substitute:0.7    // one-hot over what they use today
  };

  // Branch preference is deliberately NOT a feature.
  //
  // The first version weighted it at 0.9 and k-means promptly split the panel
  // along the fork: one cluster had backed option A, the other option B, and
  // the memo then announced "this segment prefers B" as a discovery. It was a
  // tautology — the group had been DEFINED by that preference. Clusters form
  // from reaction to the idea; which option each one then backs is a finding
  // about them, and only stays a finding while it is kept out of the input.
  // (Same trap as measuring polarisation over response clusters. See
  // research-evidence.js `polarisation`.)

  const MIN_CLUSTER = 3;      // fewer than this is a person, not a segment
  const MAX_K = 4;
  const WEAK_SEPARATION = 0.15;

  /* ---- 1. features: one vector per respondent ---- */
  function featurise(g) {
    const cats = G.OBJECTION_CATEGORIES;
    const subKinds = Object.keys(G.SUBSTITUTE_KINDS);

    return G.of(g, 'persona').map(p => {
      const voiced = G.targets(g, p.id, 'voiced_by').filter(n => n.type === 'utterance');
      const idea = voiced.find(u => u.about === 'idea') || null;
      const branchU = voiced.find(u => u.about === 'branch') || null;
      const subU = voiced.find(u => u.about === 'substitute') || null;

      // Which objection did this person raise, and which branch did they back?
      const objection = idea
        ? (G.targets(g, idea.id, 'supports').find(n => n.type === 'objection') || null)
        : null;
      const branchNode = branchU
        ? (G.targets(g, branchU.id, 'supports').find(n => n.type === 'branch') || null)
        : null;
      const subNode = subU
        ? (G.targets(g, subU.id, 'supports').find(n => n.type === 'substitute') || null)
        : null;

      const v = [];
      v.push(((idea ? idea.intent : 3) - 1) / 4 * W.intent);
      v.push((idea && idea.sentiment === 'positive' ? 1
            : idea && idea.sentiment === 'skeptical' ? 0 : 0.5) * W.sentiment);
      cats.forEach(c => v.push(objection && objection.category === c ? W.category : 0));
      subKinds.forEach(k => v.push(subNode && subNode.kind === k ? W.substitute : 0));

      return {
        personaId: p.id, persona: p, vector: v,
        utterance: idea,
        objection, branchNode, substitute: subNode
      };
    }).filter(pt => pt.utterance);   // no answer, no place in a segment
  }

  const dist = (a, b) => {
    let s = 0;
    for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
    return Math.sqrt(s);
  };
  const centroid = (pts) => {
    if (!pts.length) return null;
    const out = pts[0].vector.map(() => 0);
    pts.forEach(p => p.vector.forEach((x, i) => { out[i] += x; }));
    return out.map(x => x / pts.length);
  };

  /* ---- 2. k-means with deterministic seeding ---- */
  // Farthest-first traversal: start from the point furthest from the global
  // centroid, then repeatedly take the point furthest from everything already
  // chosen. No randomness, so no run-to-run drift.
  function seed(points, k) {
    const global = centroid(points);
    let first = points[0], best = -1;
    points.forEach(p => { const d = dist(p.vector, global); if (d > best) { best = d; first = p; } });
    const seeds = [first.vector.slice()];
    while (seeds.length < k) {
      let pick = null, far = -1;
      points.forEach(p => {
        const near = Math.min.apply(null, seeds.map(s => dist(p.vector, s)));
        if (near > far) { far = near; pick = p; }
      });
      if (!pick || far === 0) break;      // nothing left that is distinct
      seeds.push(pick.vector.slice());
    }
    return seeds;
  }

  function kmeans(points, k) {
    let centres = seed(points, k);
    if (centres.length < 2) return null;
    let assign = points.map(() => -1);

    for (let iter = 0; iter < 100; iter++) {
      let moved = false;
      points.forEach((p, i) => {
        let bestI = 0, bestD = Infinity;
        centres.forEach((c, ci) => { const d = dist(p.vector, c); if (d < bestD) { bestD = d; bestI = ci; } });
        if (assign[i] !== bestI) { assign[i] = bestI; moved = true; }
      });
      if (!moved && iter > 0) break;
      const next = centres.map((c, ci) => {
        const members = points.filter((_, i) => assign[i] === ci);
        return members.length ? centroid(members) : c;
      });
      centres = next;
    }
    return { assign, centres, k: centres.length };
  }

  // Mean silhouette: how well-separated the grouping actually is. Reported
  // rather than hidden — when a panel does not divide cleanly the honest
  // output is to say so, not to draw four confident boxes around noise.
  function silhouette(points, assign, k) {
    if (points.length < 3) return 0;
    const groups = [];
    for (let c = 0; c < k; c++) groups.push(points.filter((_, i) => assign[i] === c));
    if (groups.some(gp => gp.length === 0)) return -1;

    let total = 0;
    points.forEach((p, i) => {
      const own = groups[assign[i]];
      if (own.length <= 1) return;
      const a = own.filter(q => q !== p)
        .reduce((s, q) => s + dist(p.vector, q.vector), 0) / (own.length - 1);
      let b = Infinity;
      groups.forEach((gp, c) => {
        if (c === assign[i] || !gp.length) return;
        const m = gp.reduce((s, q) => s + dist(p.vector, q.vector), 0) / gp.length;
        if (m < b) b = m;
      });
      if (b === Infinity) return;
      const denom = Math.max(a, b);
      total += denom ? (b - a) / denom : 0;
    });
    return total / points.length;
  }

  /* ---- 3. naming: describe the group by what defines it ---- */
  const STANCE = (posPct, skepPct, meanIntent) =>
      posPct >= 60 ? 'Ready to buy'
    : skepPct >= 60 ? 'Unconvinced'
    : meanIntent >= 3 ? 'Persuadable'
    : 'Leaning against';

  const BLOCKER = {
    trust:        'need proof it works',
    price:        'blocked on price',
    relevance:    'not their problem',
    alternatives: 'happy with what they use',
    effort:       'held up by setup effort',
    regulatory:   'waiting on the compliance answer',
    dignity:      'uneasy about the framing',
    safeguarding: 'worried who gets hurt',
    other:        'want to see it first'
  };

  // A warm group still raises objections, and the blunt phrasing turned that
  // into nonsense: the first run produced "Ready to buy — not their problem",
  // which reads as a contradiction rather than the real finding, that these
  // people liked it while doubting it was meant for them. Positive stances take
  // the caveat form.
  const BLOCKER_SOFT = {
    trust:        'want proof it works',
    price:        'flag the price',
    relevance:    'unsure it is for them',
    alternatives: 'rate what they already use',
    effort:       'flag the setup effort',
    regulatory:   'want the compliance answer',
    dignity:      'uneasy about the framing',
    safeguarding: 'worried who gets hurt',
    other:        'want to see it first'
  };
  const WARM = ['Ready to buy', 'Persuadable'];
  const nameFor = (stance, cat) => {
    if (!cat) return stance;
    return WARM.indexOf(stance) !== -1
      ? stance + ' — still ' + (BLOCKER_SOFT[cat] || BLOCKER_SOFT.other)
      : stance + ' — ' + (BLOCKER[cat] || BLOCKER.other);
  };

  const share = (list, get) => {
    const tally = {};
    list.forEach(x => { const v = get(x); if (v) tally[v] = (tally[v] || 0) + 1; });
    return Object.entries(tally).sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, count, pct: Math.round(count / list.length * 100) }));
  };

  function describe(g, members, allBranches) {
    const n = members.length;
    const pos = members.filter(m => m.utterance.sentiment === 'positive').length;
    const skep = members.filter(m => m.utterance.sentiment === 'skeptical').length;
    const meanIntent = members.reduce((s, m) => s + m.utterance.intent, 0) / n;

    const cats = share(members, m => m.objection && m.objection.category);
    const topCat = cats[0] || null;
    const stance = STANCE(Math.round(pos / n * 100), Math.round(skep / n * 100), meanIntent);

    // The composition is the actionable half: the cluster is defined by how it
    // answered, and then described by who turned out to be in it.
    const archetypes = share(members, m => {
      const seg = G.targets(g, m.persona.id, 'in_segment')[0];
      return seg ? seg.name : null;
    });

    const branchPref = share(members, m => m.branchNode && m.branchNode.label);
    const subs = share(members, m => m.substitute && m.substitute.kind);

    return {
      n,
      name: nameFor(stance, topCat && topCat.value),
      stance,
      positivePct: Math.round(pos / n * 100),
      skepticalPct: Math.round(skep / n * 100),
      meanIntent: Math.round(meanIntent * 10) / 10,
      definedBy: topCat
        ? topCat.pct + '% of this group raised ' +
          (/^[aeiou]/i.test(topCat.value) ? 'an ' : 'a ') + topCat.value + ' objection'
        : 'no single objection dominates this group',
      topCategory: topCat ? topCat.value : null,
      categoryMix: cats.slice(0, 3),
      archetypeMix: archetypes.slice(0, 3),
      roleMix: share(members, m => m.persona.role).slice(0, 3),
      marketMix: share(members, m => m.persona.market).slice(0, 2),
      // Head-to-head: which option this group backed, and by how much.
      branchPreference: branchPref.length ? branchPref[0] : null,
      branchMargin: branchPref.length > 1 ? branchPref[0].pct - branchPref[1].pct
                  : branchPref.length === 1 ? 100 : null,
      branchMix: branchPref,
      substituteMix: subs,
      memberIds: members.map(m => m.personaId),
      allBranches
    };
  }

  /* ---- 4. one call ---- */
  function cluster(g) {
    const points = featurise(g);
    const allBranches = G.of(g, 'branch').map(b => b.label);

    if (points.length < MIN_CLUSTER * 2) {
      const one = points.length ? describe(g, points, allBranches) : null;
      return {
        segments: points.length ? [Object.assign({ id: 'rc_1', key: 'rc:all' }, one)] : [],
        k: points.length ? 1 : 0, separation: 0, weak: true,
        method: 'response-similarity',
        note: 'Too few responses to divide into groups; reported as one.'
      };
    }

    let best = null;
    for (let k = 2; k <= Math.min(MAX_K, Math.floor(points.length / MIN_CLUSTER)); k++) {
      const km = kmeans(points, k);
      if (!km) continue;
      const sizes = [];
      for (let c = 0; c < km.k; c++) sizes.push(km.assign.filter(a => a === c).length);
      if (sizes.some(s => s < MIN_CLUSTER)) continue;   // a cluster of one is not a segment
      const sil = silhouette(points, km.assign, km.k);
      if (!best || sil > best.sil) best = { km, sil, k: km.k };
    }

    if (!best) {
      return {
        segments: [Object.assign({ id: 'rc_1', key: 'rc:all' }, describe(g, points, allBranches))],
        k: 1, separation: 0, weak: true,
        method: 'response-similarity',
        note: 'The panel did not divide into groups of meaningful size — ' +
              'responses were too similar to separate.'
      };
    }

    const segments = [];
    for (let c = 0; c < best.k; c++) {
      const members = points.filter((_, i) => best.km.assign[i] === c);
      if (!members.length) continue;
      const d = describe(g, members, allBranches);
      segments.push(Object.assign({
        id: 'rc_' + (segments.length + 1),
        key: G.keyFor('segment', d.name)
      }, d));
    }

    segments.sort((a, b) => b.positivePct - a.positivePct || b.n - a.n);
    // Names are derived from stance plus dominant blocker, so two groups can
    // collide. Disambiguate with the next distinguishing feature rather than
    // shipping two rows a reader cannot tell apart.
    const seen = {};
    segments.forEach(s => {
      if (!seen[s.name]) { seen[s.name] = true; return; }
      const alt = s.categoryMix[1]
        ? nameFor(s.stance, s.categoryMix[1].value)
        : (s.roleMix[0] ? s.stance + ' — ' + s.roleMix[0].value : null);
      s.name = alt && !seen[alt] ? alt : s.name + ' (' + s.n + ')';
      seen[s.name] = true;
      s.key = G.keyFor('segment', s.name);
    });

    const separation = Math.round(best.sil * 100) / 100;
    return {
      segments,
      k: best.k,
      separation,
      weak: separation < WEAK_SEPARATION,
      method: 'response-similarity',
      note: separation < WEAK_SEPARATION
        ? 'These groups are weakly separated (silhouette ' + separation + '). The panel ' +
          'does not divide cleanly — treat the groupings as indicative, not as distinct markets.'
        : 'Groups formed from answer similarity (silhouette ' + separation + '), then ' +
          'described by what their members have in common.'
    };
  }

  return { cluster, featurise, kmeans, silhouette, describe, nameFor,
           W, MIN_CLUSTER, WEAK_SEPARATION, BLOCKER, BLOCKER_SOFT, STANCE };
})();
