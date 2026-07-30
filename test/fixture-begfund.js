// Shared test fixture: the BegFund dry-run panel (n=12).
//
// A crowdfunding platform for homeless people and street performers, asking
// whether to launch direct-to-beneficiary or partner with registered NGOs
// first. Chosen because it polarises hard along a real axis — individual
// donors versus people who do this work professionally — which is exactly the
// structure the evidence engine has to detect rather than average away.
//
// Every figure the tests assert is hand-checkable from the table below.

const fs = require('fs');
const path = require('path');
const REPO = path.join(__dirname, '..');

global.window = global;
eval(fs.readFileSync(path.join(REPO, 'js/research-graph.js'), 'utf8'));
eval(fs.readFileSync(path.join(REPO, 'js/research-evidence.js'), 'utf8'));
eval(fs.readFileSync(path.join(REPO, 'js/research-strategist.js'), 'utf8'));
eval(fs.readFileSync(path.join(REPO, 'js/research-views.js'), 'utf8'));

const G = window.RGraph, E = window.REvidence, S = window.RStrategist, V = window.RViews;

// role | market | age | worldview | incentive | bias | lived experience | risk
// | segment | sentiment | intent | objection | category
const PANEL = [
  ['Marketing Manager','India','25-34','Gives monthly, believes transparency is the whole problem','Wants to feel her money landed','Trusts institutions over individuals','Has audited a charity report',3,'donor','neutral',3,'Choosing between people is a marketplace of suffering','dignity'],
  ['Chartered Accountant','India','35-44','Giving is a tax instrument first, altruism second','Needs 80G receipts for clients','Discounts anything not registered','Files returns for 200 donors',2,'donor','skeptical',2,'No 80G deduction on gifts to individuals','regulatory'],
  ['Software Engineer','India','18-24','Tips buskers by UPI, thinks NGOs waste money','Wants direct, frictionless giving','Anti-institutional','Never donated to a registered charity',4,'donor','positive',4,'Performers and begging are two different products','relevance'],
  ['Shelter Director','India','45-54','Safeguarding beats scale, always','Protects residents from exposure','Over-indexes on worst case','Has seen a donor grooming incident',2,'ngo','neutral',3,'Public profiles expose vulnerable people','safeguarding'],
  ['NGO Program Director','India','35-44','Verification is institutional work, not software','Protects the sector gatekeeping role','Hostile to disintermediation','Ran beneficiary vetting for eight years',2,'ngo','skeptical',2,'Verification becomes your entire business','safeguarding'],
  ['Street Outreach Worker','India','45-54','The neediest are the least reachable','Wants tools that work without phones','Distrusts tech solutions to poverty','Works rough sleepers nightly',2,'ngo','skeptical',2,'The ones who need this most cannot hold a phone','safeguarding'],
  ['Fintech Compliance Lead','India','25-34','Rails before product, every time','Avoids licensing exposure','Assumes the regulator says no','Sat through a payment aggregator licence rejection',1,'compliance','skeptical',1,'KYC on people without ID is unsolvable','regulatory'],
  ['Content Strategist','India','25-34','Stories move money, and that is fine','Wants emotional connection','Drawn to narrative over data','Went viral fundraising for a stranger',4,'donor','positive',4,'This risks becoming poverty as content','dignity'],
  ['Donor','United Kingdom','35-44','Charity means a registered charity','Wants Gift Aid and a receipt','Defers to established brands','Gives monthly to Shelter',3,'donor','neutral',3,'Crisis and Shelter already run sponsorships','alternatives'],
  ['Shelter Kitchen Worker','India','35-44','Was homeless, knows how handlers operate','Protects people from extraction','Sceptical of anything routable','Slept rough for two years',2,'ngo','skeptical',2,'A digital rail makes handler extraction easier to scale','safeguarding'],
  ['Impact Investor','India','25-34','A take rate on charity is untenable','Needs defensible unit economics','Discounts mission without margin','Passed on three giving startups',2,'compliance','skeptical',2,'A platform fee on a homeless person rent is a PR grenade','price'],
  ['Student','India','18-24','Gives small amounts on impulse','Wants zero friction','Acts on feeling, not research','Hands over coins weekly',4,'donor','positive',4,'More friction than handing over a ten rupee note','effort']
];

const SEG_NAMES = {
  donor:      'Individual donors, 22-44, metro India',
  ngo:        'NGO & frontline workers',
  compliance: 'Compliance & investor'
};

