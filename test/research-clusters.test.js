// Response clustering, severity, substitutes, flip conditions and the
// pre-flight — the capabilities added after the Benki comparison.
//
// Most of these are guards against a specific failure that has already
// happened once, in this engine, and the comment says which.
//
//   node test/research-clusters.test.js

const fs = require('fs');
const path = require('path');
const REPO = path.join(__dirname, '..');

global.window = global;
['research-graph', 'research-clusters', 'research-evidence', 'research-panel',
 'research-strategist', 'research-views', 'research-preview']
  .forEach(f => eval(fs.readFileSync(path.join(REPO, 'js/' + f + '.js'), 'utf8')));

const G = window.RGraph, C = window.RClusters, E = window.REvidence,
      P = window.RPanel, S = window.RStrategist, V = window.RViews, PV = window.RPreview;

let pass = 0, fail = 0; const fails = [];
const chk = (n, c, d) => c ? pass++ : (fail++, fails.push(n + (d ? ' — ' + d : '')));
const hr = t => console.log('\n' + '='.repeat(70) + '\n' + t + '\n' + '='.repeat(70));

const AUD = { markets: ['India'], ages: ['25-34', '35-44'], roles: ['Founder', 'Buyer'],
              attitude: { skeptics: 45 } };
const study = (idea, q, n) => ({ id: 's', idea, decision_q: q, audience: AUD,
                                 mode: 'signal-plus', respondents: n || 200 });
const run = (idea, q, n) => P.run(study(idea, q, n));

const BASE = run('A refillable cleaning product line sold direct to households.',
                 'Should we sell direct-to-consumer only or go into retail from launch?');
const EV = E.evidence(BASE);

/* ==================================================== clustering behaviour */
hr('RESPONSE CLUSTERING');
console.log('k=' + EV.clustering.k + '  separation=' + EV.clustering.separation +
            '  method=' + EV.clustering.method);
EV.segments.forEach(s => console.log('  n=' + String(s.n).padStart(3) + '  ' +
  String(s.positivePct + '%').padStart(5) + '  ' + s.name));

chk('graph validates', G.validate(BASE).ok, G.validate(BASE).errors.join(' / '));
chk('every respondent lands in exactly one group',
  EV.segments.reduce((a, s) => a + s.n, 0) === EV.stats.n,
  EV.segments.reduce((a, s) => a + s.n, 0) + ' vs ' + EV.stats.n);
chk('no group is a single person', EV.segments.every(s => s.n >= C.MIN_CLUSTER));
chk('separation is reported', typeof EV.clustering.separation === 'number');
chk('each group says what defines it', EV.segments.every(s => !!s.definedBy));
chk('each group says who is in it', EV.segments.every(s => (s.archetypeMix || []).length));

// Determinism. Clusters that reshuffle between reads would make the memo
// disagree with itself, so seeding is farthest-first over a stable order
// rather than random.
const again = E.evidence(run('A refillable cleaning product line sold direct to households.',
                             'Should we sell direct-to-consumer only or go into retail from launch?'));
chk('clustering is deterministic',
  JSON.stringify(again.segments.map(s => [s.name, s.n])) ===
  JSON.stringify(EV.segments.map(s => [s.name, s.n])));

