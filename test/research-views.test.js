// Views: does the projection preserve the honesty rules the graph enforces?
//
// The graph and strategist guarantee structural honesty in the data. A view can
// still leak it back — by attaching a confidence figure to an unverified claim,
// by quoting a mass without calling it a ceiling, by hiding the counter-case.
// auditView() checks those properties, and these tests check auditView.
//
//   node test/research-views.test.js

const { G, E, S, V, build } = require('./fixture-begfund');

let pass = 0, fail = 0; const fails = [];
const chk = (n, c, d) => c ? pass++ : (fail++, fails.push(n + (d ? ' — ' + d : '')));
const hr = t => console.log('\n' + '='.repeat(70) + '\n' + t + '\n' + '='.repeat(70));

const graph = build();
const ev = E.evidence(graph);
const strat = S.strategise(graph, ev);
const memo = V.decisionMemo(graph, ev, strat);
const summary = V.executiveSummary(graph, ev, strat);
const convo = V.conversation(graph, ev, strat);

/* ------------------------------------------------------------------ header */
hr('HEADER');
console.log(JSON.stringify(memo.header, null, 1));
chk('leads with the split, not the mean', memo.header.leadWith === 'split', memo.header.leadWith);
chk('flags a non-robust verdict', memo.header.robust === false);
chk('carries a caution at low confidence', !!memo.header.caution);
chk('verdict is the recommended branch', memo.header.verdict.label === 'NGO-partnership first');

/* ---------------------------------------------------------------- sections */
hr('MEMO SECTIONS');
memo.sections.forEach(s => {
  console.log('[' + s.kind.padEnd(14) + '] ' + s.id.padEnd(13) + s.title +
              '  (' + s.blocks.length + ' block' + (s.blocks.length === 1 ? '' : 's') + ')');
});
const ids = memo.sections.map(s => s.id);
['decision', 'confidence', 'panel', 'objections', 'leverage', 'reasoning',
 'unknown', 'moves', 'experiments', 'voices'].forEach(id => {
  chk('has section: ' + id, ids.includes(id));
});
chk('every block kind is valid',
  memo.sections.every(s => s.blocks.every(b => V.KINDS.includes(b.kind))));
chk('reasoning section is tagged reasoning',
  memo.sections.find(s => s.id === 'reasoning').kind === 'reasoning');
chk('unknown section is tagged unknown',
  memo.sections.find(s => s.id === 'unknown').kind === 'unknown');

/* ----------------------------------------------------------- honesty rules */
hr('HONESTY RULES');
const audit = V.auditView(memo);
console.log('memo audit: ' + (audit.ok ? 'ok' : 'REJECTED'));
audit.errors.forEach(e => console.log('  ! ' + e));
chk('memo passes its own audit', audit.ok, audit.errors.join(' / '));
chk('summary passes its own audit', V.auditView(summary).ok, V.auditView(summary).errors.join(' / '));

const unknownSec = memo.sections.find(s => s.id === 'unknown');
const nv = unknownSec.blocks.find(b => b.type === 'needs-verification');
console.log('\nunverified claims rendered: ' + nv.claims.length);
nv.claims.forEach(c => console.log('  ? ' + c.text + '   (raised by ' + c.raisedBy + ')'));
console.log('disclaimer: ' + nv.disclaimer);
chk('unverified claims carry no confidence',
  nv.claims.every(c => !('confidence' in c) && !('pct' in c)));
chk('unverified claims carry a raised-by count instead',
  nv.claims.every(c => typeof c.raisedBy === 'number'));
chk('unverified section states a panel cannot settle these', /cannot settle/.test(nv.disclaimer));

const levBlock = memo.sections.find(s => s.id === 'leverage').blocks[0];
console.log('\nmass label: "' + levBlock.massLabel + '"');
chk('leverage label says ceiling not forecast', /ceiling, not a forecast/.test(levBlock.massLabel));
chk('every leverage row marks itself a ceiling',
  levBlock.rows.every(r => r.isCeilingNotForecast === true));

