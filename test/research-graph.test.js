// Graph + evidence engine, exercised against the BegFund dry-run panel (n=12).
// Numbers here are checkable by hand against the memo in the design doc.
const fs = require('fs');
const REPO = require('path').join(__dirname, '..');
global.window = global;
eval(fs.readFileSync(REPO + '/js/research-graph.js', 'utf8'));
eval(fs.readFileSync(REPO + '/js/research-evidence.js', 'utf8'));
const G = window.RGraph, E = window.REvidence;

let pass = 0, fail = 0; const fails = [];
const chk = (name, cond, detail) => cond ? pass++ : (fail++, fails.push(name + (detail ? ' — ' + detail : '')));
const hr = t => console.log('\n' + '='.repeat(70) + '\n' + t + '\n' + '='.repeat(70));

/* ------------------------------------------------------------------ build */
const b = G.create({ studyId: 'std_begfund', panelId: 'pnl_begfund_1' });

const segDonor = b.segment('Individual donors, 22-44, metro India');
const segNGO   = b.segment('NGO & frontline workers');
const segComp  = b.segment('Compliance & investor');

// role, market, age, worldview, incentive, bias, experience, risk, seg, sentiment, intent, objection text, category
const PANEL = [
  ['Marketing Manager','India','25-34','Gives monthly, believes transparency is the whole problem','Wants to feel her money landed','Trusts institutions over individuals','Has audited a charity report',3,segDonor,'neutral',3,'Choosing between people is a marketplace of suffering','dignity'],
  ['Chartered Accountant','India','35-44','Giving is a tax instrument first, altruism second','Needs 80G receipts for clients','Discounts anything not registered','Files returns for 200 donors',2,segDonor,'skeptical',2,'No 80G deduction on gifts to individuals','regulatory'],
  ['Software Engineer','India','18-24','Tips buskers by UPI, thinks NGOs waste money','Wants direct, frictionless giving','Anti-institutional','Never donated to a registered charity',4,segDonor,'positive',4,'Performers and begging are two different products','relevance'],
  ['Shelter Director','India','45-54','Safeguarding beats scale, always','Protects residents from exposure','Over-indexes on worst case','Has seen a donor grooming incident',2,segNGO,'neutral',3,'Public profiles expose vulnerable people','safeguarding'],
  ['NGO Program Director','India','35-44','Verification is institutional work, not software','Protects the sector gatekeeping role','Hostile to disintermediation','Ran beneficiary vetting for 8 years',2,segNGO,'skeptical',2,'Verification becomes your entire business','safeguarding'],
  ['Street Outreach Worker','India','45-54','The neediest are the least reachable','Wants tools that work without phones','Distrusts tech solutions to poverty','Works rough sleepers nightly',2,segNGO,'skeptical',2,'The ones who need this most cannot hold a phone','safeguarding'],
  ['Fintech Compliance Lead','India','25-34','Rails before product, every time','Avoids licensing exposure','Assumes regulator says no','Sat through a PA licence rejection',1,segComp,'skeptical',1,'KYC on people without ID is unsolvable','regulatory'],
  ['Content Strategist','India','25-34','Stories move money, and that is fine','Wants emotional connection','Drawn to narrative over data','Went viral fundraising for a stranger',4,segDonor,'positive',4,'This risks becoming poverty as content','dignity'],
  ['Donor','United Kingdom','35-44','Charity means a registered charity','Wants Gift Aid and a receipt','Defers to established brands','Gives monthly to Shelter',3,segDonor,'neutral',3,'Crisis and Shelter already run sponsorships','alternatives'],
  ['Shelter Kitchen Worker','India','35-44','Was homeless, knows how handlers operate','Protects people from extraction','Sceptical of anything routable','Slept rough for two years',2,segNGO,'skeptical',2,'A digital rail makes handler extraction easier to scale','safeguarding'],
  ['Impact Investor','India','25-34','A take rate on charity is untenable','Needs defensible unit economics','Discounts mission without margin','Passed on three giving startups',2,segComp,'skeptical',2,'A platform fee on a homeless person rent is a PR grenade','price'],
  ['Student','India','18-24','Gives small amounts on impulse','Wants zero friction','Acts on feeling, not research','Hands over coins weekly',4,segDonor,'positive',4,'More friction than handing over a ten rupee note','effort']
];