/* ---- the artefact this whole layer exists to remove ---- */
// Before: six assigned archetypes, identical in every study ever run, with
// "Early adopters" strongest in 10 of 10 unrelated ideas. That is a result
// about our roster code, not about any market.
hr('CROSS-STUDY VARIETY  (the stress-batch artefact)');
const IDEAS = [
  ['A marketplace for freelance welders', 'Should we charge a subscription or take commission?'],
  ['An app that teaches children to code', 'Should we sell to schools or to parents?'],
  ['A same-day medicine delivery service', 'Should we own the pharmacies or partner with them?'],
  ['A carbon accounting tool for small factories', 'Should we start in India or in the EU?'],
  ['A resale platform for designer furniture', 'Should we hold inventory or run consignment?']
];
const seen = {};
const perStudy = IDEAS.map(([i, q]) => {
  const e = E.evidence(run(i, q, 150));
  const names = e.segments.map(s => s.name);
  names.forEach(n => { seen[n] = (seen[n] || 0) + 1; });
  console.log('  ' + i.slice(0, 36).padEnd(38) + 'k=' + e.clustering.k + '  ' + names.length + ' groups');
  return names;
});
const universal = Object.entries(seen).filter(([, c]) => c === IDEAS.length).map(([n]) => n);
console.log('  distinct names across ' + IDEAS.length + ' studies: ' + Object.keys(seen).length);
console.log('  present in every study: ' + (universal.join(', ') || '(none)'));
chk('unrelated studies do not all return the same groups', universal.length === 0,
  universal.join(', '));
chk('more distinct groups than any single study produces',
  Object.keys(seen).length > Math.max.apply(null, perStudy.map(p => p.length)));

/* ---- circularity guards ----
   Two findings in this engine were tautologies before they were caught, and
   both have the same shape: a quantity used to BUILD a grouping, then reported
   as something the grouping revealed. */
hr('CIRCULARITY GUARDS');

// (1) Branch preference must not be a clustering feature. When it was, k-means
// split the panel along the fork and the memo announced "this group prefers B"
// as a discovery about a group defined by preferring B.
const featureLen = C.featurise(BASE)[0].vector.length;
const expected = 2 + G.OBJECTION_CATEGORIES.length + Object.keys(G.SUBSTITUTE_KINDS).length;
chk('branch preference is not a clustering feature', featureLen === expected,
  featureLen + ' dims, expected ' + expected + ' (branches would add ' +
  G.of(BASE, 'branch').length + ')');

// Reordering the fork must not reorder the groups: if branch choice leaked into
// the features, swapping the options would reshuffle membership.
const swapped = E.evidence(run('A refillable cleaning product line sold direct to households.',
  'Should we go into retail from launch or sell direct-to-consumer only?'));
chk('reordering the fork does not change group sizes',
  JSON.stringify(swapped.segments.map(s => s.n).sort()) ===
  JSON.stringify(EV.segments.map(s => s.n).sort()),
  swapped.segments.map(s => s.n).sort() + ' vs ' + EV.segments.map(s => s.n).sort());

// (2) Polarisation must be measured over the ASSIGNED grouping. Measured over
// response clusters — which are built partly from intent — it would report a
// high split on every study by construction, including panels that agree.
const flat = run('A tool everyone in this panel feels identically about.',
                 'Should we ship it?', 60);
const flatEv = E.evidence(flat);
console.log('  polarisation eta-squared: ' + flatEv.polarisation.etaSquared +
            '  splits=' + flatEv.polarisation.splits);
chk('polarisation is not computed over response clusters',
  E.polarisation(BASE).etaSquared === EV.polarisation.etaSquared);
chk('polarisation uses assigned segments as its grouping',
  G.of(BASE, 'segment').length > 1 && EV.polarisation.etaSquared <= 1);

/* ===================================================== objection severity */
hr('SEVERITY  (a separate axis from mass)');
EV.objections.forEach(o => console.log('  P' + o.priorityRank + '  mass#' + o.massRank +
  '  ' + String(o.pct + '%').padStart(4) + '  ' + o.severity.padEnd(9) + o.category));

chk('every row declares severity as assigned, not measured',
  EV.objections.every(o => o.severityBasis === 'assigned'));
chk('every row explains its tier', EV.objections.every(o => !!o.severityWhy));
chk('priority order differs from mass order',
  EV.objections.some(o => o.priorityRank !== o.massRank));
chk('critical outranks everything more common than it',
  EV.objections.filter(o => o.severity === 'critical')
    .every(c => EV.objections.filter(o => o.severity === 'low')
      .every(l => c.priorityRank < l.priorityRank)));
chk('shares still sum to 100', EV.objections.reduce((a, o) => a + o.pct, 0) === 100,
  String(EV.objections.reduce((a, o) => a + o.pct, 0)));

