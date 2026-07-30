// The primary invariant: a verdict-bearing node must be evidenced.
//
// The stress batch found that branch verdicts were assigned from overall
// sentiment plus position in the sentence. Swapping "A or B" to "B or A"
// swapped the verdicts, and the strategist recommended the second option in 10
// of 10 unrelated studies — while no persona had evaluated either option.
//
// These five tests exist so that class of failure cannot return. They are
// deliberately blunt: each one would have failed loudly against the engine as
// it stood before the fix.
//
//   node test/invariants.test.js

const fs = require('fs');
const path = require('path');
const REPO = path.join(__dirname, '..');
global.window = global;
['research-graph', 'research-evidence', 'research-strategist', 'research-views',
 'research-panel', 'research-conversation']
  .forEach(f => eval(fs.readFileSync(path.join(REPO, 'js/' + f + '.js'), 'utf8')));
const G = window.RGraph, E = window.REvidence, S = window.RStrategist,
      V = window.RViews, P = window.RPanel;

let pass = 0, fail = 0; const fails = [];
const chk = (n, c, d) => c ? pass++ : (fail++, fails.push(n + (d ? ' — ' + d : '')));
const hr = t => console.log('\n' + '='.repeat(74) + '\n' + t + '\n' + '='.repeat(74));

const base = (decision_q) => ({
  id: 'std_inv',
  idea: 'A scheduling tool for clinics that fills cancelled appointment slots automatically.',
  decision_q,
  audience: { markets: ['India'], ages: ['25-34', '35-44'],
              roles: ['Clinic Manager', 'Doctor', 'Receptionist', 'Patient'],
              attitude: { skeptics: 45 } },
  mode: 'signal-plus', respondents: 200
});
const runOf = (q) => {
  const g = P.run(base(q));
  const ev = E.evidence(g);
  return { g, ev, strat: S.strategise(g, ev) };
};

/* ============================================================ INVARIANT 1 */
hr('1. SWAPPING BRANCH ORDER CANNOT CHANGE THE RECOMMENDATION');
const fwd = runOf('Should we charge per clinic or per filled slot?');
const rev = runOf('Should we charge per filled slot or per clinic?');

const shareOf = (r, label) => {
  const b = r.ev.branches.find(x => x.label.toLowerCase().indexOf(label) !== -1);
  return b ? { verdict: b.verdict, share: b.preferenceShare, n: b.n } : null;
};
['per clinic', 'per filled slot'].forEach(label => {
  const a = shareOf(fwd, label), b = shareOf(rev, label);
  console.log('  ' + label.padEnd(18) +
    'forward: ' + a.verdict + ' ' + a.share + '% (n=' + a.n + ')   ' +
    'reversed: ' + b.verdict + ' ' + b.share + '% (n=' + b.n + ')');
  chk('"' + label + '" keeps its verdict when the question is reordered',
    a.verdict === b.verdict, a.verdict + ' vs ' + b.verdict);
  chk('"' + label + '" keeps its measured share when reordered',
    a.share === b.share, a.share + ' vs ' + b.share);
});
console.log('\n  forward recommends : ' + fwd.strat.recommendation.branch);
console.log('  reversed recommends: ' + rev.strat.recommendation.branch);
chk('the recommendation is identical under reordering',
  fwd.strat.recommendation.branch === rev.strat.recommendation.branch,
  fwd.strat.recommendation.branch + ' vs ' + rev.strat.recommendation.branch);

// The old failure signature: recommendation always landed on branch index 1.
const idxOf = (r) => r.ev.branches.findIndex(b => b.label === r.strat.recommendation.branch);
console.log('  recommended index  : forward=' + idxOf(fwd) + '  reversed=' + idxOf(rev));
chk('the recommended index moves with the option, not the position',
  idxOf(fwd) !== idxOf(rev), 'both landed on index ' + idxOf(fwd));

/* ============================================================ INVARIANT 2 */
hr('2. BRANCH VERDICTS REQUIRE PERSONA EVIDENCE');
const g2 = fwd.g;
const okCheck = G.validate(g2);
chk('a properly evidenced graph validates', okCheck.ok, okCheck.errors.slice(0, 2).join(' / '));

