// Stress harness — ten unrelated startup ideas through the engine, measured
// against each other rather than judged individually.
//
// The question is not "is this a good memo". It is "do two unrelated studies
// come out too similar", and every check below is computed so the answer is a
// number rather than an impression.
//
//   node test/stress.js

const fs = require('fs');
const path = require('path');
const REPO = path.join(__dirname, '..');
global.window = global;
['research-graph', 'research-clusters', 'research-evidence', 'research-strategist',
 'research-views', 'research-panel', 'research-conversation']
  .forEach(f => eval(fs.readFileSync(path.join(REPO, 'js/' + f + '.js'), 'utf8')));
const G = window.RGraph, E = window.REvidence, S = window.RStrategist,
      V = window.RViews, P = window.RPanel, C = window.RConvo;

const hr = t => console.log('\n' + '='.repeat(76) + '\n' + t + '\n' + '='.repeat(76));
const pctOf = (a, b) => b ? Math.round(a / b * 100) : 0;

/* ------------------------------------------------------------------ batch */
const IDEAS = [
  { kind: 'B2B SaaS', title: 'Pinpoint',
    idea: 'API observability for small engineering teams. Traces every request, flags the ' +
          'slow endpoint before customers notice, and explains the cause in plain English.',
    decision_q: 'Should we price per seat or per traced request?',
    roles: ['Engineering Manager', 'Backend Engineer', 'CTO', 'DevOps Lead', 'Founder'] },

  { kind: 'Marketplace', title: 'HomePlate',
    idea: 'A marketplace connecting home cooks with office workers who want home-style lunch ' +
          'delivered daily. Cooks set their own menu and capacity; buyers subscribe weekly.',
    decision_q: 'Should we take a commission per order or charge cooks a flat monthly fee?',
    roles: ['Home Cook', 'Office Worker', 'Delivery Partner', 'Food Safety Officer', 'Investor'] },

  { kind: 'D2C product', title: 'Refill',
    idea: 'Refillable home cleaning products. Buy the bottle once, then order concentrate ' +
          'sachets that cost a fifth of a new bottle and ship in an envelope.',
    decision_q: 'Should we sell direct-to-consumer only or go into retail from launch?',
    roles: ['Household Buyer', 'Retail Buyer', 'Sustainability Lead', 'Logistics Manager', 'Investor'] },

  { kind: 'Regulated fintech', title: 'ShiftCredit',
    idea: 'A working-capital line for gig workers, underwritten on platform earnings history ' +
          'rather than credit score, repaid automatically from incoming payouts.',
    decision_q: 'Should we partner with an existing NBFC or apply for our own licence?',
    roles: ['Gig Worker', 'Risk Officer', 'Compliance Lead', 'Platform Partner', 'Investor'] },

  { kind: 'AI product', title: 'Clause',
    idea: 'AI contract review for small law firms. Flags unusual terms against a corpus of ' +
          'standard agreements and drafts the redline a junior associate would write.',
    decision_q: 'Should we charge per document reviewed or an unlimited monthly seat?',
    roles: ['Solo Practitioner', 'Managing Partner', 'Paralegal', 'General Counsel', 'Investor'] },

  { kind: 'Enterprise', title: 'Tierline',
    idea: 'Supply chain risk monitoring for mid-size manufacturers. Watches supplier financial ' +
          'health, port delays and single-source exposure, and warns before a line stops.',
    decision_q: 'Should we land bottom-up with plant managers or sell top-down to the COO?',
    roles: ['Plant Manager', 'COO', 'Procurement Lead', 'IT Director', 'CFO'] },

  { kind: 'Physical product', title: 'Coldbox',
    idea: 'Solar-powered cold storage units for smallholder farmers, sized for one acre of ' +
          'produce, that cut post-harvest loss on vegetables that currently spoil in transit.',
    decision_q: 'Should farmers buy the unit outright or lease it per season?',
    roles: ['Smallholder Farmer', 'Agri Cooperative Head', 'Rural Financier', 'Distributor', 'Agronomist'] },

  { kind: 'Local services', title: 'Coolhand',
    idea: 'On-demand air conditioning servicing in tier-2 cities. Book a technician in a ' +
          'two-hour window, transparent parts pricing, photo proof of work done.',
    decision_q: 'Should we employ technicians directly or aggregate independent ones?',
    roles: ['Homeowner', 'AC Technician', 'Building Manager', 'Parts Supplier', 'Operations Lead'] },

  { kind: 'Creator economy', title: 'Sabha',
    idea: 'A paid community platform for regional-language creators. Members pay monthly for ' +
          'closed discussion, live sessions and archives, in languages the big platforms ignore.',
    decision_q: 'Should we take a revenue share or charge creators a flat platform fee?',
    roles: ['Creator', 'Community Member', 'Brand Sponsor', 'Moderator', 'Investor'] },

  { kind: 'Social product', title: 'Quad',
    idea: 'An anonymous discussion app scoped to a single university campus. Verified by ' +
          'college email, posts expire in a week, no follower counts.',
    decision_q: 'Should posts be actively moderated or should the community self-govern?',
    roles: ['Student', 'Student Union Rep', 'University Administrator', 'Parent', 'Safety Researcher'] }
];