const decision = memo.sections.find(s => s.id === 'decision');
const against = decision.blocks.find(b => b.type === 'against');
console.log('\ncase against (' + against.items.length + ' items, alwaysVisible=' + against.alwaysVisible + '):');
against.items.forEach(i => console.log('  - ' + i.text.slice(0, 78)));
chk('case against is present', against.items.length > 0);
chk('case against cannot be collapsed away', against.alwaysVisible === true);

const conf = memo.sections.find(s => s.id === 'confidence');
const raise = conf.blocks.find(b => b.type === 'raise-confidence');
console.log('\nraise confidence: ' + raise.action);
console.log('offerUpgrade: ' + raise.offerUpgrade + '   (moreCreditsHelp: ' + raise.moreCreditsHelp + ')');
chk('does not offer an upgrade that would not help', raise.offerUpgrade === false);
chk('raise-confidence is tagged unknown when credits will not help', raise.kind === 'unknown');

/* --------------------------------------------------------------- segments */
hr('SEGMENTS IN VIEW  (signed deltas must survive projection)');
const segs = memo.sections.find(s => s.id === 'panel').blocks.find(b => b.type === 'segments').segments;
segs.forEach(s => console.log('  ' + s.name.slice(0, 40).padEnd(42) +
  (s.positivePct + '%').padEnd(6) + ((s.vsOverall >= 0 ? '+' : '') + s.vsOverall).padEnd(6) +
  'below=' + String(s.below).padEnd(6) + 'thin=' + s.thin));
chk('a below-average segment is marked', segs.some(s => s.below === true));
chk('thin segments are flagged', segs.some(s => s.thin === true));

const pol = memo.sections.find(s => s.id === 'panel').blocks[0];
chk('polarisation leads the panel section', pol.type === 'polarisation' && pol.prominent === true);

/* ----------------------------------------------------------------- voices */
hr('VOICES  (priors shown so the reader can judge the source)');
const voices = memo.sections.find(s => s.id === 'voices').blocks[0].voices;
voices.slice(0, 3).forEach(v => console.log('  "' + v.text.slice(0, 52) + '"\n    — ' +
  v.persona.role + ', ' + v.persona.age + ', ' + v.persona.market + ' · ' + v.intent + '/5' +
  '\n      worldview: ' + v.persona.worldview));
chk('voices carry persona worldview', voices.every(v => v.persona && v.persona.worldview));
chk('voices carry lived experience', voices.every(v => v.persona && v.persona.experience));
chk('voices attribute to a segment', voices.every(v => v.segment));

/* -------------------------------------------------------- executive summary */
hr('EXECUTIVE SUMMARY  (a compressed decision, not a compressed report)');
console.log('recommendation : ' + summary.recommendation.text);
console.log('key evidence   : ' + summary.keyEvidence.text);
console.log('load-bearing   : ' + summary.loadBearing.text +
            '  (ceiling ' + summary.loadBearing.addressableMass + '%)');
console.log('next action    : [' + summary.nextAction.moveKind + '] ' + summary.nextAction.text);
console.log('confidence     : ' + summary.confidence.level + ', limited by ' +
            summary.confidence.limitedBy + ', credits help: ' + summary.confidence.moreCreditsHelp);
console.log('biggest unknown: ' + summary.biggestUnknown.text.slice(0, 76));
chk('summary names a branch', !!summary.recommendation.branch);
chk('summary carries a next action', !!summary.nextAction);
chk('summary surfaces the biggest unknown', !!summary.biggestUnknown);
chk('biggest unknown is tagged unknown', summary.biggestUnknown.kind === 'unknown');
chk('summary confidence tagged unknown when credits will not help',
  summary.confidence.kind === 'unknown');
chk('summary ceiling is labelled', summary.loadBearing.isCeilingNotForecast === true);

/* ------------------------------------------------------------ conversation */
hr('CONVERSATION  (three operations, suggestions derived from the graph)');
Object.entries(convo.operations).forEach(([k, o]) =>
  console.log('  ' + k.padEnd(9) + o.label.padEnd(32) + 'newRun=' + String(o.requiresNewRun).padEnd(6) +
              'reusesPanel=' + o.reusesPanel));