// Strip the supporting utterances and the verdict must become illegal.
const stripped = JSON.parse(JSON.stringify(g2));
const branchIds = G.of(stripped, 'branch').map(b => b.id);
stripped.edges = stripped.edges.filter(e => !(branchIds.indexOf(e.to) !== -1 && e.rel === 'supports'));
const r2 = G.validate(stripped);
console.log('  verdicts kept, evidence removed -> rejected: ' + !r2.ok);
r2.errors.filter(e => /verdict must be measured/.test(e)).slice(0, 2)
  .forEach(e => console.log('    ! ' + e));
chk('a verdict without an evidential chain is rejected',
  !r2.ok && r2.errors.some(e => /verdict must be measured/.test(e)));

// A branch invented after the fact, with a plausible verdict, must not pass.
const forged = JSON.parse(JSON.stringify(g2));
forged.nodes.push({ id: 'bran_99', type: 'branch', label: 'Freemium tier',
                    verdict: 'go', why: 'Looks promising' });
const r2b = G.validate(forged);
console.log('  invented branch with a verdict   -> rejected: ' + !r2b.ok);
chk('a branch nobody evaluated cannot carry a verdict', !r2b.ok);

/* ============================================================ INVARIANT 3 */
hr('3. UNEVIDENCED BRANCHES CANNOT RECEIVE CONFIDENCE');
const unevidenced = JSON.parse(JSON.stringify(g2));
unevidenced.edges = unevidenced.edges.filter(
  e => !(branchIds.indexOf(e.to) !== -1 && e.rel === 'supports'));
G.of(unevidenced, 'branch').forEach(b => { b.verdict = null; b.why = null; });
const cleanCheck = G.validate(unevidenced);
chk('an unevaluated branch with no verdict is legal', cleanCheck.ok,
  cleanCheck.errors.slice(0, 2).join(' / '));

const evU = E.evidence(unevidenced);
console.log('  branches evaluated: ' + evU.branchesEvaluated);
evU.branches.forEach(b => console.log('    ' + b.label.padEnd(26) +
  'evaluated=' + String(b.evaluated).padEnd(7) + 'verdict=' + b.verdict +
  '  share=' + b.preferenceShare + '  ±pp=' + b.marginOfError));
chk('unevaluated branches report evaluated=false', evU.branches.every(b => b.evaluated === false));
chk('unevaluated branches carry no verdict', evU.branches.every(b => b.verdict === null));
chk('unevaluated branches carry no preference share',
  evU.branches.every(b => b.preferenceShare === null));
chk('unevaluated branches carry no margin of error',
  evU.branches.every(b => b.marginOfError === null));

// And the graph refuses to let one acquire a figure by assignment.
['confidence', 'positivePct', 'rank'].forEach(field => {
  const sneak = JSON.parse(JSON.stringify(unevidenced));
  G.of(sneak, 'branch')[0][field] = 0.9;
  chk('an unevaluated branch cannot carry "' + field + '"', !G.validate(sneak).ok);
});

/* ============================================================ INVARIANT 4 */
hr('4. THE STRATEGIST CANNOT RECOMMEND AN UNEVALUATED BRANCH');
const stratU = S.strategise(unevidenced, evU);
console.log('  recommendation.branch: ' + JSON.stringify(stratU.recommendation.branch));
console.log('  position: ' + stratU.position.text.slice(0, 150));
console.log('  first move: [' + (stratU.moves[0] || {}).kind + '] ' +
            ((stratU.moves[0] || {}).text || '').slice(0, 96));
chk('recommends nothing when nothing was evaluated', stratU.recommendation.branch === null);
chk('says plainly that no one was asked to choose',
  /no persona.*was asked|never put to/i.test(stratU.position.text), stratU.position.text.slice(0, 60));
chk('directs the user to a variant run', /variant/i.test(stratU.position.text));
chk('surfaces the unevaluated options as unknowns',
  stratU.unknowns.some(u => /never put to the panel/.test(u.text)));
