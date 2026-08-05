// Indizilla Research — the Strategist.
//
// Sits above the evidence engine and below the views. It consumes ONLY the
// bundle returned by REvidence.evidence() — it never touches the graph's raw
// panel data — and produces judgement: a position, a recommended branch, ranked
// moves, what to test this week, what to ignore, what remains unknown.
//
// The four-way split this layer exists to preserve:
//   Evidence       comes from the panel        (REvidence, computed)
//   Reasoning      comes from the model        (here, and labelled as such)
//   Recommendation synthesises evidence        (here, and must cite it)
//   Prediction     only if measured            (nowhere, until a variant runs)
//
// "Never invents data" is enforced, not promised. `verify()` walks the output
// and rejects it if any cited node is missing, if any asserted quantity does
// not appear in the evidence bundle, or if the strategist tries to claim more
// confidence than the evidence supports. An LLM strategist is a drop-in
// replacement for `fromRules()` below and must pass the same verifier.

window.RStrategist = (() => {
  const G = window.RGraph;

  const STRATEGIST_VERSION = 2;

  // When a move should happen. Derived from whether it BLOCKS the decision,
  // not from how important it feels — "immediate / 30 / 90 day" is only useful
  // if the tiers mean something checkable.
  const HORIZONS = ['now', '30d', '90d'];
  const HORIZON_LABEL = { now: 'This week', '30d': 'Next 30 days', '90d': 'Next 90 days' };

  // What a concept has to promise for a given objection to stop biting. These
  // are positioning directions, deliberately carrying no quantities — a
  // messaging section is the easiest place in a memo to smuggle in invented
  // numbers, so the shape simply has nowhere to put one.
  const PROMISE_FOR = {
    trust:        'show the working, not just the answer',
    price:        'make the cost obvious against the thing it replaces',
    relevance:    'name the specific situation this is for, and who it is not for',
    alternatives: 'be explicit about what this does that the current workaround cannot',
    effort:       'get them to a first useful result before asking for setup',
    regulatory:   'lead with the compliance position rather than the product',
    dignity:      'frame it around the people it affects, not the people who buy it',
    safeguarding: 'lead with the protections, and treat scale as the risk it is',
    other:        'show it working on their own case, not a demo case'
  };

  /* ================================================================ verify */

  // Collect every number the evidence bundle actually contains, so we can tell
  // an asserted figure from an invented one.
  function numbersIn(obj, acc) {
    acc = acc || new Set();
    if (obj == null) return acc;
    if (typeof obj === 'number' && isFinite(obj)) {
      acc.add(Math.round(obj));
      acc.add(Math.round(obj * 100));      // 0.57 -> 57, for shares quoted as %
      acc.add(Math.abs(Math.round(obj)));  // signed deltas quoted unsigned
    } else if (Array.isArray(obj)) {
      obj.forEach(v => numbersIn(v, acc));
    } else if (typeof obj === 'object') {
      Object.values(obj).forEach(v => numbersIn(v, acc));
    }
    return acc;
  }

  // The figures a strategist may legitimately quote — a WHITELIST, by hard
  // experience.
  //
  // The original version allowed anything `numbersIn(ev)` found anywhere in the
  // bundle. That held only while the bundle was small. Adding response segments
  // put every segment's categoryMix, branchMix and substituteMix into scope,
  // and a fabricated "this will increase signups by 40%" promptly found its
  // match in one cluster's third-ranked objection share. The verifier had
  // quietly stopped verifying, and nothing about it looked broken.
  //
  // So what may be quoted is declared here rather than inferred from whatever
  // happens to be in scope. A new headline figure has to be added deliberately;
  // a new internal or diagnostic field cannot widen the set by accident.
  function quotableNumbers(ev) {
    const acc = new Set();
    const take = (v) => numbersIn(v, acc);

    take(ev.stats); take(ev.sampling); take(ev.confidence); take(ev.polarisation);
    (ev.segments || []).forEach(s => take({
      n: s.n, positivePct: s.positivePct, vsOverall: s.vsOverall,
      meanIntent: s.meanIntent, marginOfError: s.marginOfError
    }));
    (ev.objections || []).forEach(o => take({
      count: o.count, pct: o.pct, concentration: o.concentration,
      distinctObjections: o.distinctObjections
    }));
    (ev.leverage || []).forEach(l => take({ addressableMass: l.addressableMass, rank: l.rank }));
    (ev.assumptions || []).forEach(a => take({ threatenedMass: a.threatenedMass, score: a.score }));
    (ev.branches || []).forEach(b => take({
      n: b.n, preferenceShare: b.preferenceShare,
      meanIntent: b.meanIntent, marginOfError: b.marginOfError
    }));
    const sub = ev.substitutes || {};
    take({ n: sub.n, coverage: sub.coverage, monetisedPct: sub.monetisedPct,
           paidSwitchPct: sub.paidSwitchPct, freeSwitchPct: sub.freeSwitchPct });
    (sub.byKind || []).forEach(k => take({
      pct: k.pct, count: k.count, wouldSwitchPct: k.wouldSwitchPct, marginOfError: k.marginOfError
    }));
    (ev.flips || []).forEach(f => take({ addressableMass: f.addressableMass, n: f.n,
                                         marginOfError: f.marginOfError }));
    return acc;
  }

  // Every string the evidence bundle contains. If the strategist quotes one
  // verbatim — a segment name, an experiment description — then numbers inside
  // it came from the evidence by construction and are not assertions.
  function stringsIn(obj, acc) {
    acc = acc || [];
    if (obj == null) return acc;
    if (typeof obj === 'string') { if (obj.length > 2) acc.push(obj); }
    else if (Array.isArray(obj)) obj.forEach(v => stringsIn(v, acc));
    else if (typeof obj === 'object') Object.values(obj).forEach(v => stringsIn(v, acc));
    return acc;
  }

  // Quantities asserted in prose. Three things are deliberately not quantities:
  //   - text quoted from the evidence ("...onboard fifty beneficiaries with 80G
  //     receipts" is an experiment description, and "80G" is a tax section)
  //   - a digit glued to a letter (80G, 5x, 2FA) — an identifier, not a number
  //   - a digit range (22-44) — an age band inside a segment name
  // Small bare integers are also ignored: they are ordinals and list counts,
  // and flagging them would bury the real signal. Anything carrying % or pp is
  // checked at any size, because that is the shape fabricated precision takes.
  function assertedQuantities(text, evidenceStrings) {
    let t = String(text);
    (evidenceStrings || []).slice()
      .sort((a, b) => b.length - a.length)
      .forEach(s => { t = t.split(s).join(' '); });

    const out = [];
    const re = /(-?\d+(?:\.\d+)?)\s*(%|pp\b)?/g;
    let m;
    while ((m = re.exec(t)) !== null) {
      const n = parseFloat(m[1]);
      if (isNaN(n)) continue;
      const after = t.slice(re.lastIndex);
      if (/^[A-Za-z]/.test(after) && !m[2]) continue;         // 80G, 5x
      if (/^-\d/.test(after)) continue;                        // 22-44
      if (/\d-$/.test(t.slice(0, m.index + m[1].length + 1))) continue;
      if (m[2] || Math.abs(n) >= 10) out.push({ value: Math.abs(Math.round(n)), unit: m[2] || null });
    }
    return out;
  }

  function verify(graph, ev, s) {
    const errors = [];
    const ids = new Set(graph.nodes.map(n => n.id));
    const allowed = quotableNumbers(ev);
    const evStrings = stringsIn(ev);

    function checkCites(where, cites) {
      if (!cites || !cites.length) {
        errors.push(where + ' cites nothing — judgement must be traceable');
        return;
      }
      cites.forEach(id => {
        if (!ids.has(id)) errors.push(where + ' cites unknown node: ' + id);
      });
    }

    function checkText(where, text) {
      assertedQuantities(text, evStrings).forEach(q => {
        if (!allowed.has(q.value)) {
          errors.push(where + ' asserts a quantity absent from the evidence: ' +
                      q.value + (q.unit || '') + ' — fabricated precision');
        }
      });
    }

    function walk(where, item) {
      checkCites(where, item.cites);
      checkText(where, item.text || '');
    }

    if (s.strategistVersion !== STRATEGIST_VERSION) {
      errors.push('strategistVersion ' + s.strategistVersion + ' != ' + STRATEGIST_VERSION);
    }

    walk('position', s.position || {});

    const rec = s.recommendation || {};
    // The strategist may not upgrade its own confidence — that number belongs
    // to the evidence engine.
    if (rec.confidence !== ev.confidence.level) {
      errors.push('recommendation.confidence "' + rec.confidence + '" does not match ' +
                  'evidence confidence "' + ev.confidence.level + '" — the strategist ' +
                  'cannot grant itself more certainty than the panel supports');
    }
    // A recommendation with no case against it is advocacy, not judgement.
    if (!(rec.against || []).length) {
      errors.push('recommendation has no `against` — the case against must be shown');
    }
    (rec.because || []).forEach((r, i) => walk('recommendation.because[' + i + ']', r));
    (rec.against || []).forEach((r, i) => walk('recommendation.against[' + i + ']', r));
    if (rec.branch) {
      const named = (ev.branches || []).find(b => b.label === rec.branch);
      if (!named) {
        errors.push('recommends branch "' + rec.branch + '" which is not in the evidence');
      } else if (named.evaluated === false) {
        // The invariant the stress batch forced. Recommending an option no
        // persona assessed is the fabrication this layer exists to prevent,
        // whatever the reasoning around it sounds like.
        errors.push('recommends branch "' + rec.branch + '" which no persona evaluated — ' +
                    'a recommendation requires a measured branch, not a plausible one');
      }
    }

    (s.moves || []).forEach((m, i) => {
      walk('moves[' + i + ']', m);
      if (!G.MOVE_KINDS.includes(m.kind)) errors.push('moves[' + i + '] unknown kind: ' + m.kind);
      if (m.horizon != null && HORIZONS.indexOf(m.horizon) === -1) {
        errors.push('moves[' + i + '] unknown horizon: ' + m.horizon);
      }
      if (m.addressableMass != null) {
        const lev = (ev.leverage || []).find(l => l.assumptionId === m.assumptionId);
        if (!lev) {
          errors.push('moves[' + i + '] quotes addressableMass with no matching leverage entry');
        } else if (lev.addressableMass !== m.addressableMass) {
          errors.push('moves[' + i + '] addressableMass ' + m.addressableMass +
                      ' != evidence ' + lev.addressableMass);
        } else if (m.isCeilingNotForecast !== true) {
          errors.push('moves[' + i + '] quotes a mass without marking it a ceiling');
        }
      }
    });

    // Messaging is the easiest section in which to launder an opinion into a
    // finding, so it gets the strictest check: a concept must cite real nodes,
    // must not assert quantities, and must be explicitly marked untested. If
    // the block ever loses its disclaimer, the whole strategist is rejected.
    if (s.messaging) {
      if (!s.messaging.disclaimer) {
        errors.push('messaging block carries no disclaimer — positioning concepts were ' +
                    'never put to the panel and must not read as tested');
      }
      (s.messaging.concepts || []).forEach((c, i) => {
        const where = 'messaging.concepts[' + i + ']';
        checkCites(where, c.cites);
        checkText(where, [c.promise, c.why, c.audience].filter(Boolean).join(' '));
        if (c.tested !== false) {
          errors.push(where + ' does not declare `tested: false` — this panel reacted to ' +
                      'the idea, not to any framing of it');
        }
        if (['lead', 'defensive', 'wedge'].indexOf(c.role) === -1) {
          errors.push(where + ' unknown concept role: ' + c.role);
        }
      });
    }

    if (s.oneWeek) walk('oneWeek', s.oneWeek);
    (s.ignoreForNow || []).forEach((x, i) => walk('ignoreForNow[' + i + ']', x));
    (s.unknowns || []).forEach((x, i) => walk('unknowns[' + i + ']', x));

    return { ok: errors.length === 0, errors };
  }

  /* ============================================== rules-based strategist */

  // A deterministic baseline. Not a stand-in for a model's judgement — it is
  // the floor: it proves the chain runs end to end with no API key, gives the
  // verifier something to check, and is the fallback when generation fails.
  function fromRules(graph, ev) {
    const lev = ev.leverage || [];
    const top = lev[0] || null;
    // Only measured branches are candidates. An option nobody assessed cannot
    // be recommended, ranked, or given confidence — it can only be reported as
    // unevaluated, with the study that would settle it.
    const branches = (ev.branches || []).filter(b => b.evaluated);
    const unevaluated = (ev.branches || []).filter(b => !b.evaluated);
    const ranked = ['go', 'conditional', 'no'];
    // Ties break on measured preference share, never on position in the list.
    const byVerdict = (x, y) =>
      (ranked.indexOf(x.verdict) - ranked.indexOf(y.verdict)) ||
      ((y.preferenceShare || 0) - (x.preferenceShare || 0));
    const best = branches.slice().sort(byVerdict)[0] || null;
    const worst = branches.slice().sort((a, b) => byVerdict(b, a))[0] || null;

    const strongestSeg = (ev.segments || [])[0] || null;
    const weakestSeg = (ev.segments || []).slice(-1)[0] || null;
    const topExp = (ev.experiments || [])[0] || null;
    const bigObj = (ev.objections || [])[0] || null;
    // Rare AND cheap to be wrong about. Filtering on mass alone told the reader
    // to "set aside relevance concerns" because only 7% raised them — relevance
    // being the objection that means you are solving the wrong problem. Low
    // incidence is a reason to deprioritise a low-severity objection and no
    // reason at all to deprioritise a high-severity one.
    const smallObjs = (ev.objections || []).filter(o =>
      o.pct < 10 && ['low', 'medium'].indexOf(o.severity) !== -1);
    // Rare but expensive. These are never set aside, and saying so explicitly
    // is more useful than silently omitting them.
    const rareButSevere = (ev.objections || []).filter(o =>
      o.pct < 10 && ['critical', 'high'].indexOf(o.severity) !== -1);

    const idOf = (name) => {
      const n = graph.nodes.find(x => x.type === name);
      return n ? n.id : graph.nodes[0].id;
    };
    const branchId = (label) => {
      const b = graph.nodes.find(n => n.type === 'branch' && n.label === label);
      return b ? b.id : idOf('branch');
    };
    // Response segments are computed, not stored, so they have no node to point
    // at. Citing the members instead is both possible and strictly better: the
    // claim "this group sits at X% positive" is supported by those people's
    // utterances, which is what a reader following the citation wants to reach.
    // (Matching by name against archetype nodes silently resolved to an
    // unrelated segment, since discovered names never equal assigned ones.)
    const segCite = (seg) => {
      const ids = (seg && seg.memberIds || []).filter(id => graph.nodes.some(n => n.id === id));
      return ids.length ? ids.slice(0, 3) : [idOf('persona')];
    };
    const objId = (cat) => {
      const o = graph.nodes.find(n => n.type === 'objection' && n.category === cat);
      return o ? o.id : idOf('objection');
    };

    const position = {
      text: !branches.length
        ? 'I cannot recommend between these options: no persona in this panel was asked ' +
          'to choose between them. ' +
          (unevaluated.length
            ? 'The options on the table (' + unevaluated.map(b => b.label).join('; ') + ') ' +
              'were never put to anyone. ' : '') +
          'Run a variant on this panel with the options stated, and the comparison becomes ' +
          'measurable rather than assumed.'
        : (best && worst && best.label !== worst.label
            ? 'I would pursue ' + best.label + ' and shelve ' + worst.label + ' for now. ' +
              best.why + ' ' +
              (top ? 'The decision turns on one assumption: ' + top.assumption + '.' : '')
            : best
              ? best.label + ' is the only option this panel assessed. ' + best.why
              : 'The panel does not separate the options cleanly enough to pick one yet.'),
      cites: (branches.length
        ? [best ? branchId(best.label) : idOf('branch')]
            .concat(worst && best && worst.label !== best.label ? [branchId(worst.label)] : [])
            .concat(top ? [top.assumptionId] : [])
        : (unevaluated.length ? unevaluated.map(b => branchId(b.label)) : [idOf('branch')]))
    };

    const because = [];
    if (best) {
      because.push({ text: best.label + ' is the option this panel preferred: ' + best.why,
                     cites: [branchId(best.label)] });
    } else if (unevaluated.length) {
      because.push({ text: 'Nothing here favours one option over another, because the panel ' +
                           'reacted to the idea rather than to a choice between the options.',
                     cites: unevaluated.map(b => branchId(b.label)) });
    }
    if (ev.polarisation && ev.polarisation.splits && strongestSeg && weakestSeg) {
      because.push({
        text: 'The market splits rather than leans. ' + strongestSeg.name + ' sits at ' +
              strongestSeg.positivePct + '% positive while ' + weakestSeg.name + ' sits at ' +
              weakestSeg.positivePct + '%, so an average is the wrong thing to design against.',
        cites: segCite(strongestSeg).concat(segCite(weakestSeg))
      });
    }
    if (bigObj) {
      because.push({
        text: 'The largest objection block is ' + bigObj.category + ' at ' + bigObj.pct +
              '% of respondents raising an objection' +
              (bigObj.concentratedIn ? ', concentrated in ' + bigObj.concentratedIn : '') + '.',
        cites: [objId(bigObj.category)]
      });
    }

    const against = [];
    if (ev.confidence.level === 'low') {
      against.push({
        text: 'Confidence is low: the headline figure carries a margin of ' +
              ev.confidence.marginOfError + 'pp at this panel size, so this is a direction, not a decision.',
        cites: [idOf('segment')]
      });
    }
    if (top && top.needsExternalVerification) {
      against.push({
        text: 'The load-bearing assumption rests on an unverified factual claim, which no panel ' +
              'can settle. Treat it as an open question, not a finding.',
        cites: [top.assumptionId]
      });
    }
    // Surfaced rather than set aside: the objections a mass-ranked table buries.
    // A safeguarding concern raised by 4% of a panel belongs in the case
    // against, not three rows down a table sorted by popularity.
    rareButSevere.slice(0, 3).forEach(o => against.push({
      text: 'Only ' + o.pct + '% raised ' + o.category + ', but it is not something to defer. ' +
            (o.severityWhy || 'The cost of being wrong about it is high.') +
            ' Low incidence is not low risk.',
      cites: [objId(o.category)]
    }));
    if (!against.length) {
      against.push({
        text: 'A simulated panel is a prior, not a market. Confirm the strongest signal with real users.',
        cites: [idOf('segment')]
      });
    }

    const moves = [];
    if (worst && worst.verdict === 'no' && worst.label !== (best || {}).label) {
      moves.push({ kind: 'kill', rank: 1,
                   text: 'Drop ' + worst.label + ' from the launch scope. ' + worst.why,
                   cites: [branchId(worst.label)] });
    }
    if (!branches.length && unevaluated.length) {
      // The only honest first move when the fork was never put to anyone.
      moves.push({ kind: 'validate', rank: 1,
                   text: 'Re-run this panel with the options stated, so the choice between ' +
                         unevaluated.map(b => b.label).join(' and ') + ' is measured rather than assumed.',
                   cites: unevaluated.map(b => branchId(b.label)) });
    }
    if (top) {
      moves.push({
        kind: 'validate', rank: moves.length + 1,
        text: 'Resolve "' + top.assumption + '" before building. It carries the largest share of ' +
              'objections and a branch verdict depends on it.',
        cites: [top.assumptionId],
        assumptionId: top.assumptionId,
        addressableMass: top.addressableMass,
        isCeilingNotForecast: true
      });
    }
    if (strongestSeg && strongestSeg.positivePct > (ev.stats.positive.pct || 0)) {
      moves.push({
        kind: 'double_down', rank: moves.length + 1,
        text: 'Aim the first version at ' + strongestSeg.name + ', the strongest group in the panel.',
        cites: segCite(strongestSeg)
      });
    }
    smallObjs.slice(0, 2).forEach(o => {
      moves.push({ kind: 'ignore', rank: moves.length + 1,
                   text: 'Set aside ' + o.category + ' concerns for now — they are real but marginal.',
                   cites: [objId(o.category)] });
    });

    // Horizon: what blocks the decision goes first, what needs an outsider goes
    // first because the wait is the cost, everything else falls back by kind.
    moves.forEach(m => {
      const blocks = m.kind === 'kill' || m.kind === 'validate' || m.kind === 'pivot';
      const external = m.assumptionId && top && m.assumptionId === top.assumptionId &&
                       top.needsExternalVerification;
      m.horizon = (blocks || external) ? 'now' : m.kind === 'ignore' ? '90d' : '30d';
      m.horizonLabel = HORIZON_LABEL[m.horizon];
    });

    /* ---- positioning concepts ----------------------------------------
       Three roles, each tied to something measured: the group that responded,
       the objection that costs most to be wrong about, and what the audience
       uses today. Every one is a HYPOTHESIS — the panel never saw any of these
       framings, so none of them has been tested. The view is required to say
       so; a messaging section that reads as validated is the most quietly
       dishonest page a research tool can print. */
    const concepts = [];
    const byPriority = (ev.objections || []).slice()
      .sort((a, c) => (a.priorityRank || 99) - (c.priorityRank || 99));
    const worstObj = byPriority[0] || null;
    const topSub = ((ev.substitutes || {}).byKind || [])[0] || null;

    if (strongestSeg && strongestSeg.topCategory) {
      concepts.push({
        role: 'lead', roleLabel: 'Lead concept',
        audience: strongestSeg.name,
        promise: PROMISE_FOR[strongestSeg.topCategory] || PROMISE_FOR.other,
        answers: strongestSeg.topCategory,
        why: 'Aimed at the group that responded most warmly, and at the thing they ' +
             'themselves raised. If the framing cannot survive their own objection, ' +
             'it will not survive a colder audience.',
        cites: segCite(strongestSeg),
        tested: false
      });
    }
    if (worstObj) {
      concepts.push({
        role: 'defensive', roleLabel: 'Defensive concept',
        audience: worstObj.concentratedIn || 'the whole panel',
        promise: PROMISE_FOR[worstObj.category] || PROMISE_FOR.other,
        answers: worstObj.category,
        why: 'Answers the objection that costs most to be wrong about, which is not ' +
             'the same as the one raised most often.',
        cites: [objId(worstObj.category)],
        tested: false
      });
    }
    if (topSub) {
      concepts.push({
        role: 'wedge', roleLabel: 'Wedge concept',
        audience: 'people currently using: ' + topSub.label,
        promise: PROMISE_FOR.alternatives,
        answers: 'alternatives',
        why: 'Positions against what this audience actually does today rather than ' +
             'against a competitor they never mentioned.',
        cites: [idOf('substitute')],
        tested: false
      });
    }

    const messaging = concepts.length ? {
      disclaimer: 'Positioning hypotheses, not tested messages. This panel reacted to the ' +
                  'idea, not to any of these framings — each one is something to put in ' +
                  'front of people, and none of them is a result.',
      concepts
    } : null;

    const oneWeek = topExp ? {
      text: 'One week, one test: ' + topExp.text,
      cites: [topExp.id]
    } : null;

    const ignoreForNow = smallObjs.slice(0, 3).map(o => ({
      text: o.category + ' objections',
      why: 'Raised by few respondents, and cheap to be wrong about — ' +
           (o.severityWhy || 'a positioning or execution concern, not a structural one'),
      cites: [objId(o.category)]
    }));


    const unknowns = (ev.assumptions || [])
      .filter(a => a.needsExternalVerification)
      .map(a => ({
        text: a.text + ' — raised by the panel, not verified. Needs a specialist.',
        needsExternal: true,
        cites: [a.id]
      }));
    unevaluated.forEach(b => unknowns.push({
      text: '"' + b.label + '" was never put to the panel, so nothing here says whether it is ' +
            'better or worse than the alternative.',
      needsExternal: false,
      cites: [branchId(b.label)]
    }));
    if (ev.confidence.raise && ev.confidence.raise.moreCreditsHelp === false) {
      unknowns.push({
        text: 'A larger panel will not raise confidence on the above. ' + ev.confidence.raise.action,
        needsExternal: true,
        cites: [top ? top.assumptionId : idOf('assumption')]
      });
    }

    return {
      strategistVersion: STRATEGIST_VERSION,
      producedBy: 'rules',
      position,
      recommendation: {
        branch: best ? best.label : null,   // null when no option was assessed
        // Inherited, never chosen. The verifier enforces this.
        confidence: ev.confidence.level,
        because,
        against
      },
      moves,
      messaging,
      oneWeek,
      ignoreForNow,
      unknowns
    };
  }

  /* ======================================== contract for an LLM strategist */

  // What an Edge Function would send. The evidence bundle only — no raw panel,
  // no utterances beyond what the engine already summarised — so the model
  // physically cannot cite something it was not given.
  function requestFor(graph, ev) {
    return {
      task: 'strategist',
      strategistVersion: STRATEGIST_VERSION,
      rules: [
        'Every judgement must cite node ids from the evidence supplied.',
        'Do not state any quantity that is not present in the evidence.',
        'Do not predict outcomes. A prediction is only valid once a variant has been run.',
        'Use the confidence level given; you may not raise it.',
        'Always include the case against your own recommendation.',
        'Positioning concepts are hypotheses. Mark every one `tested: false` — the ' +
          'panel reacted to the idea, never to a framing of it.',
        'Rank objections by severity as supplied, not by how often they were raised.'
      ],
      allowedNodeIds: graph.nodes.map(n => n.id),
      evidence: ev,
      outputShape: {
        position: { text: 'string', cites: ['nodeId'] },
        recommendation: {
          branch: 'string|null', confidence: ev.confidence.level,
          because: [{ text: 'string', cites: ['nodeId'] }],
          against: [{ text: 'string', cites: ['nodeId'] }]
        },
        moves: [{ kind: G.MOVE_KINDS.join('|'), rank: 'int', horizon: HORIZONS.join('|'),
                  text: 'string', cites: ['nodeId'] }],
        messaging: {
          disclaimer: 'string — must state these framings were never tested',
          concepts: [{ role: 'lead|defensive|wedge', audience: 'string', promise: 'string',
                       answers: 'objection category', why: 'string', tested: false,
                       cites: ['nodeId'] }]
        },
        oneWeek: { text: 'string', cites: ['nodeId'] },
        ignoreForNow: [{ text: 'string', why: 'string', cites: ['nodeId'] }],
        unknowns: [{ text: 'string', needsExternal: 'bool', cites: ['nodeId'] }]
      }
    };
  }

  // Produce judgement, then verify it. A strategist whose output fails
  // verification is discarded in favour of the rules baseline — better a plain
  // recommendation than a fabricated one.
  function strategise(graph, ev, generated) {
    if (generated) {
      const check = verify(graph, ev, generated);
      if (check.ok) return Object.assign({}, generated, { traceable: true });
      const fallback = fromRules(graph, ev);
      return Object.assign(fallback, {
        traceable: true,
        rejectedGenerated: { errors: check.errors }
      });
    }
    return Object.assign(fromRules(graph, ev), { traceable: true });
  }

  return {
    STRATEGIST_VERSION, HORIZONS, HORIZON_LABEL, PROMISE_FOR,
    verify, fromRules, requestFor, strategise,
    numbersIn, quotableNumbers, stringsIn, assertedQuantities
  };
})();
