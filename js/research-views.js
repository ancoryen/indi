// Indizilla Research — views.
//
// A view is a projection of the decision graph, never a second source of truth.
// These functions return view MODELS — ordered, labelled plain data — and the
// page renders them. Keeping rendering out of here means the honesty rules are
// testable without a browser.
//
// Every block carries a `kind`, which is the four-way split made structural:
//
//   evidence        computed from the panel      (a number you can trace)
//   reasoning       the model's inference        (labelled, never dressed as data)
//   recommendation  judgement over evidence      (cited, with the case against)
//   unknown         outside what a panel settles (no confidence, ever)
//
// The UI styles by `kind`. A founder should be able to tell at a glance which
// sentences are measurements and which are opinions.

window.RViews = (() => {
  const G = window.RGraph;

  const KINDS = ['evidence', 'reasoning', 'recommendation', 'unknown', 'interaction'];

  const VERDICT_LABEL = { go: 'Go', conditional: 'Conditional', no: 'Reconsider' };

  function block(kind, fields) {
    if (!KINDS.includes(kind)) throw new Error('Unknown block kind: ' + kind);
    return Object.assign({ kind }, fields);
  }

  /* ---- header: confidence is never cosmetic ---- */
  function header(ev, strat) {
    const c = ev.confidence;
    const split = ev.polarisation && ev.polarisation.splits;
    return {
      verdict: strat.recommendation.branch
        ? { label: strat.recommendation.branch, kind: 'recommendation' }
        : { label: VERDICT_LABEL[(ev.branches[0] || {}).verdict] || 'Inconclusive', kind: 'evidence' },
      confidence: { level: c.level, marginOfError: c.marginOfError, n: c.n },
      // When the interval straddles a verdict boundary the memo says so instead
      // of presenting a coin flip as a finding.
      robust: c.level !== 'low',
      // A split market means the average describes nobody, so the memo leads
      // with the division rather than the mean.
      leadWith: split ? 'split' : 'verdict',
      caution: c.level === 'low'
        ? 'At this panel size the headline figure carries ±' + c.marginOfError +
          'pp. Treat this as a direction, not a decision.'
        : null
    };
  }

  /* ---- the decision memo ---- */
  function decisionMemo(graph, ev, strat) {
    const sections = [];
    const c = ev.confidence;

    /* 1. the decision itself */
    sections.push({
      id: 'decision', title: 'The decision', kind: 'recommendation',
      blocks: [
        block('recommendation', { type: 'position', text: strat.position.text, cites: strat.position.cites }),
        block('recommendation', {
          type: 'branches',
          branches: ev.branches.map(b => ({
            label: b.label, verdict: b.verdict,
            verdictLabel: b.evaluated ? (VERDICT_LABEL[b.verdict] || b.verdict) : 'Not evaluated',
            evaluated: b.evaluated,
            // Single source for the share — the view never re-rounds it.
            preferenceShare: b.preferenceShare, n: b.n, marginOfError: b.marginOfError,
            why: b.why, restsOn: b.restsOn,
            recommended: b.label === strat.recommendation.branch
          }))
        }),
        block('recommendation', { type: 'because', items: strat.recommendation.because }),
        // Shown, never collapsed by default. A recommendation without its
        // counter-case is advocacy.
        block('recommendation', { type: 'against', items: strat.recommendation.against, alwaysVisible: true })
      ]
    });

    /* 2. confidence, explaining itself */
    sections.push({
      id: 'confidence', title: 'How much to trust this', kind: 'evidence',
      blocks: [
        block('evidence', {
          type: 'confidence',
          level: c.level, marginOfError: c.marginOfError, n: c.n,
          reasons: c.reasons
        }),
        block(c.raise.moreCreditsHelp ? 'evidence' : 'unknown', {
          type: 'raise-confidence',
          action: c.raise.action,
          moreCreditsHelp: c.raise.moreCreditsHelp,
          note: c.raise.note || null,
          // Drives an upsell only when it would honestly help. When it would
          // not, the copy says so and no purchase is offered.
          offerUpgrade: c.raise.moreCreditsHelp === true,
          suggestedN: c.raise.suggestedN || null
        })
      ]
    });

    /* 2b. what would change the answer */
    // Placed next to confidence deliberately: "how much to trust this" and
    // "what would overturn it" are the same question asked twice, and a reader
    // who has just been given a margin of error is exactly the reader who needs
    // the flip conditions.
    if ((ev.flips || []).length) {
      sections.push({
        id: 'flips', title: 'What would change this', kind: 'evidence',
        blocks: (ev.flips || []).map(f => block(f.measured ? 'evidence' : 'reasoning', {
          type: 'flip',
          flipType: f.type,
          text: f.text,
          measured: f.measured === true,
          conditional: f.conditional === true,
          addressableMass: f.addressableMass != null ? f.addressableMass : null,
          isCeilingNotForecast: f.isCeilingNotForecast === true,
          segment: f.segment || null,
          fixedBy: f.fixedBy || null
        }))
      });
    }

    /* 3. what the panel actually said */
    const statBlocks = [
      block('evidence', {
        type: 'stats',
        n: ev.stats.n,
        distribution: [
          { label: 'reacted positively', pct: ev.stats.positive.pct, count: ev.stats.positive.count },
          { label: 'were neutral',       pct: ev.stats.neutral.pct,  count: ev.stats.neutral.count },
          { label: 'were skeptical',     pct: ev.stats.skeptical.pct, count: ev.stats.skeptical.count }
        ],
        meanIntent: ev.stats.meanIntent,
        marginOfError: ev.sampling.marginOfError
      })
    ];
    if (ev.polarisation.splits) {
      statBlocks.unshift(block('evidence', {
        type: 'polarisation',
        etaSquared: ev.polarisation.etaSquared,
        note: ev.polarisation.note,
        prominent: true
      }));
    }
    statBlocks.push(block('evidence', {
      type: 'segments',
      // These groups are DISCOVERED from answer similarity, not assigned when
      // the roster was built. The method and its separation score travel with
      // the table, because a weakly separated grouping presented as four
      // confident boxes is the failure mode this whole layer exists to avoid.
      method: (ev.clustering || {}).method || null,
      separation: (ev.clustering || {}).separation,
      weak: (ev.clustering || {}).weak === true,
      methodNote: (ev.clustering || {}).note || null,
      // Signed deltas, and a segment may sit below the overall rate.
      segments: ev.segments.map(s => ({
        name: s.name, n: s.n, positivePct: s.positivePct,
        vsOverall: s.vsOverall, below: s.vsOverall < 0,
        meanIntent: s.meanIntent, marginOfError: s.marginOfError,
        thin: s.n < 20,
        // What defines the group, and who turned out to be in it.
        definedBy: s.definedBy || null,
        composition: (s.archetypeMix || []).slice(0, 3),
        roles: (s.roleMix || []).slice(0, 2),
        prefers: s.branchPreference
          ? { label: s.branchPreference.value, pct: s.branchPreference.pct } : null
      }))
    }));
    sections.push({ id: 'panel', title: 'What the panel said', kind: 'evidence', blocks: statBlocks });

    /* 4. why they objected — ranked, with verbatims underneath */
    sections.push({
      id: 'objections', title: 'Why they objected', kind: 'evidence',
      blocks: [block('evidence', {
        type: 'objection-table',
        // Two orderings, offered as a choice rather than merged. Mass answers
        // "what did they talk about"; priority answers "what do I deal with
        // first". They are different questions and one column cannot serve both.
        severityNote: 'Severity is our assessment of what each kind of objection costs ' +
                      'to be wrong about — not something the panel voted on. Share and ' +
                      'count are measured.',
        rows: ev.objections.map(o => ({
          category: o.category, count: o.count, pct: o.pct,
          distinctObjections: o.distinctObjections,
          concentratedIn: o.concentratedIn,
          // Both figures travel with the name. "Concentrated in X" without the
          // lift is the claim the reader cannot check, and the renderer was
          // printing "undefined%" without them.
          concentration: o.concentration,
          concentrationLift: o.concentrationLift,
          examples: o.objections.slice(0, 3),
          evidence: o.evidence,
          severity: o.severity,
          severityBasis: o.severityBasis,
          severityWhy: o.severityWhy,
          massRank: o.massRank,
          priorityRank: o.priorityRank,
          // Rare but expensive: the row a popularity-sorted table buries.
          underweighted: o.pct < 10 && ['critical', 'high'].indexOf(o.severity) !== -1
        }))
      })]
    });

    /* 4b. what they use today */
    const subs = ev.substitutes || {};
    if ((subs.byKind || []).length) {
      sections.push({
        id: 'substitutes', title: 'What they use today', kind: 'evidence',
        blocks: [block('evidence', {
          type: 'substitutes',
          n: subs.n, coverage: subs.coverage,
          monetisedPct: subs.monetisedPct,
          note: subs.note,
          // The panel cannot name your competitors — it has no market data —
          // so this is what these respondents said they do instead. Saying so
          // is the difference between a finding and a competitive-landscape
          // section that quietly makes itself up.
          scopeNote: 'What these respondents said they do today. A panel cannot tell you ' +
                     'who your competitors are — only what this audience would be switching from.',
          rows: (subs.byKind || []).map(k => ({
            label: k.label, kind: k.kind, pct: k.pct, count: k.count,
            monetised: k.monetised,
            wouldSwitchPct: k.wouldSwitchPct,
            marginOfError: k.marginOfError
          })),
          named: (subs.named || []).slice(0, 6)
        })]
      });
    }

    /* 5. what the decision rests on */
    sections.push({
      id: 'leverage', title: 'What the decision rests on', kind: 'evidence',
      blocks: [block('evidence', {
        type: 'leverage',
        // The label is not optional: this is a ceiling on what could be
        // recovered, not a forecast of what would be.
        massLabel: 'share of objections attached to this — a ceiling, not a forecast',
        rows: ev.leverage.map(l => ({
          rank: l.rank, assumption: l.assumption,
          addressableMass: l.addressableMass,
          isCeilingNotForecast: l.isCeilingNotForecast,
          whyItRanks: l.whyItRanks,
          resolvedBy: l.resolvedBy,
          needsExternalVerification: l.needsExternalVerification
        }))
      })]
    });

    /* 6. reasoning — the model's theory, marked as such */
    const causal = ev.claims.causal || [];
    if (causal.length) {
      sections.push({
        id: 'reasoning', title: 'Our reading of why', kind: 'reasoning',
        blocks: [block('reasoning', {
          type: 'causal-chain',
          disclaimer: 'Inference, not testimony. The panel said the first link; the rest is our reading.',
          chains: causal.map(c => ({ text: c.text, derivedFrom: c.derivedFrom }))
        })]
      });
    }

    /* 7. unverified — no confidence attached, by construction */
    const factual = ev.claims.factual || [];
    if (factual.length || strat.unknowns.length) {
      sections.push({
        id: 'unknown', title: 'Raised but unverified', kind: 'unknown',
        blocks: [block('unknown', {
          type: 'needs-verification',
          disclaimer: 'Raised by personas. Not verified. A larger panel cannot settle these.',
          // No confidence, no percentage. The view model has nowhere to put one.
          claims: factual.map(f => ({ text: f.text, raisedBy: f.attestedBy })),
          unknowns: strat.unknowns
        })]
      });
    }

    /* 7b. positioning to test — hypotheses, never findings */
    if (strat.messaging && (strat.messaging.concepts || []).length) {
      sections.push({
        id: 'messaging', title: 'Positioning to test', kind: 'recommendation',
        blocks: [block('recommendation', {
          type: 'messaging',
          // Carried through to the page. The panel never saw any of these
          // framings, and a messaging section that reads as validated is the
          // quietest lie a research tool can print.
          disclaimer: strat.messaging.disclaimer,
          concepts: strat.messaging.concepts.map(c => ({
            role: c.role, roleLabel: c.roleLabel,
            audience: c.audience, promise: c.promise,
            answers: c.answers, why: c.why,
            tested: c.tested === true, cites: c.cites
          }))
        })]
      });
    }

    /* 8. what to do */
    sections.push({
      id: 'moves', title: 'What we would do', kind: 'recommendation',
      blocks: [
        block('recommendation', {
          type: 'moves',
          // Grouped by horizon, so the plan reads as a sequence rather than a
          // list. The tier is derived from whether a move blocks the decision.
          horizons: ['now', '30d', '90d'],
          moves: strat.moves.map(m => ({
            kind: m.kind, rank: m.rank, text: m.text, cites: m.cites,
            horizon: m.horizon || '30d',
            horizonLabel: m.horizonLabel || null,
            addressableMass: m.addressableMass != null ? m.addressableMass : null,
            isCeilingNotForecast: m.isCeilingNotForecast === true
          }))
        })
      ].concat(strat.oneWeek ? [block('recommendation', {
        type: 'one-week', text: strat.oneWeek.text, cites: strat.oneWeek.cites
      })] : []).concat(strat.ignoreForNow.length ? [block('recommendation', {
        type: 'set-aside',
        note: 'Considered and set aside — kept visible rather than deleted.',
        items: strat.ignoreForNow
      })] : [])
    });

    /* 9. what to test */
    if (ev.experiments.length) {
      sections.push({
        id: 'experiments', title: 'What to test', kind: 'recommendation',
        blocks: [block('recommendation', {
          type: 'experiments',
          rows: ev.experiments.map(x => ({
            text: x.text, variantA: x.variantA, variantB: x.variantB,
            measures: x.measures, resolves: x.resolves, removesLoad: x.removesLoad
          }))
        })]
      });
    }

    /* 10. voices, with the priors that shaped them */
    const voices = G.of(graph, 'utterance').map(u => {
      const p = G.sources(graph, u.id, 'voiced_by')[0] || null;
      const seg = p ? (G.targets(graph, p.id, 'in_segment')[0] || null) : null;
      return {
        text: u.text, sentiment: u.sentiment, intent: u.intent,
        persona: p ? {
          role: p.role, age: p.age, market: p.market,
          // The prior is shown so a reader can judge the source rather than
          // just consume the quote.
          worldview: p.worldview, experience: p.experience
        } : null,
        segment: seg ? seg.name : null
      };
    });
    sections.push({
      id: 'voices', title: 'Sample voices', kind: 'evidence',
      blocks: [block('evidence', { type: 'voices', voices, shown: voices.length })]
    });

    return {
      view: 'decision-memo',
      studyId: graph.studyId,
      panelId: graph.panelId,
      header: header(ev, strat),
      sections,
      provenance: {
        producedBy: strat.producedBy,
        traceable: strat.traceable === true,
        rejectedGenerated: strat.rejectedGenerated || null,
        models: graph.meta || {},
        generatedAt: (graph.meta || {}).generatedAt || null
      }
    };
  }

  /* ---- executive summary: a compressed DECISION, not a compressed report ---- */
  function executiveSummary(graph, ev, strat) {
    const top = ev.leverage[0] || null;
    const firstMove = strat.moves[0] || null;
    return {
      view: 'executive-summary',
      studyId: graph.studyId,
      recommendation: block('recommendation', {
        text: strat.position.text,
        branch: strat.recommendation.branch,
        cites: strat.position.cites
      }),
      // One line of evidence, chosen by what actually drives the decision.
      keyEvidence: block('evidence', {
        text: ev.polarisation.splits
          ? ev.polarisation.note
          : ev.stats.positive.pct + '% of ' + ev.stats.n + ' reacted positively (±' +
            ev.sampling.marginOfError + 'pp).',
        cites: []
      }),
      loadBearing: top ? block('evidence', {
        text: top.assumption,
        addressableMass: top.addressableMass,
        isCeilingNotForecast: true,
        needsExternalVerification: top.needsExternalVerification
      }) : null,
      nextAction: firstMove ? block('recommendation', {
        text: firstMove.text, moveKind: firstMove.kind, cites: firstMove.cites
      }) : null,
      confidence: block(ev.confidence.raise.moreCreditsHelp ? 'evidence' : 'unknown', {
        level: ev.confidence.level,
        marginOfError: ev.confidence.marginOfError,
        limitedBy: (ev.confidence.raise || {}).term,
        moreCreditsHelp: ev.confidence.raise.moreCreditsHelp
      }),
      // The single thing a panel cannot settle, surfaced at summary level so it
      // is not buried three sections down.
      biggestUnknown: (strat.unknowns[0] || null) &&
        block('unknown', { text: strat.unknowns[0].text, cites: strat.unknowns[0].cites })
    };
  }

  /* ---- conversation: three distinct operations, not one "follow-up" ---- */
  // query   answerable from the stored graph — cheap
  // variant same panel, new stimulus — a paired comparison, and better science
  //         than a fresh panel because variance between the two is the change
  // panel   a new roster — a different population, so a full run
  function conversation(graph, ev, strat) {
    const suggestions = [];
    const seg = ev.segments[0];
    const weak = ev.segments[ev.segments.length - 1];
    const topObj = ev.objections[0];
    const top = ev.leverage[0];

    if (topObj) {
      suggestions.push({
        op: 'query', requiresNewRun: false,
        text: 'What exactly did the ' + topObj.category + ' objectors say?',
        why: 'Largest objection block at ' + topObj.pct + '%.'
      });
    }
    if (seg && weak && seg.name !== weak.name) {
      suggestions.push({
        op: 'query', requiresNewRun: false,
        text: 'Why does ' + weak.name + ' disagree with ' + seg.name + '?',
        why: 'The panel splits between these two groups.'
      });
    }
    if (top) {
      suggestions.push({
        op: 'variant', requiresNewRun: true, reusesPanel: true,
        text: 'What if we removed the part that depends on "' + top.assumption + '"?',
        why: 'Highest-load assumption. Same panel, so the difference is the change.'
      });
    }
    if (seg) {
      suggestions.push({
        op: 'panel', requiresNewRun: true, reusesPanel: false,
        text: 'What if this were only for ' + seg.name + '?',
        why: 'A different population needs a different roster.'
      });
    }

    return {
      view: 'conversation',
      studyId: graph.studyId,
      panelId: graph.panelId,
      // Pricing is owned server-side; views only declare the shape of the work.
      operations: {
        query:   { label: 'Ask about these results', requiresNewRun: false, reusesPanel: true },
        variant: { label: 'Test a change on this panel', requiresNewRun: true, reusesPanel: true },
        panel:   { label: 'Run a new panel', requiresNewRun: true, reusesPanel: false }
      },
      suggestions,
      // What the conversation may cite, so answers stay traceable too.
      citableNodeIds: graph.nodes.map(n => n.id)
    };
  }

  /* ---- renderability guard: the honesty rules, checked ---- */
  // Views can drift as markup changes, so the properties are asserted rather
  // than assumed. Run in tests and before shipping a new section.
  function auditView(v) {
    const errors = [];
    const walk = (blocks, where) => (blocks || []).forEach((b, i) => {
      const at = where + '[' + i + ']';
      if (!KINDS.includes(b.kind)) errors.push(at + ' unknown kind: ' + b.kind);

      // An `unknown` block may never carry a confidence figure.
      if (b.kind === 'unknown') {
        ['confidence', 'level', 'pct', 'marginOfError'].forEach(f => {
          if (f in b && b[f] != null && b.type !== 'raise-confidence' && b.type !== undefined) {
            if (b.type === 'needs-verification') {
              errors.push(at + ' is an unknown block carrying "' + f + '" — a panel ' +
                          'cannot lend confidence to something it cannot settle');
            }
          }
        });
        (b.claims || []).forEach((c, j) => {
          if ('confidence' in c || 'pct' in c) {
            errors.push(at + '.claims[' + j + '] carries confidence on an unverified claim');
          }
        });
      }

      // Any quoted mass must be labelled a ceiling — including on the block
      // itself, which is where a flip condition carries one.
      const rows = (b.rows || []).concat(b.moves || []);
      rows.forEach((r, j) => {
        if (r.addressableMass != null && r.isCeilingNotForecast !== true) {
          errors.push(at + '.rows[' + j + '] quotes addressableMass without marking it a ceiling');
        }
      });
      if (b.addressableMass != null && b.isCeilingNotForecast !== true) {
        errors.push(at + ' quotes addressableMass without marking it a ceiling');
      }

      // Severity is an assigned prior. A row that carries a tier without
      // declaring where it came from reads as something the panel measured.
      (b.rows || []).forEach((r, j) => {
        if (r.severity != null && r.severityBasis !== 'assigned') {
          errors.push(at + '.rows[' + j + '] carries severity "' + r.severity +
                      '" without severityBasis:"assigned" — the panel did not vote on severity');
        }
      });

      // Positioning concepts were never put to the panel.
      if (b.type === 'messaging') {
        if (!b.disclaimer) {
          errors.push(at + ' is a messaging block with no disclaimer — untested framings ' +
                      'must not read as findings');
        }
        (b.concepts || []).forEach((c, j) => {
          if (c.tested !== false) {
            errors.push(at + '.concepts[' + j + '] does not declare tested:false');
          }
          ['pct', 'lift', 'marginOfError', 'confidence'].forEach(f => {
            if (f in c && c[f] != null) {
              errors.push(at + '.concepts[' + j + '] carries "' + f + '" — a framing the ' +
                          'panel never saw cannot carry a measurement');
            }
          });
        });
      }

      // A flip condition that is not measured must say so.
      if (b.type === 'flip' && b.measured !== true && b.conditional !== true) {
        errors.push(at + ' is an unmeasured flip condition not marked conditional');
      }

      // A recommendation must be traceable.
      if (b.kind === 'recommendation' && b.type === 'position' && !(b.cites || []).length) {
        errors.push(at + ' position cites nothing');
      }
    });

    if (v.view === 'decision-memo') {
      (v.sections || []).forEach(s => walk(s.blocks, s.id));
      const dec = (v.sections || []).find(s => s.id === 'decision');
      const against = dec && dec.blocks.find(b => b.type === 'against');
      if (!against || !(against.items || []).length) {
        errors.push('decision section shows no case against the recommendation');
      }
      if (!v.provenance || v.provenance.traceable !== true) {
        errors.push('memo is not marked traceable');
      }
    }
    if (v.view === 'executive-summary') {
      walk([v.recommendation, v.keyEvidence, v.confidence].filter(Boolean), 'summary');
      if (v.biggestUnknown && v.biggestUnknown.kind !== 'unknown') {
        errors.push('biggestUnknown is not tagged as an unknown');
      }
    }
    return { ok: errors.length === 0, errors };
  }

  return { KINDS, VERDICT_LABEL, decisionMemo, executiveSummary, conversation, auditView, header };
})();
