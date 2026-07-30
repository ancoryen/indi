// Panel generation: does a roster built from priors produce real structure?
//
// The old mock could not disagree — it rolled every persona against one global
// threshold, so demographically distinct people gave statistically identical
// answers. These tests check that divergence now comes from the roster itself,
// and that the whole chain (panel -> graph -> evidence -> strategist -> views)
// runs end to end on a study object.
//
//   node test/research-panel.test.js

const fs = require('fs');
const path = require('path');
const REPO = path.join(__dirname, '..');
global.window = global;
['research-graph', 'research-evidence', 'research-strategist', 'research-views', 'research-panel']
  .forEach(f => eval(fs.readFileSync(path.join(REPO, 'js/' + f + '.js'), 'utf8')));
const G = window.RGraph, E = window.REvidence, S = window.RStrategist,
      V = window.RViews, P = window.RPanel;

let pass = 0, fail = 0; const fails = [];
const chk = (n, c, d) => c ? pass++ : (fail++, fails.push(n + (d ? ' — ' + d : '')));
const hr = t => console.log('\n' + '='.repeat(70) + '\n' + t + '\n' + '='.repeat(70));

const STUDY = {
  id: 'std_begfund',
  idea: 'BegFund, a crowdfunding platform for homeless people and street performers. ' +
        'Donors browse verified profiles, read stories, see goals and contribute digitally ' +
        'instead of giving cash on the street.',
  decision_q: 'Should we launch as a direct-to-beneficiary crowdfunding platform or ' +
              'partner exclusively with registered NGOs to verify beneficiary profiles?',
  audience: {
    markets: ['India'], ages: ['18-24', '25-34', '35-44', '45-54'],
    roles: ['Donor', 'NGO Director', 'Compliance Lead', 'Outreach Worker', 'Investor'],
    attitude: { tech: 50, skeptics: 45, pushback: 6 }
  },
  mode: 'signal-plus',
  respondents: 200
};

/* ------------------------------------------------------------------ roster */
hr('ROSTER  (attributes assigned, so segments are computable)');
const personas = P.roster(STUDY.audience, 200, STUDY.idea + STUDY.decision_q);
const bySeg = {};
personas.forEach(p => { bySeg[p.segment] = (bySeg[p.segment] || 0) + 1; });
Object.entries(bySeg).sort((a, b) => b[1] - a[1])
  .forEach(([s, n]) => console.log('  ' + s.padEnd(30) + n));
chk('roster is the requested size', personas.length === 200, String(personas.length));
chk('multiple segments represented', Object.keys(bySeg).length >= 4, String(Object.keys(bySeg).length));
chk('every persona has a worldview', personas.every(p => p.worldview && p.worldview.length > 10));
chk('every persona has an incentive', personas.every(p => p.incentive));
chk('every persona has a bias', personas.every(p => p.bias));
chk('every persona has lived experience', personas.every(p => p.experience));
chk('risk tolerance is set', personas.every(p => p.riskTolerance >= 1 && p.riskTolerance <= 5));
chk('priors vary within a role',
  new Set(personas.filter(p => p.role === personas[0].role).map(p => p.worldview)).size > 1);

// The falsy-zero trap the old engine had: `|| 40` meant a slider set to 0 was
// silently read as 40.
const allSceptic = P.roster(Object.assign({}, STUDY.audience,
  { attitude: { skeptics: 100 } }), 120, 'x');
const noSceptic = P.roster(Object.assign({}, STUDY.audience,
  { attitude: { skeptics: 0 } }), 120, 'x');
const share = (rs, id) => rs.filter(p => p.archetype === id).length / rs.length;
console.log('\nskeptics=100 -> hard sceptics ' + Math.round(share(allSceptic, 'sceptic') * 100) + '%' +
            ', early adopters ' + Math.round(share(allSceptic, 'early-adopter') * 100) + '%');
console.log('skeptics=0   -> hard sceptics ' + Math.round(share(noSceptic, 'sceptic') * 100) + '%' +
            ', early adopters ' + Math.round(share(noSceptic, 'early-adopter') * 100) + '%');
chk('skepticism setting shifts the mix',
  share(allSceptic, 'sceptic') > share(noSceptic, 'sceptic'));
chk('skeptics=0 is honoured, not coerced to a default',
  share(noSceptic, 'early-adopter') > share(allSceptic, 'early-adopter'));

/* -------------------------------------------------- prior-driven divergence */
hr('DIVERGENCE  (does the mix of priors move the answer?)');
const responses = personas.map((p, i) => P.respond(p, STUDY, i));
const meanBy = {};
personas.forEach((p, i) => {
  (meanBy[p.archetype] = meanBy[p.archetype] || []).push(responses[i].intent);
});
Object.entries(meanBy).sort((a, b) =>
  (b[1].reduce((x, y) => x + y, 0) / b[1].length) - (a[1].reduce((x, y) => x + y, 0) / a[1].length)
).forEach(([a, xs]) => console.log('  ' + a.padEnd(16) + 'n=' + String(xs.length).padEnd(5) +
  'mean intent ' + (xs.reduce((x, y) => x + y, 0) / xs.length).toFixed(2)));