chk('does not fabricate a kill move against an unassessed option',
  !stratU.moves.some(m => m.kind === 'kill'));
chk('its own verifier passes', S.verify(unevidenced, evU, stratU).ok,
  S.verify(unevidenced, evU, stratU).errors.slice(0, 2).join(' / '));

// Forcing a recommendation onto an unevaluated branch must be rejected.
const forcedRec = JSON.parse(JSON.stringify(stratU));
forcedRec.recommendation.branch = evU.branches[0].label;
const fr = S.verify(unevidenced, evU, forcedRec);
console.log('\n  forced recommendation -> rejected: ' + !fr.ok);
console.log('    ' + (fr.errors.find(e => /no persona evaluated/.test(e)) || ''));
chk('a forced recommendation on an unevaluated branch is rejected',
  !fr.ok && fr.errors.some(e => /no persona evaluated/.test(e)));

// And the view renders without claiming a verdict.
const memoU = V.decisionMemo(unevidenced, evU, stratU);
const auditU = V.auditView(memoU);
chk('the memo still audits with no branch verdicts', auditU.ok, auditU.errors.slice(0, 2).join(' / '));
chk('the memo header claims no verdict it cannot support',
  memoU.header.verdict.label !== undefined);

/* ============================================================ INVARIANT 5 */
hr('5. EVERY VERDICT-BEARING NODE TRACES BACK TO PERSONA UTTERANCES');
function auditChains(g, label) {
  const rows = [];
  G.of(g, 'branch').filter(b => b.verdict != null).forEach(b => {
    const u = G.traceToUtterances(g, b.id);
    rows.push({ kind: 'branch', id: b.id, name: b.label, n: u.length });
  });
  G.of(g, 'claim').filter(c => G.WARRANT[c.warrant].panelIsEvidence).forEach(c => {
    const u = G.traceToUtterances(g, c.id);
    rows.push({ kind: 'claim/' + c.warrant, id: c.id, name: c.text.slice(0, 40), n: u.length });
  });
  G.of(g, 'claim').filter(c => c.warrant === 'causal').forEach(c => {
    const u = G.traceToUtterances(g, c.id);
    rows.push({ kind: 'claim/causal', id: c.id, name: c.text.slice(0, 40), n: u.length });
  });
  G.of(g, 'objection').forEach(o => {
    rows.push({ kind: 'objection', id: o.id, name: o.category, n: G.traceToUtterances(g, o.id).length });
  });
  const orphans = rows.filter(r => r.n === 0);
  console.log('  ' + label.padEnd(22) + rows.length + ' verdict-bearing nodes, ' +
    orphans.length + ' with no chain to a persona');
  orphans.slice(0, 4).forEach(o => console.log('    ! ' + o.kind + ' ' + o.id + ' ' + o.name));
  return orphans.length;
}
let totalOrphans = 0;
[['fork question', fwd.g], ['reordered fork', rev.g],
 ['no fork', P.run(base('Is this worth building?'))],
 ['three options', P.run(base('Should we charge per clinic or per slot or per doctor?'))]
].forEach(([label, g]) => { totalOrphans += auditChains(g, label); });
chk('no verdict-bearing node is orphaned in any shape of study', totalOrphans === 0,
  String(totalOrphans));

// The single-option case must still be evidenced — by the idea-level responses.
const noFork = P.run(base('Is this worth building?'));
const evNF = E.evidence(noFork);
console.log('\n  no-fork study: ' + evNF.branches.length + ' branch, evaluated=' +
  evNF.branches[0].evaluated + ', verdict=' + evNF.branches[0].verdict +
  ', evidence=' + G.traceToUtterances(noFork, evNF.branches[0].id).length + ' utterances');
chk('a single-option study is evidenced by the idea-level responses',
  evNF.branches[0].evaluated === true && G.traceToUtterances(noFork, evNF.branches[0].id).length > 0);
chk('a single-option study still validates', G.validate(noFork).ok);

hr('SUMMARY');
console.log('passed: ' + pass + '   FAILED: ' + fail);
fails.forEach(f => console.log('  x ' + f));