PANEL.forEach(row => {
  const [role, market, age, worldview, incentive, bias, experience, risk, seg, sentiment, intent, objText, objCat] = row;
  const p = b.persona({ role, market, age, worldview, incentive, bias, experience, riskTolerance: risk });
  b.link(p, seg, 'in_segment', true);
  const u = b.utterance({ text: objText, sentiment, intent });
  b.link(p, u, 'voiced_by', true);
  b.link(u, p, 'voiced_by', true);          // both directions: lookups go each way
  const o = b.objection({ text: objText, category: objCat });
  b.link(u, o, 'supports', true);
});

// Claims, by warrant class.
const cPref = b.claim('Donors want proof their money reached the person', 'preference');
const cSal  = b.claim('Safeguarding is the most salient objection among practitioners', 'salience');
const cFact = b.claim('Begging is a prosecutable offence in several Indian states', 'factual');
const cCaus = b.claim('Verification is not believable because beneficiaries cannot prove identity', 'causal');

G.of(b.seal({}), 'utterance').slice(0, 3).forEach(() => {});   // no-op, keeps seal pure
b.link(b.nodes.find(n => n.type === 'utterance'), cPref, 'supports', true);
b.link(b.nodes.filter(n => n.type === 'utterance')[4], cSal, 'supports', true);
b.link(b.nodes.filter(n => n.type === 'utterance')[6], cFact, 'supports', true);
b.link(cCaus, cPref, 'derived_from', false);   // inference, tethered to an attested claim

// Assumptions and what threatens them.
const a1 = b.assumption('Donor hesitancy is about trust in fund use');
const a2 = b.assumption('Beneficiaries can be verified and onboarded at scale');
const a3 = b.assumption('Individual giving can be made tax-efficient');

const objs = b.nodes.filter(n => n.type === 'objection');
const byCat = c => objs.filter(o => o.category === c);
byCat('dignity').forEach(o => b.link(o, a1, 'threatens', true));
byCat('safeguarding').forEach(o => b.link(o, a2, 'threatens', true));
byCat('regulatory').forEach(o => { b.link(o, a2, 'threatens', true); b.link(o, a3, 'threatens', true); });
b.link(cFact, a2, 'threatens', true);          // factual blocker: panel cannot settle it

// Branches — the decision question was a fork.
const brDirect = b.branch('Direct-to-beneficiary', 'no', 'Panel puts the legal and safeguarding load entirely on you');
const brNGO    = b.branch('NGO-partnership first', 'conditional', 'Solves KYC, 80G and safeguarding; caps growth');
b.link(brDirect, a2, 'depends_on', false);
b.link(brNGO, a3, 'depends_on', false);

// Experiments.
const x1 = b.experiment({ text: 'Pilot: 2-3 registered NGOs onboard 50 beneficiaries in 30 days with 80G receipts',
                          variantA: 'NGO-verified profiles', variantB: 'Self-verified profiles', measures: 'onboarding completion' });
b.link(x1, a2, 'resolves', false);
const x2 = b.experiment({ text: 'Framing test on the same panel',
                          variantA: 'Sponsor a verified individual', variantB: 'Fund a shelter named residents', measures: 'click-to-signup' });
b.link(x2, a1, 'resolves', false);

b.move('validate', 'Run the NGO onboarding pilot before writing product code');
b.move('kill', 'Direct-to-beneficiary at launch');

const graph = b.seal({ personaModel: 'claude-sonnet-5', memoModel: 'claude-opus-5' });

/* ------------------------------------------------------------- validation */
hr('VALIDATION');
const v = G.validate(graph);
console.log('valid: ' + v.ok);
v.errors.forEach(e => console.log('  ! ' + e));
chk('graph validates', v.ok, v.errors.join(' / '));

// Safety property 1: factual claim carrying confidence must be rejected.
const bad1 = JSON.parse(JSON.stringify(graph));
bad1.nodes.find(n => n.id === cFact.id).confidence = 0.9;
const r1 = G.validate(bad1);
console.log('\nfactual claim + confidence -> rejected: ' + !r1.ok);
console.log('  ' + (r1.errors.find(e => e.includes('factual')) || 'NOT CAUGHT'));
chk('factual claim cannot carry confidence', !r1.ok && r1.errors.some(e => e.includes('factual')));