const N = 200;
const runs = IDEAS.map(spec => {
  const study = {
    id: 'std_' + spec.title.toLowerCase(),
    idea: spec.idea, decision_q: spec.decision_q,
    audience: { markets: ['India'], ages: ['18-24', '25-34', '35-44', '45-54'],
                roles: spec.roles, attitude: { skeptics: 45 } },
    mode: 'signal-plus', respondents: N
  };
  const graph = P.run(study);
  const ev = E.evidence(graph);
  const strat = S.strategise(graph, ev);
  return { spec, study, graph, ev, strat,
           memo: V.decisionMemo(graph, ev, strat),
           valid: G.validate(graph).ok,
           stratOk: S.verify(graph, ev, strat).ok,
           viewOk: V.auditView(V.decisionMemo(graph, ev, strat)).ok };
});

/* ------------------------------------------------------------- per-study */
hr('THE BATCH');
console.log('kind'.padEnd(18) + 'title'.padEnd(12) + 'pos%'.padEnd(6) + '±pp'.padEnd(7) +
            'conf'.padEnd(10) + 'eta2'.padEnd(7) + 'verdicts'.padEnd(22) + 'top objection');
runs.forEach(r => {
  const verdicts = r.ev.branches.map(b => b.verdict).join('/');
  console.log(
    r.spec.kind.padEnd(18) + r.spec.title.padEnd(12) +
    (r.ev.stats.positive.pct + '%').padEnd(6) +
    String(r.ev.sampling.marginOfError).padEnd(7) +
    r.ev.confidence.level.padEnd(10) +
    String(r.ev.polarisation.etaSquared).padEnd(7) +
    verdicts.padEnd(22) +
    (r.ev.objections[0] || {}).category);
});

hr('INTEGRITY  (does anything fail outright?)');
const bad = runs.filter(r => !r.valid || !r.stratOk || !r.viewOk);
console.log('graphs valid          : ' + runs.filter(r => r.valid).length + '/' + runs.length);
console.log('strategist verified   : ' + runs.filter(r => r.stratOk).length + '/' + runs.length);
console.log('view audits passed    : ' + runs.filter(r => r.viewOk).length + '/' + runs.length);
console.log('evidence bundles valid: ' + runs.filter(r => r.ev.valid).length + '/' + runs.length);
if (bad.length) bad.forEach(r => console.log('  ! ' + r.spec.title));

