// Decision graph + evidence engine, against the BegFund dry-run panel (n=12).
// Every asserted figure is hand-checkable from the fixture table.
//
//   node test/research-graph.test.js

const { G, E, build } = require('./fixture-begfund');

let pass = 0, fail = 0; const fails = [];
const chk = (n, c, d) => c ? pass++ : (fail++, fails.push(n + (d ? ' — ' + d : '')));
const hr = t => console.log('\n' + '='.repeat(70) + '\n' + t + '\n' + '='.repeat(70));

const graph = build();
const R = graph.testRefs;

/* ------------------------------------------------------------- validation */
hr('VALIDATION');
const v = G.validate(graph);
console.log('valid: ' + v.ok);
v.errors.forEach(e => console.log('  ! ' + e));
chk('graph validates', v.ok, v.errors.join(' / '));

const clone = () => JSON.parse(JSON.stringify(graph));

// Safety property 1 — a panel is not evidence for a factual claim, so a
// factual claim must never carry confidence, however many personas agreed.
const bad1 = clone();
bad1.nodes.find(n => n.id === R.claimFactual).confidence = 0.9;
const r1 = G.validate(bad1);
console.log('\nfactual claim + confidence -> rejected: ' + !r1.ok);
console.log('  ' + (r1.errors.find(e => e.includes('factual')) || 'NOT CAUGHT'));
chk('factual claim cannot carry confidence',
  !r1.ok && r1.errors.some(e => e.includes('factual')));

// Safety property 2 — a causal chain is the model's theory. Untethered, it is
// invention rather than inference.
const bad2 = clone();
bad2.edges = bad2.edges.filter(e => e.rel !== 'derived_from');
const r2 = G.validate(bad2);
console.log('untethered causal claim -> rejected: ' + !r2.ok);
console.log('  ' + (r2.errors.find(e => e.includes('causal')) || 'NOT CAUGHT'));
chk('causal claim must be tethered', !r2.ok && r2.errors.some(e => e.includes('causal')));

const bad3 = clone();
bad3.edges.push({ from: 'nope_9', to: R.assumeTrust, rel: 'threatens', attested: false });
chk('dangling edge rejected', !G.validate(bad3).ok);

const bad4 = clone();
bad4.edges = bad4.edges.filter(e => !(e.to === R.claimPreference && e.rel === 'supports'));
chk('panel-evidence claim needs an utterance behind it', !G.validate(bad4).ok);

const bad5 = clone();
bad5.edges = bad5.edges.filter(e => !(e.from === R.expPilot && e.rel === 'resolves'));
chk('experiment resolving nothing rejected', !G.validate(bad5).ok);

/* --------------------------------------------------------------- evidence */
const ev = E.evidence(graph);

hr('PANEL STATS  (hand-check: 3 pos / 3 neu / 6 skp of 12, mean intent 2.7)');
console.log(JSON.stringify(ev.stats));
chk('n = 12', ev.stats.n === 12, String(ev.stats.n));
chk('positive = 25%', ev.stats.positive.pct === 25, String(ev.stats.positive.pct));
chk('mean intent = 2.7', ev.stats.meanIntent === 2.7, String(ev.stats.meanIntent));

hr('SAMPLING  (Agresti-Coull: 3-of-12 -> +/-22.7pp)');
console.log(JSON.stringify(ev.sampling));
chk('margin ~22.7pp', Math.abs(ev.sampling.marginOfError - 22.7) < 0.6, String(ev.sampling.marginOfError));
chk('uses a boundary-safe method', ev.sampling.method === 'agresti-coull');
// Wald would report +/-1.4pp for the 0-of-2 segment. Agresti-Coull must not.
const tiny = E.segments(graph).find(s => s.n === 2);
chk('0-of-2 segment gets an honest interval', tiny.marginOfError > 25, String(tiny.marginOfError));

hr('SEGMENTS  (hand-check: donors +25, NGO -25, compliance -25)');
console.log('segment'.padEnd(42) + 'n'.padEnd(4) + 'pos%'.padEnd(6) + 'vs'.padEnd(6) + 'intent'.padEnd(8) + '+/-pp');
ev.segments.forEach(s => console.log(s.name.slice(0, 40).padEnd(42) + String(s.n).padEnd(4) +
  (s.positivePct + '%').padEnd(6) + ((s.vsOverall >= 0 ? '+' : '') + s.vsOverall).padEnd(6) +
  String(s.meanIntent).padEnd(8) + s.marginOfError));
const ngo = ev.segments.find(s => s.id === R.segNGO);
chk('NGO segment scores BELOW overall', ngo && ngo.vsOverall < 0, ngo ? String(ngo.vsOverall) : 'missing');
chk('NGO segment is 0% positive', ngo && ngo.positivePct === 0);
chk('a signed negative delta exists', ev.segments.some(s => s.vsOverall < 0));

hr('POLARISATION  (hand-check: eta-squared ~0.57 -> splits)');
console.log(JSON.stringify(ev.polarisation, null, 1));
chk('eta-squared ~0.57', Math.abs(ev.polarisation.etaSquared - 0.57) < 0.05, String(ev.polarisation.etaSquared));
chk('detects a market split', ev.polarisation.splits === true);

hr('OBJECTION CLUSTERS  (categories rank; wording survives underneath)');
console.log('category'.padEnd(15) + 'n'.padEnd(4) + 'pct'.padEnd(6) + 'distinct'.padEnd(10) + 'concentrated in');
ev.objections.forEach(o => console.log(o.category.padEnd(15) + String(o.count).padEnd(4) +
  (o.pct + '%').padEnd(6) + String(o.distinctObjections).padEnd(10) + (o.concentratedIn || '-')));
