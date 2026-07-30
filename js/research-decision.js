// Indizilla Research — renders the v2 decision sections.
//
// The v1 memo header keeps working because runStudy still writes the legacy
// mirror. This file adds what the flat memo could never express: confidence
// that explains itself, a ranked objection table, what the decision rests on,
// the unverified claims held apart from the evidence, and the moves.
//
// It renders from the view model produced by RViews, and styles by block
// `kind` — evidence, reasoning, recommendation, unknown — so a reader can see
// which sentences are measurements and which are judgement.

window.RDecision = (() => {
  const esc = (s) => String(s == null ? '' : s)
    .replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const KIND_LABEL = {
    evidence: 'Evidence', reasoning: 'Our reading',
    recommendation: 'Judgement', unknown: 'Unverified'
  };

  const MOVE_LABEL = {
    kill: 'Kill', double_down: 'Double down', ignore: 'Set aside',
    validate: 'Validate first', pivot: 'Pivot'
  };

  function sectionHead(s) {
    return '<div class="dh"><h3>' + esc(s.title) + '</h3>' +
           '<span class="kind-tag kind-' + s.kind + '">' + esc(KIND_LABEL[s.kind] || s.kind) + '</span></div>';
  }

  function renderDecision(b, strat) {
    if (b.type === 'position') {
      return '<p class="d-position">' + esc(b.text) + '</p>';
    }
    if (b.type === 'branches') {
      return '<div class="d-branches">' + b.branches.map(br =>
        '<div class="d-branch' + (br.recommended ? ' is-rec' : '') + '">' +
        '<div class="db-top"><span class="db-label">' + esc(br.label) + '</span>' +
        '<span class="db-verdict v-' + br.verdict + '">' + esc(br.verdictLabel) + '</span></div>' +
        (br.recommended ? '<div class="db-rec">Recommended</div>' : '') +
        '<p>' + esc(br.why) + '</p></div>').join('') + '</div>';
    }
    if (b.type === 'because') {
      return '<ul class="d-list d-for">' + b.items.map(i =>
        '<li>' + esc(i.text) + '</li>').join('') + '</ul>';
    }
    if (b.type === 'against') {
      // Never collapsed. A recommendation without its counter-case is advocacy.
      return '<div class="d-against"><div class="da-label">The case against</div>' +
        '<ul class="d-list">' + b.items.map(i => '<li>' + esc(i.text) + '</li>').join('') +
        '</ul></div>';
    }
    return '';
  }

  function renderConfidence(b) {
    if (b.type === 'confidence') {
      return '<div class="d-conf c-' + b.level + '">' +
        '<div class="dc-head"><span class="dc-level">' + esc(b.level) + '</span>' +
        '<span class="dc-margin">±' + b.marginOfError + 'pp · n=' + b.n + '</span></div>' +
        '<ul class="dc-reasons">' + b.reasons.map(r =>
          '<li><span class="dcr-term">' + esc(r.term) + '</span> ' + esc(r.detail) + '</li>'
        ).join('') + '</ul></div>';
    }
    if (b.type === 'raise-confidence') {
      // No upgrade is offered when a bigger panel would not honestly help.
      return '<div class="d-raise' + (b.offerUpgrade ? '' : ' no-help') + '">' +
        '<div class="dr-label">' + (b.offerUpgrade ? 'To raise confidence' : 'A larger panel will not help') + '</div>' +
        '<p>' + esc(b.action) + '</p>' +
        (b.note ? '<p class="dr-note">' + esc(b.note) + '</p>' : '') +
        (b.offerUpgrade
          ? '<a class="btn btn-secondary btn-sm" href="research-pricing.html">Run a larger panel</a>'
          : '') +
        '</div>';
    }
    return '';
  }

  function renderPanel(b) {
    if (b.type === 'polarisation') {
      return '<div class="d-split"><div class="ds-label">This market splits</div>' +
        '<p>' + esc(b.note) + '</p></div>';
    }
    if (b.type === 'stats') {
      return '<div class="d-dist">' + b.distribution.map(d =>
        '<div class="dd-row"><span class="ddr-lab">' + esc(d.label) + '</span>' +
        '<span class="ddr-bar"><i style="width:' + d.pct + '%"></i></span>' +
        '<span class="ddr-num">' + d.pct + '% <small>(' + d.count + ')</small></span></div>'
      ).join('') + '<div class="dd-foot">Mean intent ' + b.meanIntent +
        '/5 · margin ±' + b.marginOfError + 'pp</div></div>';
    }
    if (b.type === 'segments') {
      return '<div class="table-wrap"><table class="d-table"><thead><tr>' +
        '<th>Segment</th><th>n</th><th>Positive</th><th>vs overall</th><th>±pp</th>' +
        '</tr></thead><tbody>' + b.segments.map(s =>
          '<tr' + (s.below ? ' class="is-below"' : '') + '><td>' + esc(s.name) +
          (s.thin ? ' <span class="thin-flag" title="Too few responses to read alone">thin</span>' : '') +
          '</td><td>' + s.n + '</td><td>' + s.positivePct + '%</td>' +
          '<td class="' + (s.below ? 'neg' : 'pos') + '">' +
          (s.vsOverall >= 0 ? '+' : '') + s.vsOverall + '</td>' +
          '<td>±' + s.marginOfError + '</td></tr>'
        ).join('') + '</tbody></table></div>';
    }
    return '';
  }

  function renderObjections(b) {
    const max = Math.max.apply(null, b.rows.map(r => r.pct).concat([1]));
    return '<div class="d-objs">' + b.rows.map(r =>
      '<div class="d-obj"><div class="do-top">' +
      '<span class="do-cat">' + esc(r.category) + '</span>' +
      '<span class="do-bar"><i style="width:' + Math.round(r.pct / max * 100) + '%"></i></span>' +
      '<span class="do-pct">' + r.pct + '% <small>(' + r.count + ')</small></span></div>' +
      (r.concentratedIn ? '<div class="do-conc">Concentrated in ' + esc(r.concentratedIn) + '</div>' : '') +
      '<ul class="do-quotes">' + (r.examples || []).map(q =>
        '<li>' + esc(q) + '</li>').join('') + '</ul></div>'
    ).join('') + '</div>';
  }

  function renderLeverage(b) {
    return '<p class="d-note">' + esc(b.massLabel) + '</p>' +
      '<ol class="d-lev">' + b.rows.map(r =>
        '<li><div class="dl-top"><span class="dl-mass">' + r.addressableMass + '%</span>' +
        '<span class="dl-assume">' + esc(r.assumption) + '</span></div>' +
        '<p class="dl-why">' + esc(r.whyItRanks) + '</p>' +
        (r.needsExternalVerification
          ? '<p class="dl-ext">A panel cannot settle this — needs external verification.</p>' : '') +
        ((r.resolvedBy || []).length
          ? '<p class="dl-res">Resolved by: ' + r.resolvedBy.map(x => esc(x.text)).join('; ') + '</p>' : '') +
        '</li>').join('') + '</ol>';
  }

  function renderReasoning(b) {
    return '<p class="d-disclaim">' + esc(b.disclaimer) + '</p>' +
      '<ul class="d-list">' + b.chains.map(c =>
        '<li>' + esc(c.text) +
        ((c.derivedFrom || []).length
          ? '<span class="dc-from"> — derived from: ' + c.derivedFrom.map(esc).join('; ') + '</span>'
          : '') + '</li>').join('') + '</ul>';
  }

  function renderUnknown(b) {
    // No confidence figure appears here, by construction — the view model has
    // nowhere to put one.
    return '<p class="d-disclaim">' + esc(b.disclaimer) + '</p>' +
      '<ul class="d-unknowns">' + (b.claims || []).map(c =>
        '<li>' + esc(c.text) + ' <small>raised by ' + c.raisedBy + '</small></li>').join('') +
      (b.unknowns || []).map(u => '<li>' + esc(u.text) + '</li>').join('') +
      '</ul>';
  }

  function renderMoves(b) {
    if (b.type === 'moves') {
      return '<ol class="d-moves">' + b.moves.map(m =>
        '<li class="dm m-' + m.kind + '"><span class="dm-kind">' +
        esc(MOVE_LABEL[m.kind] || m.kind) + '</span><span class="dm-text">' + esc(m.text) +
        (m.addressableMass != null
          ? ' <span class="dm-ceil">ceiling ' + m.addressableMass + '%, not a forecast</span>' : '') +
        '</span></li>').join('') + '</ol>';
    }
    if (b.type === 'one-week') {
      return '<div class="d-week"><div class="dw-label">If you only have one week</div>' +
        '<p>' + esc(b.text) + '</p></div>';
    }
    if (b.type === 'set-aside') {
      // Kept visible rather than deleted — hidden work is what makes people
      // distrust a recommendation.
      return '<details class="d-aside"><summary>' + esc(b.note) + '</summary><ul class="d-list">' +
        b.items.map(i => '<li>' + esc(i.text) + ' — <small>' + esc(i.why) + '</small></li>').join('') +
        '</ul></details>';
    }
    return '';
  }

  function renderExperiments(b) {
    return '<ol class="d-exps">' + b.rows.map(r =>
      '<li><p class="de-text">' + esc(r.text) + '</p>' +
      (r.variantA && r.variantB
        ? '<div class="de-ab"><span><b>A</b> ' + esc(r.variantA) + '</span>' +
          '<span><b>B</b> ' + esc(r.variantB) + '</span></div>' : '') +
      (r.measures ? '<p class="de-meas">Measures: ' + esc(r.measures) + '</p>' : '') +
      '</li>').join('') + '</ol>';
  }

  function renderBlock(section, b, model) {
    switch (section.id) {
      case 'decision':    return renderDecision(b, model);
      case 'confidence':  return renderConfidence(b);
      case 'panel':       return renderPanel(b);
      case 'objections':  return renderObjections(b);
      case 'leverage':    return renderLeverage(b);
      case 'reasoning':   return renderReasoning(b);
      case 'unknown':     return renderUnknown(b);
      case 'moves':       return renderMoves(b);
      case 'experiments': return renderExperiments(b);
      default:            return '';
    }
  }

  // Voices are already rendered by the legacy report, so they are skipped here
  // to avoid showing the same quotes twice.
  const SKIP = ['voices'];

  function render(container, model) {
    if (!container || !model) return false;
    const html = model.sections.filter(s => SKIP.indexOf(s.id) === -1).map(s =>
      '<section class="d-sec d-' + s.id + ' kind-' + s.kind + '">' + sectionHead(s) +
      s.blocks.map(b => renderBlock(s, b, model)).join('') + '</section>'
    ).join('');

    const prov = model.provenance || {};
    const foot = '<p class="d-prov">Judgement produced by <strong>' + esc(prov.producedBy) +
      '</strong>' + (prov.traceable ? ', every claim traceable to the panel' : '') +
      (prov.rejectedGenerated
        ? '. A generated recommendation was rejected for asserting figures the panel did not support.'
        : '') + '.</p>';

    container.innerHTML = html + foot;
    container.hidden = false;
    return true;
  }

  // Entry point for the report page: build the view from a stored graph and
  // render it. Returns false when the study predates v2.
  function mount(containerId, study) {
    const memo = study && study.memo;
    if (!memo || memo.engineVersion !== 2 || !memo.graph) return false;
    if (!(window.REvidence && window.RStrategist && window.RViews)) return false;

    const graph = memo.graph;
    const ev = window.REvidence.evidence(graph);
    const strat = window.RStrategist.strategise(graph, ev);
    const model = window.RViews.decisionMemo(graph, ev, strat);

    const audit = window.RViews.auditView(model);
    if (!audit.ok && window.console) console.warn('[decision] view audit:', audit.errors);

    return render(document.getElementById(containerId), model);
  }

  return { mount, render, KIND_LABEL, MOVE_LABEL };
})();
