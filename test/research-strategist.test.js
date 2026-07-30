// Strategist layer: does it produce judgement, and can it be caught lying?
//
// The point of these tests is not that the rules baseline gives good advice.
// It is that the verifier rejects any strategist — rules or model — that
// fabricates a quantity, upgrades its own confidence, cites a node that does
// not exist, or advocates without showing the case against.
//
//   node test/research-strategist.test.js

const { G, E, S, build } = require('./fixture-begfund');

let pass = 0, fail = 0; const fails = [];
const chk = (n, c, d) => c ? pass++ : (fail++, fails.push(n + (d ? ' — ' + d : '')));
const hr = t => console.log('\n' + '='.repeat(70) + '\n' + t + '\n' + '='.repeat(70));

const graph = build();
const ev = E.evidence(graph);
const strat = S.strategise(graph, ev);

/* ------------------------------------------------------- the output itself */
hr('STRATEGIST OUTPUT (rules baseline, no API key)');
console.log('produced by: ' + strat.producedBy + '   traceable: ' + strat.traceable);
console.log('\nPOSITION\n  ' + strat.position.text + '\n  cites: ' + strat.position.cites.join(', '));

console.log('\nRECOMMENDATION: ' + strat.recommendation.branch +
            '   (confidence: ' + strat.recommendation.confidence + ')');
console.log('  because:');
strat.recommendation.because.forEach(r => console.log('   + ' + r.text + '\n     [' + r.cites.join(', ') + ']'));
console.log('  against:');
strat.recommendation.against.forEach(r => console.log('   - ' + r.text + '\n     [' + r.cites.join(', ') + ']'));

console.log('\nMOVES');
strat.moves.forEach(m => console.log('  ' + m.rank + '. [' + m.kind.toUpperCase() + '] ' + m.text +
  (m.addressableMass != null ? '\n     ceiling: ' + m.addressableMass + '% (not a forecast)' : '')));

if (strat.oneWeek) console.log('\nONE WEEK\n  ' + strat.oneWeek.text);
console.log('\nIGNORE FOR NOW');
strat.ignoreForNow.forEach(x => console.log('  - ' + x.text + ' — ' + x.why));
console.log('\nUNKNOWNS');
strat.unknowns.forEach(x => console.log('  ? ' + x.text));

/* ------------------------------------------------------------ shape checks */
hr('SHAPE');
const v = S.verify(graph, ev, strat);
console.log('verifier: ' + (v.ok ? 'ok' : 'REJECTED'));
v.errors.forEach(e => console.log('  ! ' + e));
chk('rules baseline passes its own verifier', v.ok, v.errors.join(' / '));
chk('recommends a real branch', !!strat.recommendation.branch);
chk('recommends the non-rejected branch',
  strat.recommendation.branch === 'NGO-partnership first', strat.recommendation.branch);
chk('inherits evidence confidence', strat.recommendation.confidence === ev.confidence.level);
chk('shows the case against', strat.recommendation.against.length > 0);
chk('produces a kill move', strat.moves.some(m => m.kind === 'kill'));
chk('produces a validate move', strat.moves.some(m => m.kind === 'validate'));
chk('produces a double_down move', strat.moves.some(m => m.kind === 'double_down'));
chk('produces an ignore move', strat.moves.some(m => m.kind === 'ignore'));
chk('answers the one-week question', !!strat.oneWeek);
chk('surfaces unresolvable unknowns', strat.unknowns.length > 0);
chk('every judgement cites something',
  [strat.position].concat(strat.recommendation.because, strat.recommendation.against, strat.moves)
    .every(x => x.cites && x.cites.length));

/* ------------------------------------------------- can it be caught lying? */
hr('ADVERSARIAL — the verifier must reject each of these');

const clone = () => JSON.parse(JSON.stringify(strat));
function expectReject(name, mutate, needle) {
  const bad = clone();
  mutate(bad);
  const r = S.verify(graph, ev, bad);
  const caught = !r.ok && (!needle || r.errors.some(e => e.toLowerCase().includes(needle)));
  console.log((caught ? 'caught  ' : 'MISSED  ') + name);
  if (caught) console.log('        ' + r.errors.find(e => !needle || e.toLowerCase().includes(needle)));
  chk('rejects: ' + name, caught, r.errors.join(' / '));
}