// "Concentrated in X" must mean more than "X is the biggest group". The plain
// majority test reported a critical objection as concentrated in a cluster
// holding 55% of the panel — which was simply where most of everything was.
hr('CONCENTRATION IS A LIFT, NOT A HEAD COUNT');
EV.objections.filter(o => o.concentratedIn).forEach(o =>
  console.log('  ' + o.category.padEnd(14) + o.concentration + '% in "' +
    o.concentratedIn.slice(0, 34) + '"  (' + o.concentrationLift + '× its panel share)'));
const biggest = EV.segments.slice().sort((a, b) => b.n - a.n)[0];
console.log('  largest group: "' + biggest.name.slice(0, 40) + '" at ' +
  Math.round(biggest.n / EV.stats.n * 100) + '% of the panel');
chk('every reported concentration clears its baseline',
  EV.objections.filter(o => o.concentratedIn).every(o => o.concentrationLift >= 1.5));
chk('concentration and lift are reported together',
  EV.objections.every(o => (o.concentratedIn == null) === (o.concentrationLift == null)));
chk('the largest group is not named as a concentration by size alone',
  EV.objections.filter(o => o.concentratedIn === biggest.name)
    .every(o => o.concentrationLift >= 1.5));

// A rare high-severity objection must never be deprioritised for being rare.
// Filtering set-asides on mass alone produced "set aside relevance concerns"
// at 7% — relevance being the objection that means you are solving the wrong
// problem.
const strat = S.strategise(BASE, EV);
const asideCats = strat.ignoreForNow.map(i => i.text.split(' ')[0]);
const severeCats = EV.objections.filter(o => ['critical', 'high'].indexOf(o.severity) !== -1)
  .map(o => o.category);
console.log('  set aside : ' + (asideCats.join(', ') || '(none)'));
console.log('  never set aside: ' + severeCats.join(', '));
chk('no critical or high objection is ever set aside',
  asideCats.every(c => severeCats.indexOf(c) === -1),
  asideCats.filter(c => severeCats.indexOf(c) !== -1).join(', '));
const rare = EV.objections.filter(o => o.pct < 10 && ['critical', 'high'].indexOf(o.severity) !== -1);
if (rare.length) {
  chk('a rare but severe objection is raised in the case against',
    strat.recommendation.against.some(a => rare.some(o => a.text.indexOf(o.category) !== -1)),
    rare.map(o => o.category).join(', '));
}

/* ======================================================= substitutes */
hr('SUBSTITUTES  (what they use today)');
const sub = EV.substitutes;
sub.byKind.forEach(k => console.log('  ' + String(k.pct + '%').padStart(4) + '  switch ' +
  String(k.wouldSwitchPct + '%').padStart(4) + '  ' + (k.monetised ? 'paid  ' : 'free  ') + k.label));
console.log('  ' + sub.note);

chk('substitute shares sum to 100', sub.byKind.reduce((a, k) => a + k.pct, 0) === 100,
  String(sub.byKind.reduce((a, k) => a + k.pct, 0)));
chk('substitute utterances stay out of the headline n', EV.stats.n === 200,
  String(EV.stats.n));
chk('stickier alternatives show lower switch intent',
  (sub.byKind.find(k => k.kind === 'inhouse') || { meanSwitchIntent: 0 }).meanSwitchIntent <=
  (sub.byKind.find(k => k.kind === 'nothing') || { meanSwitchIntent: 5 }).meanSwitchIntent);
chk('paid and unpaid switchers are reported separately',
  sub.paidSwitchPct != null && sub.freeSwitchPct != null);

// A substitute the engine invented rather than heard is a fabricated
// competitive section, so the graph refuses it for the same reason it refuses
// an unevidenced verdict.
const orphan = JSON.parse(JSON.stringify(BASE));
orphan.nodes.push({ id: 'subs_999', type: 'substitute', text: 'A tool nobody mentioned',
                    kind: 'incumbent', key: 'substitute:x' });