const means = Object.values(meanBy).map(xs => xs.reduce((x, y) => x + y, 0) / xs.length);
chk('archetypes differ in mean intent', Math.max.apply(null, means) - Math.min.apply(null, means) > 1.0,
  (Math.max.apply(null, means) - Math.min.apply(null, means)).toFixed(2));

const catBy = {};
personas.forEach((p, i) => {
  catBy[p.archetype] = catBy[p.archetype] || new Set();
  catBy[p.archetype].add(responses[i].category);
});
console.log('\nwhat each archetype notices first:');
Object.entries(catBy).forEach(([a, s]) => console.log('  ' + a.padEnd(16) + [...s].join(', ')));
chk('priors shape WHICH objection is raised, not just how warmly',
  new Set([].concat.apply([], Object.values(catBy).map(s => [...s]))).size >= 4);
chk('gatekeepers and early adopters object differently',
  [...(catBy['gatekeeper'] || [])].join() !== [...(catBy['early-adopter'] || [])].join());

/* ---------------------------------------------------------------- branches */
hr('BRANCH DETECTION  (answer the question asked)');
const cases = [
  ['Should we launch direct-to-consumer or partner with retailers?', 2],
  ['Should we charge monthly or per use?', 2],
  ['Do we build it ourselves versus buying an existing tool?', 2],
  ['Is this a good idea?', 0],
  ['Should we launch?', 0]
];
cases.forEach(([q, want]) => {
  const got = P.detectBranches(q);
  console.log('  ' + (got ? got.join('  |  ') : '(no fork)').slice(0, 62).padEnd(64) + '<- ' + q.slice(0, 40));
  chk('branch detection: ' + q.slice(0, 34), (got ? got.length : 0) === want);
});

/* ------------------------------------------------------- end-to-end on run */
hr('END TO END  (study -> graph -> evidence -> strategist -> views)');
const graph = P.run(STUDY);
const val = G.validate(graph);
console.log('graph: ' + graph.nodes.length + ' nodes, ' + graph.edges.length + ' edges');
console.log('valid: ' + val.ok);
val.errors.slice(0, 5).forEach(e => console.log('  ! ' + e));
chk('generated graph validates', val.ok, val.errors.slice(0, 3).join(' / '));

const ev = E.evidence(graph);
console.log('\nn=' + ev.stats.n + '  positive=' + ev.stats.positive.pct + '%  mean intent=' +
            ev.stats.meanIntent + '  +/-' + ev.sampling.marginOfError + 'pp');
console.log('polarisation: eta2=' + ev.polarisation.etaSquared + ' splits=' + ev.polarisation.splits);
console.log('segments:');
ev.segments.forEach(s => console.log('  ' + s.name.padEnd(30) + 'n=' + String(s.n).padEnd(5) +
  s.positivePct + '%  ' + (s.vsOverall >= 0 ? '+' : '') + s.vsOverall));
console.log('objections:');
ev.objections.forEach(o => console.log('  ' + o.category.padEnd(14) + o.count + '  ' + o.pct + '%' +
  (o.concentratedIn ? '  (' + o.concentratedIn + ')' : '')));
chk('evidence bundle is valid', ev.valid, (ev.errors || []).slice(0, 3).join(' / '));
chk('at 200 respondents the margin tightens below 10pp', ev.sampling.marginOfError < 10,
  String(ev.sampling.marginOfError));
chk('a segment scores below the overall rate', ev.segments.some(s => s.vsOverall < 0));
chk('polarisation is measured from the roster', typeof ev.polarisation.etaSquared === 'number');
chk('objections cluster into categories', ev.objections.length >= 3 && ev.objections[0].count > 1);
chk('assumptions carry load', ev.assumptions.length > 0 && ev.assumptions[0].threatenedMass > 0);
chk('an assumption needs external verification',
  ev.assumptions.some(a => a.needsExternalVerification));
chk('branches were verdicted', ev.branches.length === 2, String(ev.branches.length));

const strat = S.strategise(graph, ev);
const sv = S.verify(graph, ev, strat);
console.log('\nstrategist: ' + strat.producedBy + ', verified=' + sv.ok);
sv.errors.slice(0, 5).forEach(e => console.log('  ! ' + e));
console.log('position: ' + strat.position.text);
console.log('recommends: ' + strat.recommendation.branch + '  (confidence ' + strat.recommendation.confidence + ')');
strat.moves.forEach(m => console.log('  ' + m.rank + '. [' + m.kind + '] ' + m.text.slice(0, 66)));
chk('strategist output verifies on generated data', sv.ok, sv.errors.slice(0, 3).join(' / '));
chk('recommends one of the detected branches',
  ev.branches.some(b => b.label === strat.recommendation.branch));
chk('shows a case against', strat.recommendation.against.length > 0);

