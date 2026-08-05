// Indizilla Research — pre-flight.
//
// What a buyer sees BEFORE credits are spent. Three things, none of which
// requires running the study:
//
//   1. the panel that will be generated — composition is deterministic from
//      the audience spec, so this is exact, not a sample
//   2. how the decision question was parsed — if we read the fork wrongly,
//      the moment to find out is now and not after paying
//   3. the precision the chosen size actually buys
//
// (3) is the one that matters. Selling "400 responses" tells a founder nothing;
// telling them 400 responses resolves to about ±5pp, and that going from 200 to
// 400 moves ±6.9 to ±4.9, is the difference between an informed purchase and an
// upsell. It also means the tool sometimes says the smaller tier is enough,
// which is the same principle as refusing to sell credits that will not help.

window.RPreview = (() => {
  const G = window.RGraph;

  // Roster composition without generating a roster: RPanel.roster is
  // deterministic, so asking it is exact rather than an estimate.
  function composition(audience, n, seedStr) {
    if (!window.RPanel) return null;
    const people = window.RPanel.roster(audience || {}, n, seedStr || '');
    // Largest-remainder, like every other share column in the engine. Rounding
    // each independently put two roles at 51% and 50% in the first run — the
    // fourth time this exact bug has appeared, and the reason REvidence exposes
    // the helper rather than each caller writing its own.
    const tally = (get) => {
      const t = {};
      people.forEach(p => { const v = get(p); if (v) t[v] = (t[v] || 0) + 1; });
      const rows = Object.entries(t).sort((a, b) => b[1] - a[1]);
      const total = rows.reduce((s, [, c]) => s + c, 0);
      const pcts = window.REvidence
        ? window.REvidence.largestRemainder(rows.map(([, c]) => c), total)
        : rows.map(([, c]) => Math.round(c / total * 100));
      return rows.map(([value, count], i) => ({ value, count, pct: pcts[i] }));
    };
    return {
      n: people.length,
      archetypes: tally(p => p.segment),
      roles: tally(p => p.role),
      markets: tally(p => p.market),
      ages: tally(p => p.age)
    };
  }

  // What each size buys, at the worst-case proportion. Quoting the margin for
  // p=0.5 is deliberate: before the study runs there is no p, and quoting a
  // narrower figure would be selling precision the study may not deliver.
  function precision(sizes) {
    const E = window.REvidence;
    if (!E) return [];
    return (sizes || []).map(s => {
      const n = typeof s === 'number' ? s : s.respondents;
      const moe = E.marginForN(n, 0.5);
      // The narrowest two-way split this size can actually call. A winner's
      // interval clears an even split once its share exceeds 50 + margin, so
      // the resolvable gap is twice the margin. Derived rather than bucketed:
      // fixed bands put ±4.9 and ±6.9 in the same sentence, which told a buyer
      // choosing between two tiers precisely nothing.
      const gap = moe == null ? null : Math.ceil(moe * 2);
      return Object.assign({}, typeof s === 'number' ? { respondents: n } : s, {
        respondents: n,
        marginOfError: moe,
        resolvableGap: gap,
        reads: gap == null ? null
          : 'Calls a two-way split of about ' + gap + ' points or wider. Anything closer ' +
            'than that comes back as "too close to separate".'
      });
    });
  }

  // Would the bigger tier actually change anything? Sometimes no, and saying so
  // costs a sale and keeps the one promise the product is built on.
  function upgradeAdvice(from, to) {
    const E = window.REvidence;
    if (!E || !from || !to) return null;
    const a = E.marginForN(from, 0.5), b = E.marginForN(to, 0.5);
    if (a == null || b == null) return null;
    const gain = Math.round((a - b) * 10) / 10;
    return {
      from, to, fromMargin: a, toMargin: b, gain,
      worthIt: gain >= 2,
      text: gain >= 2
        ? 'Going from ' + from + ' to ' + to + ' narrows the margin from ±' + a +
          'pp to ±' + b + 'pp.'
        : 'Going from ' + from + ' to ' + to + ' only narrows the margin from ±' + a +
          'pp to ±' + b + 'pp. Not worth the credits unless you need that last ' +
          gain + 'pp.'
    };
  }

  /* ---- one call: everything shown before the spend ---- */
  function preflight(study, tiers) {
    const n = study.respondents || 50;
    const seedStr = String(study.idea) + JSON.stringify(study.audience || {});
    const branches = window.RPanel ? window.RPanel.detectBranches(study.decision_q) : null;

    const sizes = precision(tiers && tiers.length ? tiers : [n]);
    const chosen = sizes.find(s => s.respondents === n) || sizes[0] || null;
    const bigger = sizes.filter(s => s.respondents > n)
      .sort((a, b) => a.respondents - b.respondents)[0] || null;

    return {
      view: 'preflight',
      respondents: n,
      composition: composition(study.audience, n, seedStr),
      // Showing the parse back is the cheapest possible guard against the most
      // expensive mistake: paying for a study that answered a different
      // question. A fork we failed to detect is reported as such, not hidden.
      question: {
        text: study.decision_q || '',
        parsedAs: branches ? 'fork' : 'single',
        branches: branches || [],
        note: branches
          ? 'Read as a choice between two options. Each will be verdicted separately, ' +
            'from what the panel prefers.'
          : 'Read as a single proposition — the panel will assess the idea as described. ' +
            'If you meant a choice, phrase it as "X or Y" and each option gets its own verdict.'
      },
      precision: sizes,
      chosen,
      upgrade: bigger ? upgradeAdvice(n, bigger.respondents) : null,
      // Nothing here has been generated. Saying so stops the preview from
      // reading like a partial result.
      note: 'Nothing has been generated yet and no credits have been spent. The panel ' +
            'composition above is exact — the roster is built deterministically from ' +
            'your audience settings.'
    };
  }

  return { preflight, composition, precision, upgradeAdvice };
})();