const orphanCheck = G.validate(orphan);
console.log('  invented substitute -> rejected: ' + !orphanCheck.ok);
chk('an unevidenced substitute is rejected by the graph',
  !orphanCheck.ok && orphanCheck.errors.some(e => /subs_999/.test(e)));

/* ======================================================= flip conditions */
hr('FLIP CONDITIONS');
EV.flips.forEach(f => console.log('  [' + f.type + (f.measured ? '/measured' : '/conditional') +
  '] ' + f.text.slice(0, 96)));

chk('every flip declares measured or conditional',
  EV.flips.every(f => f.measured === true || f.conditional === true));
chk('the assumption flip is marked conditional, not measured',
  (EV.flips.find(f => f.type === 'assumption') || {}).measured === false);
chk('any quoted mass is marked a ceiling',
  EV.flips.every(f => f.addressableMass == null || f.isCeilingNotForecast === true));

// A segment flip must clear its OWN interval. Without that, a 25-person group
// split 52/48 was reported as "the answer reverses here" — a flip condition
// that is itself noise is worse than no flip condition.
const segFlips = EV.flips.filter(f => f.type === 'segment');
chk('segment flips clear their own margin of error',
  segFlips.every(f => f.marginOfError != null && f.n >= C.MIN_CLUSTER));
segFlips.forEach(f => {
  const seg = EV.segments.find(s => s.name === f.segment);
  chk('segment flip "' + f.segment.slice(0, 24) + '" is significant',
    seg && seg.branchPreference.pct - f.marginOfError > 50);
});

// Two-option forks are a paired comparison, not two independent polls. Summing
// the two margins would report a genuine 60/40 as a tie.
const marginFlip = EV.flips.find(f => f.type === 'margin');
if (marginFlip) {
  const top = EV.branches.filter(b => b.evaluated)
    .sort((a, b) => b.preferenceShare - a.preferenceShare)[0];
  chk('the margin test is against an even split, not a doubled interval',
    top.preferenceShare - top.marginOfError <= 50,
    top.preferenceShare + '% ±' + top.marginOfError);
}

/* ===================================================== messaging concepts */
hr('POSITIONING CONCEPTS  (hypotheses, never findings)');
strat.messaging.concepts.forEach(c =>
  console.log('  ' + c.roleLabel.padEnd(19) + c.promise.slice(0, 60)));

chk('a disclaimer is always present', !!strat.messaging.disclaimer);
chk('every concept declares itself untested',
  strat.messaging.concepts.every(c => c.tested === false));
chk('no concept carries a measurement',
  strat.messaging.concepts.every(c =>
    ['pct', 'lift', 'confidence', 'marginOfError'].every(f => c[f] == null)));
chk('every concept cites a real node',
  strat.messaging.concepts.every(c => c.cites.length &&
    c.cites.every(id => BASE.nodes.some(n => n.id === id))));

// The verifier must bite on each of these, or the guarantee is decorative.
const bend = (fn) => { const b = JSON.parse(JSON.stringify(strat)); fn(b); return S.verify(BASE, EV, b); };
const r1 = bend(b => { b.messaging.concepts[0].tested = true; });
chk('a concept claiming to be tested is rejected',
  !r1.ok && r1.errors.some(e => /tested/.test(e)), r1.errors.join(' / '));
const r2 = bend(b => { delete b.messaging.disclaimer; });
chk('a messaging block with no disclaimer is rejected',
  !r2.ok && r2.errors.some(e => /disclaimer/.test(e)));
const r3 = bend(b => { b.messaging.concepts[0].cites = ['nope_1']; });
chk('a concept citing an unknown node is rejected',
  !r3.ok && r3.errors.some(e => /unknown node/.test(e)));
const r4 = bend(b => { b.moves[0].horizon = 'someday'; });
chk('an unknown horizon is rejected', !r4.ok && r4.errors.some(e => /horizon/.test(e)));