// Safety property 2: untethered causal claim must be rejected.
const bad2 = JSON.parse(JSON.stringify(graph));
bad2.edges = bad2.edges.filter(e => e.rel !== 'derived_from');
const r2 = G.validate(bad2);
console.log('untethered causal claim -> rejected: ' + !r2.ok);
console.log('  ' + (r2.errors.find(e => e.includes('causal')) || 'NOT CAUGHT'));
chk('causal claim must be tethered', !r2.ok && r2.errors.some(e => e.includes('causal')));

// Referential integrity.
const bad3 = JSON.parse(JSON.stringify(graph));
bad3.edges.push({ from: 'nope_9', to: a1.id, rel: 'threatens', attested: false });
chk('dangling edge rejected', !G.validate(bad3).ok);

/* --------------------------------------------------------------- evidence */
const ev = E.evidence(graph);

hr('PANEL STATS  (hand-check: 3 pos / 3 neu / 6 skp of 12, mean intent 2.7)');
console.log(JSON.stringify(ev.stats, null, 1));
chk('n = 12', ev.stats.n === 12, String(ev.stats.n));
chk('positive = 25%', ev.stats.positive.pct === 25, String(ev.stats.positive.pct));
chk('mean intent = 2.7', ev.stats.meanIntent === 2.7, String(ev.stats.meanIntent));

hr('SAMPLING  (hand-check: Agresti-Coull, 3-of-12 -> +/-22.7pp)');
console.log(JSON.stringify(ev.sampling));
chk('margin ~24.5pp', Math.abs(ev.sampling.marginOfError - 22.7) < 0.6, String(ev.sampling.marginOfError));

hr('SEGMENTS  (hand-check: donors +25, NGO -25, compliance -25)');
console.log('segment'.padEnd(42) + 'n'.padEnd(4) + 'pos%'.padEnd(6) + 'vs'.padEnd(6) + 'intent');
ev.segments.forEach(s => console.log(s.name.slice(0, 40).padEnd(42) + String(s.n).padEnd(4) +
  (s.positivePct + '%').padEnd(6) + ((s.vsOverall >= 0 ? '+' : '') + s.vsOverall).padEnd(6) + s.meanIntent));
const ngo = ev.segments.find(s => s.name.startsWith('NGO'));
chk('NGO segment scores BELOW overall', ngo && ngo.vsOverall < 0, ngo ? String(ngo.vsOverall) : 'missing');
chk('NGO segment is 0% positive', ngo && ngo.positivePct === 0);
chk('a signed negative delta exists', ev.segments.some(s => s.vsOverall < 0));

hr('POLARISATION  (hand-check: eta-squared ~0.57 -> splits)');
console.log(JSON.stringify(ev.polarisation, null, 1));
chk('eta-squared ~0.57', Math.abs(ev.polarisation.etaSquared - 0.57) < 0.05, String(ev.polarisation.etaSquared));
chk('detects a market split', ev.polarisation.splits === true);

hr('OBJECTION MASS  (hand-check: shares must total <= 100%)');
console.log('category'.padEnd(15)+'n'.padEnd(4)+'pct'.padEnd(6)+'distinct'.padEnd(10)+'concentrated in');
ev.objections.forEach(o => console.log(o.category.padEnd(15) + String(o.count).padEnd(4) +
  (o.pct + '%').padEnd(6) + (o.concentratedIn || '-')));
const total = ev.objections.reduce((s, o) => s + o.pct, 0);
console.log('total: ' + total + '%');
chk('objection shares do not exceed 100%', total <= 100, total + '%');
chk('safeguarding is the largest block', ev.objections[0].category === 'safeguarding', ev.objections[0].category);
chk('dignity + safeguarding are represented',
  ev.objections.some(o => o.category === 'dignity') && ev.objections.some(o => o.category === 'safeguarding'));

hr('LOAD-BEARING ASSUMPTIONS');
ev.assumptions.forEach(a => console.log('  [' + String(a.score).padStart(3) + '] ' + a.text +
  '\n        mass=' + a.threatenedMass + '% verdictDependent=' + a.verdictDependent +
  ' needsExternal=' + a.needsExternalVerification));