const total = ev.objections.reduce((s, o) => s + o.pct, 0);
console.log('total: ' + total + '%');
chk('shares do not exceed 100%', total <= 100, total + '%');
chk('safeguarding is the largest block', ev.objections[0].category === 'safeguarding', ev.objections[0].category);
chk('safeguarding counts 4', ev.objections[0].count === 4, String(ev.objections[0].count));
chk('safeguarding concentrates in the NGO segment',
  /NGO/.test(ev.objections[0].concentratedIn || ''), String(ev.objections[0].concentratedIn));
chk('dignity and safeguarding both present',
  ev.objections.some(o => o.category === 'dignity') && ev.objections.some(o => o.category === 'safeguarding'));
chk('individual wording preserved under the cluster',
  ev.objections[0].objections.length === 4 && ev.objections[0].evidence.length > 0);

hr('LOAD-BEARING ASSUMPTIONS');
ev.assumptions.forEach(a => console.log('  [' + String(a.score).padStart(3) + '] ' + a.text +
  '\n        mass=' + a.threatenedMass + '%  verdictDependent=' + a.verdictDependent +
  '  needsExternal=' + a.needsExternalVerification));
chk('onboarding assumption ranks first', ev.assumptions[0].id === R.assumeOnboarding, ev.assumptions[0].text);
chk('its mass is 48%', ev.assumptions[0].threatenedMass === 48, String(ev.assumptions[0].threatenedMass));
chk('factual blocker detected', ev.assumptions[0].needsExternalVerification === true);

hr('LEVERAGE  (ceiling, never a forecast)');
ev.leverage.slice(0, 3).forEach(l => console.log('  ' + l.rank + '. ' + l.assumption +
  '\n     addressable ceiling: ' + l.addressableMass + '%  |  ' + l.whyItRanks));
chk('every entry marks itself a ceiling', ev.leverage.every(l => l.isCeilingNotForecast === true));
chk('no predicted lift anywhere',
  !JSON.stringify(ev.leverage).match(/expectedLift|predictedLift|forecast"/));

hr('CONFIDENCE  (explains itself; admits when credits will not help)');
console.log('level: ' + ev.confidence.level + '  (+/-' + ev.confidence.marginOfError + 'pp, n=' + ev.confidence.n + ')');
ev.confidence.reasons.forEach(r => console.log('  [' + r.term + '] ' + r.detail));
console.log('\nto raise confidence: ' + ev.confidence.raise.action);
console.log('more credits help: ' + ev.confidence.raise.moreCreditsHelp);
if (ev.confidence.raise.note) console.log('note: ' + ev.confidence.raise.note);
chk('confidence is low at n=12', ev.confidence.level === 'low', ev.confidence.level);
chk('warrant ceiling dominates', ev.confidence.raise.term === 'warrant', ev.confidence.raise.term);
chk('admits more credits will not help', ev.confidence.raise.moreCreditsHelp === false);
chk('gives at least 3 reasons', ev.confidence.reasons.length >= 3, String(ev.confidence.reasons.length));

hr('EXPERIMENTS, ranked by load removed');
ev.experiments.forEach(x => console.log('  [' + x.removesLoad + '] ' + x.text.slice(0, 64) +
  '\n       resolves: ' + x.resolves.join('; ')));
chk('top experiment targets the top assumption', ev.experiments[0].id === R.expPilot, ev.experiments[0].id);

hr('CLAIMS BY WARRANT');
Object.entries(ev.claims).forEach(([w, cs]) => {
  console.log(w + ' (' + G.WARRANT[w].label + ', panelIsEvidence=' + G.WARRANT[w].panelIsEvidence + ')');
  cs.forEach(c => console.log('   - ' + c.text + '  [attested by ' + c.attestedBy + ']'));
});
chk('factual claims kept separate', !!ev.claims.factual && ev.claims.factual.length === 1);
chk('factual claim carries no confidence', !('confidence' in ev.claims.factual[0]));
chk('causal claim records its derivation', ev.claims.causal[0].derivedFrom.length > 0);

hr('BRANCHES');
ev.branches.forEach(b => console.log('  ' + b.label + ': ' + b.verdict + '  (rests on: ' + b.restsOn.join('; ') + ')'));
chk('both branches verdicted', ev.branches.length === 2);
chk('branches carry different verdicts', new Set(ev.branches.map(b => b.verdict)).size === 2);

hr('CROSS-STUDY DOOR');
const keyed = graph.nodes.filter(n => n.key).length;
console.log('nodes with a stable cross-study key: ' + keyed + '/' + graph.nodes.length);
const b2 = G.create({ studyId: 'std_other', panelId: 'pnl_other' });
const sameObj = b2.objection({ text: 'Verification becomes your entire business', category: 'safeguarding' });
const origObj = graph.nodes.find(n => n.type === 'objection' && /entire business/.test(n.text));
console.log('same objection, different study -> same key: ' + (sameObj.key === origObj.key));
console.log('  ' + sameObj.key);
chk('identical content yields identical key across studies', sameObj.key === origObj.key);
chk('edges reference ids, never indices',
  graph.edges.every(e => typeof e.from === 'string' && typeof e.to === 'string'));

hr('SUMMARY');
console.log('passed: ' + pass + '   FAILED: ' + fail);
fails.forEach(f => console.log('  x ' + f));
console.log('\ngraph: ' + graph.nodes.length + ' nodes, ' + graph.edges.length + ' edges, schema v' + graph.schemaVersion);