/* ---- the verifier must not decay as the bundle grows ---- */
// This is the regression test for a bug the suite caught late: `numbersIn(ev)`
// over the WHOLE bundle allowed any figure appearing anywhere, so adding
// response segments put every categoryMix and branchMix percentage into scope
// and a fabricated "+40%" found its match in a third-ranked objection share.
hr('VERIFIER DOES NOT DECAY AS THE EVIDENCE BUNDLE GROWS');
const quotable = S.quotableNumbers(EV);
const everything = S.numbersIn(EV);
const incidental = [...everything].filter(n => !quotable.has(n) && n > 10 && n < 100);
console.log('  quotable figures: ' + quotable.size + '   all numbers in bundle: ' + everything.size);
console.log('  incidental values NOT quotable: ' + incidental.slice(0, 12).join(', '));
chk('the quotable set is narrower than the whole bundle', quotable.size < everything.size);
chk('incidental mix percentages exist and are excluded', incidental.length > 0);
if (incidental.length) {
  const n = incidental[0];
  const liar = JSON.parse(JSON.stringify(strat));
  liar.recommendation.because[0].text += ' This will lift signups by ' + n + '%.';
  const lr = S.verify(BASE, EV, liar);
  console.log('  fabricating "' + n + '%" -> rejected: ' + !lr.ok);
  chk('a figure that only appears in an internal mix cannot be quoted',
    !lr.ok && lr.errors.some(e => /fabricated/.test(e)), String(n));
}
// And the headline figures must still be quotable, or the verifier is useless.
const honest = JSON.parse(JSON.stringify(strat));
honest.position.text += ' The panel sat at ' + EV.stats.positive.pct + '% positive with a margin of ' +
                        EV.sampling.marginOfError + 'pp.';
chk('genuinely computed headline figures remain quotable', S.verify(BASE, EV, honest).ok,
  S.verify(BASE, EV, honest).errors.join(' / '));

/* ============================================================== pre-flight */
hr('PRE-FLIGHT  (before a credit is spent)');
const TIERS = [{ respondents: 50 }, { respondents: 100 }, { respondents: 200 }, { respondents: 400 }];
const pf = PV.preflight(study('A refillable cleaning product line sold direct to households.',
  'Should we sell direct-to-consumer only or go into retail from launch?'), TIERS);
pf.precision.forEach(p => console.log('  n=' + String(p.respondents).padStart(4) +
  '  ±' + String(p.marginOfError).padEnd(5) + '  resolves a ' + p.resolvableGap + 'pt split'));

chk('the fork is parsed and shown back', pf.question.parsedAs === 'fork' &&
  pf.question.branches.length === 2);
chk('a non-fork question is reported as single',
  PV.preflight(study('x', 'Would people pay for this?'), TIERS).question.parsedAs === 'single');
chk('margin narrows monotonically with panel size',
  pf.precision.every((p, i) => i === 0 || p.marginOfError < pf.precision[i - 1].marginOfError));
chk('every tier states a different resolvable gap',
  new Set(pf.precision.map(p => p.resolvableGap)).size === pf.precision.length);
chk('composition shares sum to 100',
  ['archetypes', 'roles', 'markets', 'ages'].every(k =>
    pf.composition[k].reduce((a, r) => a + r.pct, 0) === 100),
  ['archetypes', 'roles', 'markets', 'ages']
    .map(k => k + '=' + pf.composition[k].reduce((a, r) => a + r.pct, 0)).join(' '));

// The preview claims the composition is EXACT. It has to actually be.
const actualRoles = {};
P.roster(AUD, 200, 'A refillable cleaning product line sold direct to households.' +
  JSON.stringify(AUD)).forEach(p => { actualRoles[p.role] = (actualRoles[p.role] || 0) + 1; });
chk('previewed composition matches the roster that will be generated',
  pf.composition.roles.every(r => actualRoles[r.value] === r.count),
  JSON.stringify(actualRoles));