chk('onboarding assumption ranks first', ev.assumptions[0].text.includes('verified and onboarded'), ev.assumptions[0].text);
chk('factual blocker detected', ev.assumptions[0].needsExternalVerification === true);

hr('LEVERAGE  (ceiling, never a forecast)');
ev.leverage.slice(0, 3).forEach(l => console.log('  ' + l.rank + '. ' + l.assumption +
  '\n     addressable ceiling: ' + l.addressableMass + '%  |  ' + l.whyItRanks));
chk('leverage marks itself as a ceiling', ev.leverage.every(l => l.isCeilingNotForecast === true));
chk('leverage emits NO predicted lift', !JSON.stringify(ev.leverage).match(/expectedLift|predictedLift|forecast"/));

hr('CONFIDENCE  (must explain itself, and admit when credits will not help)');
console.log('level: ' + ev.confidence.level + '  (+/-' + ev.confidence.marginOfError + 'pp, n=' + ev.confidence.n + ')');
ev.confidence.reasons.forEach(r => console.log('  [' + r.term + '] ' + r.detail));
console.log('\nto raise confidence: ' + ev.confidence.raise.action);
console.log('more credits help: ' + ev.confidence.raise.moreCreditsHelp);
if (ev.confidence.raise.note) console.log('note: ' + ev.confidence.raise.note);
chk('confidence is low at n=12', ev.confidence.level === 'low', ev.confidence.level);
chk('warrant ceiling dominates', ev.confidence.raise.term === 'warrant', ev.confidence.raise.term);
chk('admits more credits will not help', ev.confidence.raise.moreCreditsHelp === false);
chk('confidence gives >=3 reasons', ev.confidence.reasons.length >= 3, String(ev.confidence.reasons.length));

hr('EXPERIMENTS, ranked by load removed');
ev.experiments.forEach(x => console.log('  [' + x.removesLoad + '] ' + x.text.slice(0, 62) +
  '\n       resolves: ' + x.resolves.join('; ')));
chk('top experiment targets the top assumption',
  ev.experiments[0].resolves.some(r => r.includes('verified and onboarded')));

hr('CLAIMS BY WARRANT');
Object.entries(ev.claims).forEach(([w, cs]) => {
  console.log(w + ' (' + G.WARRANT[w].label + ', panelIsEvidence=' + G.WARRANT[w].panelIsEvidence + ')');
  cs.forEach(c => console.log('   - ' + c.text + '  [attested by ' + c.attestedBy + ']'));
});
chk('factual claims kept separate', !!ev.claims.factual && ev.claims.factual.length === 1);
chk('causal claim records its derivation', ev.claims.causal[0].derivedFrom.length > 0);

hr('BRANCHES');
ev.branches.forEach(br => console.log('  ' + br.label + ': ' + br.verdict + '  (rests on: ' + br.restsOn.join('; ') + ')'));
chk('both branches verdicted', ev.branches.length === 2);
chk('branches carry different verdicts', new Set(ev.branches.map(b => b.verdict)).size === 2);

hr('CROSS-STUDY DOOR');
const keyed = graph.nodes.filter(n => n.key).length;
console.log('nodes with a stable cross-study key: ' + keyed + '/' + graph.nodes.length);
const b2 = G.create({ studyId: 'std_other', panelId: 'pnl_other' });
const sameObj = b2.objection({ text: 'Verification becomes your entire business', category: 'safeguarding' });
const origObj = graph.nodes.find(n => n.type === 'objection' && n.text.includes('entire business'));
console.log('same objection in a different study -> same key: ' + (sameObj.key === origObj.key));
console.log('  ' + sameObj.key);
chk('identical content yields identical key across studies', sameObj.key === origObj.key);
chk('edges reference ids, never indices', graph.edges.every(e => typeof e.from === 'string' && typeof e.to === 'string'));

hr('SUMMARY');
console.log('passed: ' + pass + '   FAILED: ' + fail);
fails.forEach(f => console.log('  x ' + f));
console.log('\ngraph: ' + graph.nodes.length + ' nodes, ' + graph.edges.length + ' edges, schema v' + graph.schemaVersion);