function build() {
  const b = G.create({ studyId: 'std_begfund', panelId: 'pnl_begfund_1' });
  const segs = {};
  Object.keys(SEG_NAMES).forEach(k => { segs[k] = b.segment(SEG_NAMES[k]); });

  PANEL.forEach(row => {
    const [role, market, age, worldview, incentive, bias, experience, risk,
           segKey, sentiment, intent, objText, objCat] = row;
    const p = b.persona({ role, market, age, worldview, incentive, bias, experience,
                          riskTolerance: risk });
    b.link(p, segs[segKey], 'in_segment', true);
    const u = b.utterance({ text: objText, sentiment, intent });
    b.link(p, u, 'voiced_by', true);
    b.link(u, p, 'voiced_by', true);              // traversable both ways
    b.link(u, b.objection({ text: objText, category: objCat }), 'supports', true);
  });

  const us = b.nodes.filter(n => n.type === 'utterance');

  // One claim per warrant class, so the validator's rules are all exercised.
  const cPref = b.claim('Donors want proof their money reached the person', 'preference');
  const cSal  = b.claim('Safeguarding is the most salient objection among practitioners', 'salience');
  const cFact = b.claim('Begging is a prosecutable offence in several Indian states', 'factual');
  const cCaus = b.claim('Verification is not believable because beneficiaries cannot prove identity', 'causal');
  b.link(us[0], cPref, 'supports', true);
  b.link(us[4], cSal, 'supports', true);
  b.link(us[6], cFact, 'supports', true);
  b.link(cCaus, cPref, 'derived_from', false);    // inference, tethered

  const a1 = b.assumption('Donor hesitancy is about trust in fund use');
  const a2 = b.assumption('Beneficiaries can be verified and onboarded at scale');
  const a3 = b.assumption('Individual giving can be made tax-efficient');

  const objs = b.nodes.filter(n => n.type === 'objection');
  const byCat = c => objs.filter(o => o.category === c);
  byCat('dignity').forEach(o => b.link(o, a1, 'threatens', true));
  byCat('safeguarding').forEach(o => b.link(o, a2, 'threatens', true));
  byCat('regulatory').forEach(o => { b.link(o, a2, 'threatens', true); b.link(o, a3, 'threatens', true); });
  b.link(cFact, a2, 'threatens', true);           // factual blocker: unresolvable by panel

  // Branches must be MEASURED. Each persona states a preference, and those
  // utterances are the evidential chain the validator now requires — a verdict
  // assigned without them is rejected, which is the whole point of the
  // invariant. The anti-institutional personas (engineer, content strategist,
  // student) pick direct; everyone else picks the NGO route.
  const brDirect = b.branch('Direct-to-beneficiary', 'no',
    '3 of 12 preferred this option (25%), mean intent 3.7/5.');
  const brNGO = b.branch('NGO-partnership first', 'conditional',
    '9 of 12 preferred this option (75%), mean intent 3.2/5.');
  const DIRECT_VOTERS = [2, 7, 11];
  const personaNodes = b.nodes.filter(n => n.type === 'persona');
  personaNodes.forEach((pn, i) => {
    const direct = DIRECT_VOTERS.indexOf(i) !== -1;
    const target = direct ? brDirect : brNGO;
    const intent = direct ? 4 : (i % 3 === 0 ? 4 : 3);
    const bu = b.utterance({
      text: 'I would go with ' + target.label + '.',
      sentiment: intent >= 4 ? 'positive' : 'neutral',
      intent,
      about: 'branch'            // kept out of the idea-level statistics
    });
    b.link(pn, bu, 'voiced_by', true);
    b.link(bu, pn, 'voiced_by', true);
    b.link(bu, target, 'supports', true);
  });
  b.link(brDirect, a2, 'depends_on', false);
  b.link(brNGO, a3, 'depends_on', false);

  const x1 = b.experiment({
    text: 'Pilot: two or three registered NGOs onboard fifty beneficiaries in thirty days with 80G receipts',
    variantA: 'NGO-verified profiles', variantB: 'Self-verified profiles',
    measures: 'onboarding completion' });
  b.link(x1, a2, 'resolves', false);
  const x2 = b.experiment({
    text: 'Framing test on the same panel',
    variantA: 'Sponsor a verified individual', variantB: 'Fund a shelter named residents',
    measures: 'click-to-signup' });
  b.link(x2, a1, 'resolves', false);

  b.move('validate', 'Run the NGO onboarding pilot before writing product code');
  b.move('kill', 'Direct-to-beneficiary at launch');

  const graph = b.seal({ personaModel: 'claude-sonnet-5', memoModel: 'claude-opus-5' });
  // Node ids the tests need to reach for, so assertions don't hunt by string.
  graph.testRefs = {
    claimPreference: cPref.id, claimSalience: cSal.id,
    claimFactual: cFact.id, claimCausal: cCaus.id,
    assumeTrust: a1.id, assumeOnboarding: a2.id, assumeTax: a3.id,
    branchDirect: brDirect.id, branchNGO: brNGO.id,
    expPilot: x1.id, expFraming: x2.id,
    segDonor: segs.donor.id, segNGO: segs.ngo.id, segCompliance: segs.compliance.id
  };
  return graph;
}

module.exports = { G, E, S, V, build, PANEL, SEG_NAMES };