/* ------------------------------------------ FAILURE MODE 1: segment reuse */
hr('FAILURE MODE 1 — segment artefacts (do unrelated ideas share a roster?)');
const segSets = runs.map(r => r.ev.segments.map(s => s.name).sort().join(' | '));
const uniqueSegSets = new Set(segSets);
console.log('distinct segment sets across ' + runs.length + ' unrelated ideas: ' + uniqueSegSets.size);
console.log('segment names seen anywhere: ' +
  [...new Set([].concat.apply([], runs.map(r => r.ev.segments.map(s => s.name))))].join(', '));
const topSegs = runs.map(r => r.ev.segments[0].name);
const topTally = {};
topSegs.forEach(s => { topTally[s] = (topTally[s] || 0) + 1; });
console.log('\nstrongest segment, by study:');
Object.entries(topTally).sort((a, b) => b[1] - a[1])
  .forEach(([s, n]) => console.log('  ' + s.padEnd(46) + n + '/' + runs.length +
    (n > runs.length / 2 ? '   <-- dominates' : '')));
const zeroSegs = runs.map(r => r.ev.segments.filter(s => s.positivePct === 0).length);
console.log('\nsegments at exactly 0% positive, per study: ' + zeroSegs.join(', ') +
  '   (mean ' + (zeroSegs.reduce((a, b) => a + b, 0) / runs.length).toFixed(1) + ')');

/* -------------------------------------- FAILURE MODE 2: objection profile */
hr('FAILURE MODE 2 — objection convergence');
const CATS = [...new Set([].concat.apply([], runs.map(r => r.ev.objections.map(o => o.category))))];
const vec = (r) => CATS.map(c => { const o = r.ev.objections.find(x => x.category === c); return o ? o.pct : 0; });
const cos = (a, b) => {
  const dot = a.reduce((s, x, i) => s + x * b[i], 0);
  const na = Math.sqrt(a.reduce((s, x) => s + x * x, 0));
  const nb = Math.sqrt(b.reduce((s, x) => s + x * x, 0));
  return na && nb ? dot / (na * nb) : 0;
};
console.log('categories in play: ' + CATS.join(', '));
console.log('\npairwise objection-profile similarity (1.00 = identical shape):');
let sims = [];
for (let i = 0; i < runs.length; i++) {
  for (let j = i + 1; j < runs.length; j++) {
    sims.push({ a: runs[i].spec.title, b: runs[j].spec.title, s: cos(vec(runs[i]), vec(runs[j])) });
  }
}
sims.sort((x, y) => y.s - x.s);
console.log('  most alike : ' + sims[0].a + ' / ' + sims[0].b + '  ' + sims[0].s.toFixed(3));
console.log('  least alike: ' + sims[sims.length - 1].a + ' / ' + sims[sims.length - 1].b +
            '  ' + sims[sims.length - 1].s.toFixed(3));
console.log('  mean       : ' + (sims.reduce((s, x) => s + x.s, 0) / sims.length).toFixed(3));
console.log('  above 0.95 : ' + sims.filter(x => x.s > 0.95).length + '/' + sims.length + ' pairs');

/* ------------------------------------------ FAILURE MODE 3: text reuse */
hr('FAILURE MODE 3 — is the wording recycled?');
function pool(fn) {
  const all = [].concat.apply([], runs.map(fn));
  return { total: all.length, unique: new Set(all).size };
}
const objText = pool(r => G.of(r.graph, 'objection').map(o => o.text));
const assumeText = pool(r => r.ev.assumptions.map(a => a.text));
const expText = pool(r => r.ev.experiments.map(x => x.text));
const posText = pool(r => [r.strat.position.text]);
const quoteText = pool(r => G.of(r.graph, 'utterance').map(u => u.text));
[['objection wording', objText], ['assumptions', assumeText], ['experiments', expText],
 ['strategist positions', posText], ['persona utterances', quoteText]].forEach(([k, v]) => {
  console.log('  ' + k.padEnd(24) + v.unique + ' unique of ' + v.total +
    ' (' + pctOf(v.unique, v.total) + '% distinct)');
});

