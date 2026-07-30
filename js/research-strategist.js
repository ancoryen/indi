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

  const STRATEGIST_VERSION = 1;

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
    const allowed = numbersIn(ev);
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
    const smallObjs = (ev.objections || []).filter(o => o.pct < 10);

    const idOf = (name) => {
      const n = graph.nodes.find(x => x.type === name);
      return n ? n.id : graph.nodes[0].id;
    };
    const branchId = (label) => {
      const b = graph.nodes.find(n => n.type === 'branch' && n.label === label);
      return b ? b.id : idOf('branch');
    };
    const segId = (name) => {
      const s = graph.nodes.find(n => n.type === 'segment' && n.name === name);
      return s ? s.id : idOf('segment');
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
        cites: [segId(strongestSeg.name), segId(weakestSeg.name)]
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
        text: 'Aim the first version at ' + strongestSeg.name + ', the only group above the overall rate.',
        cites: [segId(strongestSeg.name)]
      });
    }
    smallObjs.slice(0, 2).forEach(o => {
      moves.push({ kind: 'ignore', rank: moves.length + 1,
                   text: 'Set aside ' + o.category + ' concerns for now — they are real but marginal.',
                   cites: [objId(o.category)] });
    });

    const oneWeek = topExp ? {
      text: 'One week, one test: ' + topExp.text,
      cites: [topExp.id]
    } : null;

    const ignoreForNow = smallObjs.slice(0, 3).map(o => ({
      text: o.category + ' objections',
      why: 'Raised by few respondents and not attached to a branch verdict.',
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
      text: ' + b.label +  was never put to the panel, so nothing here says whether it is ' +
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
        'Always include the case against your own recommendation.'
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
        moves: [{ kind: G.MOVE_KINDS.join('|'), rank: 'int', text: 'string', cites: ['nodeId'] }],
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
    STRATEGIST_VERSION,
    verify, fromRules, requestFor, strategise,
    numbersIn, stringsIn, assertedQuantities
  };
})();
