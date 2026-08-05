// Indizilla Research — the conversation engine.
//
// Replaces the legacy follow-up, which drew from a bank of nine canned strings
// chosen by hashing the question — it never read what was asked.
//
// The structure here is classify-then-answer, and the order matters. A question
// is ROUTED before it is answered, so there is no path on which the engine
// improvises. Four outcomes:
//
//   query     answerable from the stored graph — computed, cited, free
//   variant   needs the same panel re-run against a changed stimulus
//   panel     needs a different population, so a new roster
//   external  outside what any panel can settle — needs a specialist
//
// A question that matches no answerer does not get a guess. It gets told which
// of the four it is and what it would take.
//
// Pricing note: a query is a read over data already paid for, so it is free.
// Charging credits for a database read would be exactly the quiet upsell the
// confidence layer refuses to make. Credits are spent when computation runs.

window.RConvo = (() => {
  const G = window.RGraph;

  const OPS = {
    query:    { label: 'Answered from this study', costsCredits: false, requiresRun: false },
    variant:  { label: 'Needs a variant run',      costsCredits: true,  requiresRun: true, reusesPanel: true },
    panel:    { label: 'Needs a new panel',        costsCredits: true,  requiresRun: true, reusesPanel: false },
    external: { label: 'Needs external verification', costsCredits: false, requiresRun: false }
  };

  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

  /* ================================================== entity index ==== */
  // What this study actually knows about. Used both to answer and — more
  // importantly — to recognise when a question is about something it does not
  // know about.
  function index(graph, ev) {
    const cats = (ev.objections || []).map(o => o.category);
    return {
      segments:    (ev.segments || []).map(s => ({ name: s.name, id: s.id, norm: norm(s.name) })),
      categories:  cats,
      branches:    (ev.branches || []).map(b => ({ label: b.label, id: b.id, norm: norm(b.label) })),
      assumptions: (ev.assumptions || []).map(a => ({ text: a.text, id: a.id, norm: norm(a.text) })),
      roles:       [...new Set(G.of(graph, 'persona').map(p => p.role).filter(Boolean))],
      markets:     [...new Set(G.of(graph, 'persona').map(p => p.market).filter(Boolean))],
      ages:        [...new Set(G.of(graph, 'persona').map(p => p.age).filter(Boolean))]
    };
  }

  /* ================================================== classification ==== */

  // A change to WHAT was tested — same people, different proposition. This is a
  // paired comparison and therefore better evidence than a fresh panel.
  const VARIANT_CUES = [
    /\bwhat if we (?:removed?|dropped?|cut|added?|changed?|charged?|doubled?|halved?|raised?|lowered?)\b/,
    /\bif we (?:removed?|dropped?|added?|changed?|charged?|doubled?|halved?)\b/,
    /\bwithout the\b/, /\binstead of\b/, /\brepositioned?\b/, /\breframed?\b/,
    /\b(?:double|halve|raise|lower|increase|decrease)\s+(?:the\s+)?pric/
  ];

  // A change to WHO was asked — different population, so a different roster.
  const PANEL_CUES = [
    /\bwhat if (?:this|it) (?:was|were|is) only for\b/, /\bwhat about\b/,
    /\bonly for\b/, /\bwould .* in (?:europe|the us|america|asia|africa|uk)\b/,
    /\btarget(?:ed|ing)?\s+(?:enterprise|smb|gen ?z|millennials|students|older)\b/,
    /\b(?:gen ?z|millennials|boomers|enterprise buyers|teenagers)\b/
  ];

  // Questions a simulated panel is not evidence for, at any size.
  const EXTERNAL_CUES = [
    /\b(?:is|are) (?:it|this|they) legal\b/, /\blegal(?:ity|ly)?\b/, /\blawful\b/,
    /\bregulat(?:ion|ory|ed)\b/, /\bcomply|compliance\b/, /\blicen[cs]/,
    /\bmarket size\b/, /\btam\b/, /\bhow (?:big|large) is the market\b/,
    /\bcompetitors?\b/, /\bpatent\b/, /\btax\b/, /\bgdpr\b/,
    /\bhow much (?:does|would) it cost to build\b/, /\btechnically (?:feasible|possible)\b/
  ];

  // Asking what respondents SAID about a factual topic is testimony, and the
  // panel is evidence for it. "What did the regulatory objectors say?" is
  // answerable; "are we compliant?" is not. Without this distinction any
  // question naming a factual topic routed to external verification, including
  // a request for the verbatims the study already holds.
  const TESTIMONY_CUES = [
    /\b(?:what|who|how many|which)\b[\s\S]*\b(?:said|say|says|raised|mention(?:ed)?|objected|think|thought|feel|felt|worried|concerned)\b/,
    /\b(?:verbatim|quote|in their words|exactly did)\b/,
    /\b(?:objectors?|respondents?|personas?|panel)\b[\s\S]*\b(?:say|said|think|raise)\b/
  ];

  function classify(question, graph, ev) {
    const q = norm(question);
    const ix = index(graph, ev);
    if (!q) return { op: 'query', intent: null, reason: 'Empty question.' };

    // Testimony about a factual topic is still testimony. Checked before the
    // external cues so a request for what the panel said is never mistaken for
    // a request for whether it is true.
    const isTestimony = TESTIMONY_CUES.some(re => re.test(q))
      && (ix.categories.some(c => q.indexOf(c) !== -1)
          || ix.segments.some(s => q.indexOf(s.norm) !== -1)
          || /\b(?:objectors?|respondents?|personas?|panel|skeptics?|sceptics?)\b/.test(q));

    // External: a legality question that also names a segment is still a
    // legality question, and the panel is not evidence for it.
    if (!isTestimony && EXTERNAL_CUES.some(re => re.test(q))) {
      return {
        op: 'external', intent: 'external',
        reason: 'This asks something a panel cannot settle. Personas can tell you they ' +
                'are worried about it; they cannot tell you whether it is true.'
      };
    }
    if (PANEL_CUES.some(re => re.test(q))) {
      return {
        op: 'panel', intent: 'population-change',
        reason: 'This asks about a different population than the one that was surveyed, ' +
                'so it needs a new roster rather than a re-read of this one.'
      };
    }
    if (VARIANT_CUES.some(re => re.test(q))) {
      return {
        op: 'variant', intent: 'stimulus-change',
        reason: 'This asks what a change would do. The same panel can be re-run against ' +
                'the changed version, which makes the difference between the two the change ' +
                'itself rather than two different groups of people.'
      };
    }

    const answerer = ANSWERERS.find(a => a.match(q, ix));
    if (answerer) return { op: 'query', intent: answerer.id, reason: null };

    // Nothing matched. Does the question at least talk about something in the
    // graph? That decides whether to offer a narrower query or a new run.
    const mentions = ix.segments.filter(s => q.indexOf(s.norm) !== -1).map(s => s.name)
      .concat(ix.categories.filter(c => q.indexOf(c) !== -1));
    return {
      op: 'query', intent: null,
      reason: mentions.length
        ? 'That is about ' + mentions.join(' and ') + ', which this study covers, but not ' +
          'in a way I can compute an answer to.'
        : 'Nothing in this study speaks to that.',
      mentions
    };
  }

  /* ====================================================== answerers ==== */
  // Each computes from the graph and cites the nodes it used. No answerer may
  // introduce a figure the evidence bundle does not contain.

  const ANSWERERS = [
    {
      id: 'top-objection',
      match: (q) => /\b(?:biggest|main|top|largest|worst|most common)\b.*\b(?:objection|concern|complaint|problem|pushback)\b/.test(q)
                 || /\bwhy did (?:they|people|anyone) (?:reject|say no|push back)\b/.test(q),
      run: (graph, ev) => {
        const o = ev.objections[0];
        if (!o) return null;
        const node = G.of(graph, 'objection').find(n => n.category === o.category);
        return {
          text: 'The largest block is ' + o.category + ' — ' + o.pct + '% of respondents who ' +
                'raised an objection (' + o.count + ' of them)' +
                (o.concentratedIn ? ', concentrated in ' + o.concentratedIn : '') + '.',
          cites: node ? [node.id] : [],
          quotes: o.evidence.slice(0, 3),
          data: { category: o.category, pct: o.pct, count: o.count }
        };
      }
    },
    {
      id: 'objection-detail',
      match: (q, ix) => ix.categories.some(c => q.indexOf(c) !== -1)
                     && /\b(?:say|said|exactly|specifically|detail|verbatim|quote)\b/.test(q),
      run: (graph, ev, q) => {
        const ix = index(graph, ev);
        const cat = ix.categories.find(c => norm(q).indexOf(c) !== -1);
        const o = ev.objections.find(x => x.category === cat);
        if (!o) return null;
        const node = G.of(graph, 'objection').find(n => n.category === cat);
        return {
          text: o.count + ' respondents raised ' + cat + ' concerns (' + o.pct + '%)' +
                (o.concentratedIn ? ', mostly ' + o.concentratedIn : '') + '. In their words:',
          cites: node ? [node.id] : [],
          quotes: o.objections.slice(0, 4),
          data: { category: cat, count: o.count }
        };
      }
    },
    {
      id: 'segment-compare',
      match: (q, ix) => ix.segments.filter(s => q.indexOf(s.norm) !== -1).length >= 1
                     && /\b(?:differ|disagree|why|compare|versus|vs|against)\b/.test(q),
      run: (graph, ev, q) => {
        const ix = index(graph, ev);
        const named = ix.segments.filter(s => norm(q).indexOf(s.norm) !== -1);
        const a = named[0] ? ev.segments.find(s => s.id === named[0].id) : ev.segments[0];
        // With only one segment named, contrast it against the most different
        // one rather than a fixed end of the list — naming the bottom segment
        // used to compare it against itself and silently return nothing.
        let bSeg = named[1] ? ev.segments.find(s => s.id === named[1].id) : null;
        if (a && !bSeg) {
          bSeg = ev.segments
            .filter(s => s.id !== a.id)
            .sort((x, y) => Math.abs(y.positivePct - a.positivePct) -
                            Math.abs(x.positivePct - a.positivePct))[0] || null;
        }
        if (!a || !bSeg || a.id === bSeg.id) return null;
        // Which objection separates them?
        const sep = ev.objections.find(o => o.concentratedIn === bSeg.name)
                 || ev.objections.find(o => o.concentratedIn === a.name);
        return {
          text: a.name + ' sits at ' + a.positivePct + '% positive (' + (a.vsOverall >= 0 ? '+' : '') +
                a.vsOverall + ' vs overall, ±' + a.marginOfError + 'pp), ' + bSeg.name + ' at ' +
                bSeg.positivePct + '% (' + (bSeg.vsOverall >= 0 ? '+' : '') + bSeg.vsOverall + ', ±' +
                bSeg.marginOfError + 'pp).' +
                (sep ? ' The objection separating them is ' + sep.category + ', concentrated in ' +
                       sep.concentratedIn + '.' : ''),
          cites: (a.cites || [a.id]).concat(bSeg.cites || [bSeg.id]),
          quotes: sep ? sep.evidence.slice(0, 2) : [],
          data: { a: a.name, b: bSeg.name }
        };
      }
    },
    {
      id: 'best-segment',
      match: (q) => /\b(?:who|which)\b.*\b(?:most positive|liked it|receptive|best|strongest|warmest)\b/.test(q)
                 || /\bstrongest segment\b/.test(q),
      run: (graph, ev) => {
        const s = ev.segments[0];
        if (!s) return null;
        return {
          text: s.name + ' was the most receptive at ' + s.positivePct + '% positive (' +
                (s.vsOverall >= 0 ? '+' : '') + s.vsOverall + ' vs overall), n=' + s.n +
                ', ±' + s.marginOfError + 'pp.',
          cites: s.cites || [s.id],
          data: { segment: s.name, pct: s.positivePct }
        };
      }
    },
    {
      id: 'worst-segment',
      match: (q) => /\b(?:who|which)\b.*\b(?:least|most negative|hated|rejected|worst|most skeptical|most sceptical)\b/.test(q),
      run: (graph, ev) => {
        const s = ev.segments[ev.segments.length - 1];
        if (!s) return null;
        return {
          text: s.name + ' was least receptive at ' + s.positivePct + '% positive (' +
                s.vsOverall + ' vs overall), n=' + s.n + '.',
          cites: s.cites || [s.id],
          data: { segment: s.name, pct: s.positivePct }
        };
      }
    },
    {
      id: 'confidence',
      match: (q) => /\b(?:how (?:confident|sure|reliable)|confidence|trust (?:this|these)|margin of error|significant)\b/.test(q),
      run: (graph, ev) => {
        const c = ev.confidence;
        return {
          text: 'Confidence is ' + c.level + ': ±' + c.marginOfError + 'pp at n=' + c.n + '. ' +
                c.reasons.map(r => r.detail).join(' ') + ' ' +
                (c.raise.moreCreditsHelp
                  ? 'To improve it: ' + c.raise.action
                  : c.raise.action + ' A larger panel will not help.'),
          cites: (ev.segments[0] ? (ev.segments[0].cites || [ev.segments[0].id]) : []),
          data: { level: c.level, marginOfError: c.marginOfError, moreCreditsHelp: c.raise.moreCreditsHelp }
        };
      }
    },
    {
      id: 'what-to-test',
      match: (q) => /\b(?:what should i test|what to test|test first|next step|next test|one week|validate)\b/.test(q),
      run: (graph, ev) => {
        const x = ev.experiments[0];
        if (!x) return null;
        return {
          text: 'Test this first: ' + x.text +
                (x.variantA && x.variantB ? ' (A: ' + x.variantA + ' vs B: ' + x.variantB + ')' : '') +
                (x.measures ? ', measuring ' + x.measures + '.' : '.') +
                ' It resolves ' + x.resolves.join('; ') + ', which carries the most load.',
          cites: [x.id],
          data: { experiment: x.text }
        };
      }
    },
    {
      id: 'load-bearing',
      // Phrasing varies more than the intent does: "what carries this",
      // "what does the decision rest on", "what is it hinging on".
      match: (q) => /\b(?:rest|rests|resting|depend|depends|hinge|hinges|carr(?:y|ies|ying))\b\s*(?:on|upon)?\b/.test(q)
                 || /\b(?:load[- ]bearing|biggest assumption|key assumption|core assumption|riskiest assumption)\b/.test(q),
      run: (graph, ev) => {
        const l = ev.leverage[0];
        if (!l) return null;
        return {
          text: 'The decision rests on: ' + l.assumption + '. ' + l.whyItRanks +
                ' That ' + l.addressableMass + '% is a ceiling on what addressing it could ' +
                'recover, not a forecast of what it would.' +
                (l.needsExternalVerification
                  ? ' It also rests on something unverified, which no panel can settle.' : ''),
          cites: [l.assumptionId],
          data: { assumption: l.assumption, addressableMass: l.addressableMass }
        };
      }
    },
    {
      id: 'split',
      match: (q) => /\b(?:split|polaris|polariz|divided|disagree(?:ment)?|consensus|agree)\b/.test(q),
      run: (graph, ev) => {
        const p = ev.polarisation;
        const top = ev.segments[0], bot = ev.segments[ev.segments.length - 1];
        return {
          text: p.note + (top && bot
            ? ' The spread runs from ' + top.name + ' at ' + top.positivePct + '% to ' +
              bot.name + ' at ' + bot.positivePct + '%.'
            : ''),
          cites: [top, bot].filter(Boolean).reduce((a, s) => a.concat(s.cites || [s.id]), []),
          data: { etaSquared: p.etaSquared, splits: p.splits }
        };
      }
    },
    {
      id: 'skeptics',
      match: (q) => /\b(?:skeptics?|sceptics?|detractors?|negative)\b.*\b(?:say|said|think|reason|why)\b/.test(q)
                 || /\bwhy .*\b(?:not|no|reject)\b/.test(q),
      run: (graph, ev) => {
        const negs = G.of(graph, 'utterance').filter(u => u.sentiment === 'skeptical');
        if (!negs.length) return null;
        return {
          text: negs.length + ' of ' + ev.stats.n + ' were skeptical (' + ev.stats.skeptical.pct +
                '%). Their objections cluster as: ' +
                ev.objections.slice(0, 3).map(o => o.category + ' ' + o.pct + '%').join(', ') + '.',
          cites: negs.slice(0, 3).map(u => u.id),
          quotes: negs.slice(0, 4).map(u => u.text),
          data: { count: negs.length }
        };
      }
    },
    {
      id: 'recommendation',
      match: (q) => /\b(?:what should (?:i|we) do|recommend|which (?:branch|option|way)|what would you do)\b/.test(q),
      run: (graph, ev) => {
        const b = (ev.branches || []).find(x => x.verdict !== 'no') || (ev.branches || [])[0];
        if (!b) return null;
        return {
          text: 'Of the options tested, ' + b.label + ' is the one the panel does not reject: ' +
                b.why + '. It rests on ' + (b.restsOn.join('; ') || 'no single assumption') + '.',
          cites: [b.id],
          data: { branch: b.label, verdict: b.verdict }
        };
      }
    }
  ];

  /* ========================================================== answer ==== */

  function answer(question, graph, ev) {
    const cls = classify(question, graph, ev);
    const base = {
      question, op: cls.op, intent: cls.intent,
      opLabel: OPS[cls.op].label,
      costsCredits: OPS[cls.op].costsCredits,
      requiresRun: OPS[cls.op].requiresRun,
      reusesPanel: OPS[cls.op].reusesPanel === true,
      answeredFromGraph: false, cites: [], quotes: []
    };

    if (cls.op === 'external') {
      const unresolved = (ev.assumptions || []).filter(a => a.needsExternalVerification);
      return Object.assign(base, {
        text: cls.reason +
          (unresolved.length
            ? ' This study already flags ' + unresolved.length + ' assumption' +
              (unresolved.length === 1 ? '' : 's') + ' needing exactly that kind of verification.'
            : ''),
        nextStep: 'Get a specialist answer. No panel size changes this.',
        cites: unresolved.slice(0, 2).map(a => a.id)
      });
    }

    if (cls.op === 'variant') {
      return Object.assign(base, {
        text: cls.reason,
        nextStep: 'Run a variant on this panel — the same ' + ev.stats.n +
                  ' respondents, the changed proposition. Costs a variant run.',
        cites: (ev.leverage[0] ? [ev.leverage[0].assumptionId] : [])
      });
    }

    if (cls.op === 'panel') {
      return Object.assign(base, {
        text: cls.reason,
        nextStep: 'Run a new panel with that audience. Results will not be directly ' +
                  'comparable to this one, because the people are different.',
        cites: (ev.segments[0] ? (ev.segments[0].cites || [ev.segments[0].id]) : [])
      });
    }

    // query
    const a = cls.intent && ANSWERERS.find(x => x.id === cls.intent);
    const res = a && a.run(graph, ev, question);
    if (!res) {
      // No guess. Say what it would take instead.
      return Object.assign(base, {
        text: cls.reason || 'This study does not contain an answer to that.',
        answeredFromGraph: false,
        nextStep: 'Rephrase using what this study measured — segments, objections, ' +
                  'confidence, assumptions or what to test — or run a variant or new panel.',
        canAnswer: ANSWERERS.map(x => x.id)
      });
    }
    return Object.assign(base, {
      text: res.text, cites: res.cites || [], quotes: res.quotes || [],
      data: res.data || {}, answeredFromGraph: true
    });
  }

  /* ========================================================== verify ==== */
  // Same discipline as the Strategist: a conversation answer may not introduce
  // a figure the evidence does not contain, and must cite what it used.
  function verify(graph, ev, a) {
    const errors = [];
    const ids = new Set(graph.nodes.map(n => n.id));
    const S = window.RStrategist;

    (a.cites || []).forEach(id => {
      if (!ids.has(id)) errors.push('cites unknown node: ' + id);
    });

    if (a.answeredFromGraph) {
      if (!(a.cites || []).length) errors.push('answered from the graph but cites nothing');
      if (S) {
        // The same narrow whitelist the strategist uses, and for the same
        // reason: scanning the whole bundle let any figure appearing anywhere
        // pass, so every field added to the evidence widened what an answer
        // could claim. Both verifiers have to draw from one declared set or
        // they decay independently and silently.
        const allowed = S.quotableNumbers(ev);
        const strings = S.stringsIn(ev);
        S.assertedQuantities(a.text, strings).forEach(q => {
          if (!allowed.has(q.value)) {
            errors.push('asserts a quantity absent from the evidence: ' + q.value + (q.unit || ''));
          }
        });
      }
      // Quotes must be things a persona actually said.
      const said = new Set(G.of(graph, 'utterance').map(u => u.text));
      (a.quotes || []).forEach(qt => {
        if (!said.has(qt)) errors.push('quotes something no respondent said: ' + String(qt).slice(0, 40));
      });
    } else {
      if (!a.nextStep) errors.push('cannot answer but offers no next step');
    }

    if (!OPS[a.op]) errors.push('unknown op: ' + a.op);
    return { ok: errors.length === 0, errors };
  }

  // Answer, then verify. A failing answer is downgraded to an honest refusal
  // rather than shipped.
  function ask(graph, ev, question) {
    const a = answer(question, graph, ev);
    const check = verify(graph, ev, a);
    if (check.ok) return Object.assign(a, { verified: true });
    return Object.assign({}, a, {
      verified: false,
      answeredFromGraph: false,
      text: 'I could not answer that from this study without guessing, so I will not.',
      nextStep: 'Rephrase using what the study measured, or run a variant or new panel.',
      quotes: [],
      rejected: check.errors
    });
  }

  return { OPS, ANSWERERS, index, classify, answer, verify, ask };
})();