/* -------------------------------------- FAILURE MODE 4: recommendation collapse */
hr('FAILURE MODE 4 — recommendation collapse');
const recIdx = runs.map(r => r.ev.branches.findIndex(b => b.label === r.strat.recommendation.branch));
console.log('recommended branch index (0 = first option in the question, 1 = second):');
console.log('  ' + recIdx.join(', '));
const idxTally = {};
recIdx.forEach(i => { idxTally[i] = (idxTally[i] || 0) + 1; });
Object.entries(idxTally).forEach(([i, n]) => console.log('  index ' + i + ': ' + n + '/' + runs.length +
  (n === runs.length ? '   <-- ALWAYS the same position' : '')));
const moveKinds = runs.map(r => r.strat.moves.map(m => m.kind).join('>'));
console.log('\nmove sequences:');
const mvTally = {};
moveKinds.forEach(m => { mvTally[m] = (mvTally[m] || 0) + 1; });
Object.entries(mvTally).sort((a, b) => b[1] - a[1])
  .forEach(([m, n]) => console.log('  ' + m.padEnd(50) + n + '/' + runs.length));

/* ------------------------------------------- FAILURE MODE 5: idea blindness */
hr('FAILURE MODE 5 — does the IDEA change anything?');
// Hold audience and decision constant, swap only the idea text.
const CONTROL = { markets: ['India'], ages: ['25-34'], roles: ['Buyer'], attitude: { skeptics: 45 } };
const probes = [
  'A subscription box for artisanal cheese delivered monthly.',
  'An industrial welding robot for shipyard hull assembly.',
  'A meditation app for night-shift nurses.',
  'A B2B logistics exchange for refrigerated trucking.'
];
const probeRuns = probes.map(idea => {
  const g = P.run({ id: 'p', idea, decision_q: 'Should we sell monthly or annually?',
                    audience: CONTROL, respondents: 200 });
  return { idea, ev: E.evidence(g) };
});
console.log('same audience + same question, four unrelated ideas:');
console.log('  pos%  ±pp   eta2   top objection   idea');
probeRuns.forEach(p => console.log('  ' + (p.ev.stats.positive.pct + '%').padEnd(6) +
  String(p.ev.sampling.marginOfError).padEnd(6) + String(p.ev.polarisation.etaSquared).padEnd(7) +
  (p.ev.objections[0].category).padEnd(16) + p.idea.slice(0, 44)));
const probeVecs = probeRuns.map(p => CATS.map(c => {
  const o = p.ev.objections.find(x => x.category === c); return o ? o.pct : 0; }));
let probeSims = [];
for (let i = 0; i < probeVecs.length; i++)
  for (let j = i + 1; j < probeVecs.length; j++) probeSims.push(cos(probeVecs[i], probeVecs[j]));
console.log('\nmean objection-profile similarity between unrelated ideas: ' +
  (probeSims.reduce((a, b) => a + b, 0) / probeSims.length).toFixed(3));
const posSpread = Math.max.apply(null, probeRuns.map(p => p.ev.stats.positive.pct)) -
                  Math.min.apply(null, probeRuns.map(p => p.ev.stats.positive.pct));
console.log('positive-rate spread across unrelated ideas: ' + posSpread + 'pp');

/* ------------------------------------ FAILURE MODE 6: hallucinated certainty */
hr('FAILURE MODE 6 — hallucinated certainty');
let overclaim = 0, ceilingUnlabelled = 0, factualWithConf = 0;
runs.forEach(r => {
  if (r.strat.recommendation.confidence !== r.ev.confidence.level) overclaim++;
  r.ev.leverage.forEach(l => { if (l.isCeilingNotForecast !== true) ceilingUnlabelled++; });
  (r.ev.claims.factual || []).forEach(c => { if ('confidence' in c || 'pct' in c) factualWithConf++; });
});
console.log('strategist confidence != evidence confidence : ' + overclaim + '/' + runs.length);
console.log('leverage figures not labelled as a ceiling   : ' + ceilingUnlabelled);
console.log('factual claims carrying confidence           : ' + factualWithConf);
const noHelp = runs.filter(r => r.ev.confidence.raise.moreCreditsHelp === false).length;
console.log('studies that admit more credits will not help: ' + noHelp + '/' + runs.length);
const confDist = {};
runs.forEach(r => { confDist[r.ev.confidence.level] = (confDist[r.ev.confidence.level] || 0) + 1; });
console.log('confidence levels at n=' + N + ': ' + JSON.stringify(confDist));