console.log('\nsuggested:');
convo.suggestions.forEach(s => console.log('  [' + s.op.padEnd(7) + '] ' + s.text + '\n              ' + s.why));
chk('three distinct operations', Object.keys(convo.operations).length === 3);
chk('variant reuses the panel', convo.operations.variant.reusesPanel === true);
chk('new panel does not reuse it', convo.operations.panel.reusesPanel === false);
chk('suggestions are derived from findings, not generic',
  convo.suggestions.some(s => /safeguarding/.test(s.text) || /safeguarding/.test(s.why)));
chk('suggestions name a real segment',
  convo.suggestions.some(s => /NGO & frontline|Individual donors/.test(s.text)));
chk('at least one cheap query op', convo.suggestions.some(s => s.op === 'query' && !s.requiresNewRun));
chk('at least one paired variant op', convo.suggestions.some(s => s.op === 'variant' && s.reusesPanel));
chk('views declare no prices', !JSON.stringify(convo).match(/credits?["']?\s*:\s*\d/));

/* ---------------------------------------------- adversarial: audit must bite */
hr('ADVERSARIAL — auditView must reject each of these');
const clone = () => JSON.parse(JSON.stringify(memo));
function expectReject(name, mutate, needle) {
  const bad = clone(); mutate(bad);
  const r = V.auditView(bad);
  const caught = !r.ok && (!needle || r.errors.some(e => e.toLowerCase().includes(needle)));
  console.log((caught ? 'caught  ' : 'MISSED  ') + name);
  if (caught) console.log('        ' + r.errors.find(e => !needle || e.toLowerCase().includes(needle)));
  chk('rejects: ' + name, caught, r.errors.join(' / '));
}

expectReject('confidence attached to an unverified claim',
  m => { m.sections.find(s => s.id === 'unknown').blocks
           .find(b => b.type === 'needs-verification').claims[0].confidence = 0.8; },
  'confidence on an unverified');

expectReject('percentage attached to an unverified claim',
  m => { m.sections.find(s => s.id === 'unknown').blocks
           .find(b => b.type === 'needs-verification').claims[0].pct = 33; },
  'confidence on an unverified');

expectReject('leverage mass without the ceiling flag',
  m => { m.sections.find(s => s.id === 'leverage').blocks[0].rows[0].isCeilingNotForecast = false; },
  'ceiling');

expectReject('case against emptied',
  m => { m.sections.find(s => s.id === 'decision').blocks.find(b => b.type === 'against').items = []; },
  'against');

expectReject('position with no citation',
  m => { m.sections.find(s => s.id === 'decision').blocks.find(b => b.type === 'position').cites = []; },
  'cites nothing');

expectReject('unknown block kind',
  m => { m.sections[0].blocks[0].kind = 'vibes'; },
  'unknown kind');

expectReject('memo not marked traceable',
  m => { m.provenance.traceable = false; },
  'traceable');

/* ------------------------------------------------- rejected-generator trail */
hr('PROVENANCE');
console.log(JSON.stringify(memo.provenance, null, 1));
chk('records what produced the judgement', memo.provenance.producedBy === 'rules');
chk('records model provenance', !!memo.provenance.models.personaModel);

const liar = JSON.parse(JSON.stringify(strat));
liar.producedBy = 'claude-opus-5';
liar.recommendation.because[0].text += ' This will lift signups by 40%.';
const recovered = V.decisionMemo(graph, ev, S.strategise(graph, ev, liar));
console.log('\nafter a rejected generator: producedBy=' + recovered.provenance.producedBy +
            ', rejection recorded=' + !!recovered.provenance.rejectedGenerated);
chk('a rejected generator is recorded in provenance', !!recovered.provenance.rejectedGenerated);
chk('the memo still renders from the fallback', V.auditView(recovered).ok);

hr('SUMMARY');
console.log('passed: ' + pass + '   FAILED: ' + fail);
fails.forEach(f => console.log('  x ' + f));