// The margin quoted up front must be computed the same way as the one reported
// afterwards, or the preview is selling a different product from the one that
// arrives. p=0.5 is the honest pre-study assumption: it is the worst case.
chk('pre-flight margin matches the engine at the same p',
  PV.precision([200])[0].marginOfError === E.marginForN(200, 0.5));
chk('marginForN agrees with propCI on the same counts',
  E.marginForN(200, 0.5) === E.propCI(100, 200),
  E.marginForN(200, 0.5) + ' vs ' + E.propCI(100, 200));

const up = PV.upgradeAdvice(200, 400);
console.log('  upgrade 200->400: ' + up.text);
chk('upgrade advice names both margins', up.fromMargin > up.toMargin);
chk('a marginal upgrade is called marginal', PV.upgradeAdvice(380, 400).worthIt === false);

/* ================================================================ views */
hr('VIEW MODEL');
const memo = V.decisionMemo(BASE, EV, strat);
const audit = V.auditView(memo);
audit.errors.forEach(e => console.log('  ! ' + e));
chk('memo audits clean', audit.ok, audit.errors.join(' / '));
['flips', 'substitutes', 'messaging'].forEach(id =>
  chk('memo contains the ' + id + ' section', memo.sections.some(s => s.id === id)));
chk('segment block carries its method', memo.sections.find(s => s.id === 'panel')
  .blocks.some(b => b.type === 'segments' && !!b.method));

// The audit must bite on each new honesty rule.
const bendView = (fn) => { const m = JSON.parse(JSON.stringify(memo)); fn(m); return V.auditView(m); };
const sec = (m, id) => m.sections.find(s => s.id === id);
const a1 = bendView(m => { sec(m, 'messaging').blocks[0].concepts[0].tested = true; });
chk('audit rejects a concept marked tested', !a1.ok && a1.errors.some(e => /tested/.test(e)));
const a2 = bendView(m => { delete sec(m, 'messaging').blocks[0].disclaimer; });
chk('audit rejects messaging with no disclaimer', !a2.ok && a2.errors.some(e => /disclaimer/.test(e)));
const a3 = bendView(m => { sec(m, 'objections').blocks[0].rows[0].severityBasis = 'measured'; });
chk('audit rejects severity presented as measured',
  !a3.ok && a3.errors.some(e => /severityBasis/.test(e)));
const a4 = bendView(m => {
  const f = sec(m, 'flips').blocks.find(b => b.addressableMass != null);
  if (f) f.isCeilingNotForecast = false;
});
chk('audit rejects a mass quoted without a ceiling label',
  !a4.ok && a4.errors.some(e => /ceiling/.test(e)));
const a5 = bendView(m => {
  sec(m, 'messaging').blocks[0].concepts[0].pct = 62;
});
chk('audit rejects a measurement attached to an untested framing',
  !a5.ok && a5.errors.some(e => /cannot carry a measurement/.test(e)));

/* ============================================================== schema */
hr('SCHEMA COMPATIBILITY');
const v3 = JSON.parse(JSON.stringify(BASE));
v3.schemaVersion = 3;
v3.nodes = v3.nodes.filter(n => n.type !== 'substitute');
v3.edges = v3.edges.filter(e => v3.nodes.some(n => n.id === e.from) &&
                                v3.nodes.some(n => n.id === e.to));
const v3check = G.validate(v3);
chk('a v3 graph still validates', v3check.ok, v3check.errors.slice(0, 2).join(' / '));
chk('a v3 graph still produces a memo',
  V.auditView(V.decisionMemo(v3, E.evidence(v3), S.strategise(v3, E.evidence(v3)))).ok);
const vFuture = JSON.parse(JSON.stringify(BASE));
vFuture.schemaVersion = 99;
chk('a graph from a newer schema is refused', !G.validate(vFuture).ok);

/* ================================================================ summary */
console.log('\n' + '='.repeat(70) + '\nSUMMARY\n' + '='.repeat(70));
console.log('passed: ' + pass + '   FAILED: ' + fail);
fails.forEach(f => console.log('  x ' + f));
process.exitCode = fail ? 1 : 0;