const memo = V.decisionMemo(graph, ev, strat);
const va = V.auditView(memo);
console.log('\nmemo: ' + memo.sections.length + ' sections, audit=' + va.ok + ', leadWith=' + memo.header.leadWith);
va.errors.slice(0, 5).forEach(e => console.log('  ! ' + e));
chk('memo passes audit on generated data', va.ok, va.errors.slice(0, 3).join(' / '));
chk('executive summary passes audit', V.auditView(V.executiveSummary(graph, ev, strat)).ok);
chk('conversation offers three operations',
  Object.keys(V.conversation(graph, ev, strat).operations).length === 3);

/* --------------------------------------------------------------- stability */
hr('STABILITY  (deterministic until real inference arrives)');
const g2 = P.run(STUDY);
const strip = (g) => JSON.stringify({ nodes: g.nodes, edges: g.edges });
chk('same study yields the same graph', strip(graph) === strip(g2));
const g3 = P.run(Object.assign({}, STUDY, { respondents: 50 }));
console.log('n=50  -> +/-' + E.samplingError(g3).marginOfError + 'pp');
console.log('n=200 -> +/-' + E.samplingError(graph).marginOfError + 'pp');
chk('a bigger panel tightens the interval',
  E.samplingError(g3).marginOfError > E.samplingError(graph).marginOfError);

/* ------------------------------------------------- mode ladder is now real */
hr('THE LADDER  (does paying more buy anything measurable?)');
console.log('mode         n     +/-pp   confidence   segments   objection cats');
[['quick-pulse', 50], ['pulse-plus', 100], ['signal-plus', 200], ['prism', 400]].forEach(([mode, n]) => {
  const g = P.run(Object.assign({}, STUDY, { mode, respondents: n }));
  const e = E.evidence(g);
  console.log('  ' + mode.padEnd(13) + String(n).padEnd(6) + String(e.sampling.marginOfError).padEnd(8) +
    e.confidence.level.padEnd(13) + String(e.segments.length).padEnd(11) + e.objections.length);
});
const mQuick = E.samplingError(P.run(Object.assign({}, STUDY, { respondents: 50 }))).marginOfError;
const mPrism = E.samplingError(P.run(Object.assign({}, STUDY, { respondents: 400 }))).marginOfError;
console.log('\nquick-pulse ' + mQuick + 'pp vs prism ' + mPrism + 'pp — ' +
            (mQuick / mPrism).toFixed(1) + 'x tighter');
chk('the tier ladder buys real precision', mQuick / mPrism > 2, (mQuick / mPrism).toFixed(2));

hr('SUMMARY');
console.log('passed: ' + pass + '   FAILED: ' + fail);
fails.forEach(f => console.log('  x ' + f));

/* ------------------------------------------------- regression: mass sanity */
hr('MASS SANITY  (a share can never exceed 100%)');
[50, 200, 400].forEach(n => {
  const g = P.run(Object.assign({}, STUDY, { respondents: n }));
  const e = E.evidence(g);
  const worst = Math.max.apply(null, e.assumptions.map(a => a.threatenedMass).concat([0]));
  const objTotal = e.objections.reduce((s, o) => s + o.pct, 0);
  const dupes = {};
  let dupCount = 0;
  g.edges.forEach(x => { const k = x.from + x.to + x.rel; if (dupes[k]) dupCount++; else dupes[k] = 1; });
  console.log('  n=' + String(n).padEnd(5) + 'edges=' + String(g.edges.length).padEnd(7) +
    'dup edges=' + String(dupCount).padEnd(6) + 'max assumption mass=' + worst + '%' +
    '  objection total=' + objTotal + '%');
  chk('n=' + n + ': no duplicate edges', dupCount === 0, String(dupCount));
  chk('n=' + n + ': assumption mass <= 100%', worst <= 100, worst + '%');
  chk('n=' + n + ': objection shares total exactly 100%', objTotal === 100, objTotal + '%');
  chk('n=' + n + ': leverage ceiling <= 100%',
    e.leverage.every(l => l.addressableMass <= 100),
    String(Math.max.apply(null, e.leverage.map(l => l.addressableMass))));
});

hr('FINAL');
console.log('passed: ' + pass + '   FAILED: ' + fail);
fails.forEach(f => console.log('  x ' + f));

/* ------------------------------------- regression: every respondent counted */
hr('ROSTER INTEGRITY  (segment counts must reconcile with n)');
[50, 200, 400].forEach(n => {
  const g = P.run(Object.assign({}, STUDY, { respondents: n }));
  const e = E.evidence(g);
  const personaNodes = G.of(g, 'persona').length;
  const segTotal = e.segments.reduce((s, x) => s + x.n, 0);
  console.log('  requested=' + String(n).padEnd(5) + 'persona nodes=' + String(personaNodes).padEnd(6) +
    'utterances=' + String(e.stats.n).padEnd(6) + 'sum of segment n=' + segTotal);
  chk('n=' + n + ': one persona node per respondent', personaNodes === n, String(personaNodes));
  chk('n=' + n + ': segment counts sum to n', segTotal === n, segTotal + ' vs ' + n);
  chk('n=' + n + ': utterances equal n', e.stats.n === n, String(e.stats.n));
});

hr('DONE');
console.log('passed: ' + pass + '   FAILED: ' + fail);
fails.forEach(f => console.log('  x ' + f));