/* -------------------------------------- FAILURE MODE 7: conversation routing */
hr('FAILURE MODE 7 — routing consistency across studies');
const QS = [['What was the biggest objection?', 'query'], ['What if we doubled pricing?', 'variant'],
            ['What about Gen Z?', 'panel'], ['Is this legal?', 'external'],
            ['What does the decision rest on?', 'query'], ['Who was most positive?', 'query']];
let routeErr = 0, refusalOk = 0;
QS.forEach(([q, want]) => {
  const got = runs.map(r => C.classify(q, r.graph, r.ev).op);
  const wrong = got.filter(o => o !== want).length;
  routeErr += wrong;
  console.log('  ' + (wrong ? 'BAD ' : 'ok  ') + want.padEnd(9) + q.padEnd(38) +
    (wrong ? wrong + ' of ' + runs.length + ' misrouted -> ' + [...new Set(got)].join(',') : 'all ' + runs.length));
});
runs.forEach(r => {
  const a = C.ask(r.graph, r.ev, 'How many respondents own a cat?');
  if (a.answeredFromGraph === false && a.nextStep) refusalOk++;
});
console.log('  refuses an unanswerable question: ' + refusalOk + '/' + runs.length);
let quoteLeak = 0;
runs.forEach(r => {
  const said = new Set(G.of(r.graph, 'utterance').map(u => u.text));
  const a = C.ask(r.graph, r.ev, 'What exactly did the objectors say?');
  (a.quotes || []).forEach(q => { if (!said.has(q)) quoteLeak++; });
});
console.log('  quotes attributed that nobody said: ' + quoteLeak);

/* ------------------------------------------- FAILURE MODE 8: branch detection */
hr('FAILURE MODE 8 — branch detection quality');
runs.forEach(r => {
  const b = P.detectBranches(r.spec.decision_q);
  console.log('  ' + (b ? 'ok  ' : 'MISS') + ' ' + r.spec.title.padEnd(12) +
    (b ? b.map(x => '"' + x + '"').join('  vs  ') : r.spec.decision_q));
});
const missed = runs.filter(r => !P.detectBranches(r.spec.decision_q)).length;
console.log('  forks detected: ' + (runs.length - missed) + '/' + runs.length);

/* ------------------------------------------------------------------ verdict */
hr('WHERE TWO UNRELATED STUDIES FEEL TOO SIMILAR');
const a = runs[0], b = runs[6];   // B2B SaaS vs physical product for farmers
console.log('Comparing "' + a.spec.title + '" (' + a.spec.kind + ') and "' +
            b.spec.title + '" (' + b.spec.kind + '):\n');
console.log('  segments      A: ' + a.ev.segments.map(s => s.name).join(', '));
console.log('                B: ' + b.ev.segments.map(s => s.name).join(', '));
console.log('  top objection A: ' + a.ev.objections[0].category + ' ' + a.ev.objections[0].pct + '%');
console.log('                B: ' + b.ev.objections[0].category + ' ' + b.ev.objections[0].pct + '%');
console.log('  assumption    A: ' + a.ev.assumptions[0].text);
console.log('                B: ' + b.ev.assumptions[0].text);
console.log('  experiment    A: ' + a.ev.experiments[0].text.slice(0, 68));
console.log('                B: ' + b.ev.experiments[0].text.slice(0, 68));
console.log('  position      A: ' + a.strat.position.text.slice(0, 96));
console.log('                B: ' + b.strat.position.text.slice(0, 96));