// The headline risk: a plausible-looking predicted lift.
expectReject('fabricated lift ("+18pp")',
  b => { b.recommendation.because[0].text += ' Fixing this should lift intent by 18pp.'; },
  'fabricated');

expectReject('fabricated share ("62% of donors")',
  b => { b.position.text += ' Around 62% of donors would convert.'; },
  'fabricated');

expectReject('confidence upgraded to high',
  b => { b.recommendation.confidence = 'high'; },
  'cannot grant itself');

expectReject('case against removed',
  b => { b.recommendation.against = []; },
  'against');

expectReject('cites a node that does not exist',
  b => { b.position.cites = ['assu_99']; },
  'unknown node');

expectReject('judgement with no citation',
  b => { b.recommendation.because[0].cites = []; },
  'cites nothing');

expectReject('recommends a branch not in evidence',
  b => { b.recommendation.branch = 'Franchise model'; },
  'not in the evidence');

expectReject('inflates a quoted addressable mass',
  b => { const m = b.moves.find(x => x.addressableMass != null); m.addressableMass = 90; },
  'addressablemass');

expectReject('quotes a mass without marking it a ceiling',
  b => { const m = b.moves.find(x => x.addressableMass != null); m.isCeilingNotForecast = false; },
  'ceiling');

expectReject('unknown move kind',
  b => { b.moves[0].kind = 'launch'; },
  'unknown kind');

/* -------------------------------------- numbers already in evidence are ok */
hr('NOT OVER-EAGER — real figures must pass');
const good = clone();
good.position.text += ' Segment membership explains 57% of the variance, and the margin is 22.7pp.';
const gr = S.verify(graph, ev, good);
console.log('quoting 57% and 22.7pp (both computed): ' + (gr.ok ? 'accepted' : 'REJECTED'));
gr.errors.forEach(e => console.log('  ! ' + e));
chk('accepts quantities that are genuinely in the evidence', gr.ok, gr.errors.join(' / '));

const ords = clone();
ords.position.text += ' There are 3 segments and 2 branches.';
chk('does not trip on small ordinals', S.verify(graph, ev, ords).ok);

/* ------------------------------------------------------- fallback behaviour */
hr('FALLBACK — a lying generator is discarded, not shipped');
const liar = clone();
liar.producedBy = 'claude-opus-5';
liar.recommendation.because[0].text += ' This will increase signups by 40%.';
const out = S.strategise(graph, ev, liar);
console.log('generated output rejected: ' + !!out.rejectedGenerated);
console.log('fell back to: ' + out.producedBy);
if (out.rejectedGenerated) out.rejectedGenerated.errors.forEach(e => console.log('  ! ' + e));
chk('rejects a fabricating generator', !!out.rejectedGenerated);
chk('falls back to the rules baseline', out.producedBy === 'rules');
chk('fallback is still traceable', out.traceable === true);
chk('fallback itself verifies', S.verify(graph, ev, out).ok);

const honest = clone();
honest.producedBy = 'claude-opus-5';
const kept = S.strategise(graph, ev, honest);
chk('keeps a compliant generator', kept.producedBy === 'claude-opus-5' && !kept.rejectedGenerated);

/* ---------------------------------------------------------------- contract */
hr('LLM CONTRACT — the model only ever sees the evidence bundle');
const req = S.requestFor(graph, ev);
console.log('keys sent: ' + Object.keys(req).join(', '));
console.log('rules given to the model:');
req.rules.forEach(r => console.log('  - ' + r));
const sent = JSON.stringify(req);
chk('contract carries the evidence bundle', !!req.evidence && !!req.evidence.confidence);
chk('contract does NOT leak raw graph nodes', !req.nodes && !req.graph);
chk('contract pins confidence to the evidence level', req.outputShape.recommendation.confidence === ev.confidence.level);
chk('contract forbids prediction', req.rules.some(r => /predict/i.test(r)));
chk('worldview priors never reach the strategist', !/Tips buskers by UPI/.test(sent));

hr('SUMMARY');
console.log('passed: ' + pass + '   FAILED: ' + fail);
fails.forEach(f => console.log('  x ' + f));
