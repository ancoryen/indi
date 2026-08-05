// Conversation engine: does it route before it answers, and refuse rather than guess?
//
// The legacy follow-up drew from nine canned strings chosen by hashing the
// question — it never read what was asked. These tests check the replacement
// classifies into query / variant / panel / external, computes query answers
// from the graph with citations, and says what it would take when it cannot
// answer instead of improvising.
//
//   node test/research-conversation.test.js

const fs = require('fs');
const path = require('path');
const REPO = path.join(__dirname, '..');
global.window = global;
['research-graph', 'research-clusters', 'research-evidence', 'research-strategist',
 'research-views', 'research-panel', 'research-conversation']
  .forEach(f => eval(fs.readFileSync(path.join(REPO, 'js/' + f + '.js'), 'utf8')));
const G = window.RGraph, E = window.REvidence, P = window.RPanel, C = window.RConvo;

let pass = 0, fail = 0; const fails = [];
const chk = (n, c, d) => c ? pass++ : (fail++, fails.push(n + (d ? ' — ' + d : '')));
const hr = t => console.log('\n' + '='.repeat(72) + '\n' + t + '\n' + '='.repeat(72));

const STUDY = {
  id: 'std_begfund',
  idea: 'BegFund, a crowdfunding platform for homeless people and street performers. ' +
        'Donors browse verified profiles and contribute digitally instead of giving cash.',
  decision_q: 'Should we launch as a direct-to-beneficiary crowdfunding platform or ' +
              'partner exclusively with registered NGOs to verify beneficiary profiles?',
  audience: { markets: ['India'], ages: ['18-24', '25-34', '35-44', '45-54'],
              roles: ['Donor', 'NGO Director', 'Compliance Lead', 'Outreach Worker', 'Investor'],
              attitude: { skeptics: 45 } },
  mode: 'signal-plus', respondents: 200
};

const graph = P.run(STUDY);
const ev = E.evidence(graph);

/* ------------------------------------------------------------- routing */
hr('ROUTING  (four outcomes, decided before any answer is composed)');
const ROUTES = [
  // query — answerable from the stored graph
  ['What was the biggest objection?', 'query'],
  ['Which segment was most positive?', 'query'],
  ['Who was most skeptical?', 'query'],
  ['How confident should I be in this?', 'query'],
  ['What should I test first?', 'query'],
  ['What does the decision rest on?', 'query'],
  ['Is the panel split or does it agree?', 'query'],
  ['Why did they reject it?', 'query'],
  ['What should we do?', 'query'],
  // variant — same people, changed proposition
  ['What if we removed the performers?', 'variant'],
  ['What if we doubled pricing?', 'variant'],
  ['What if we charged monthly instead of per use?', 'variant'],
  ['Would it work without the verification step?', 'variant'],
  // panel — different population
  ['What if this was only for Gen Z?', 'panel'],
  ['What about enterprise buyers?', 'panel'],
  ['Would this work in Europe?', 'panel'],
  // external — no panel can settle it
  ['Is this legal in India?', 'external'],
  ['How big is the market?', 'external'],
  ['Who are our competitors?', 'external'],
  ['Do we need a payment licence?', 'external'],
  ['What are the GDPR implications?', 'external']
];
ROUTES.forEach(([q, want]) => {
  const got = C.classify(q, graph, ev).op;
  console.log('  ' + (got === want ? 'ok  ' : 'BAD ') + got.padEnd(9) + q);
  chk('routes "' + q.slice(0, 42) + '" -> ' + want, got === want, got);
});

/* ------------------------------------------------------------ answering */
hr('QUERY ANSWERS  (computed from the graph, with citations)');
['What was the biggest objection?',
 'Which segment was most positive?',
 'How confident should I be?',
 'What does the decision rest on?',
 'Is the panel split?',
 'What should I test first?'].forEach(q => {
  const a = C.ask(graph, ev, q);
  console.log('\nQ: ' + q);
  console.log('A: ' + a.text);
  if (a.quotes && a.quotes.length) a.quotes.slice(0, 2).forEach(t => console.log('   "' + t + '"'));
  console.log('   [' + a.op + ' · cites ' + a.cites.join(', ') + ' · verified=' + a.verified + ']');
  chk('answers from graph: ' + q.slice(0, 34), a.answeredFromGraph === true);
  chk('cites nodes: ' + q.slice(0, 34), a.cites.length > 0);
  chk('verifies: ' + q.slice(0, 34), a.verified === true, (a.rejected || []).join(' / '));
  chk('query is free: ' + q.slice(0, 34), a.costsCredits === false);
});

hr('SEGMENT COMPARISON  (names a real segment from this study)');
const segName = ev.segments[ev.segments.length - 1].name;
const cmp = C.ask(graph, ev, 'Why does ' + segName + ' disagree with the others?');
console.log('Q: Why does ' + segName + ' disagree with the others?');
console.log('A: ' + cmp.text);
chk('compares two real segments', cmp.answeredFromGraph && cmp.cites.length >= 2, String(cmp.cites.length));

hr('OBJECTION DETAIL  (verbatims must be things respondents said)');
const cat = ev.objections[0].category;
const det = C.ask(graph, ev, 'What exactly did the ' + cat + ' objectors say?');
console.log('Q: What exactly did the ' + cat + ' objectors say?');
console.log('A: ' + det.text);
(det.quotes || []).forEach(t => console.log('   "' + t + '"'));
const said = new Set(G.of(graph, 'utterance').map(u => u.text));
chk('returns verbatims', (det.quotes || []).length > 0);
chk('every quote was actually said', (det.quotes || []).every(t => said.has(t)));

/* ------------------------------------------------- refusal, not invention */
hr('REFUSAL  (no guessing — say what it would take)');
const UNANSWERABLE = [
  'What is the founder\'s favourite colour?',
  'How many respondents own a dog?',
  'What did respondent number 47 have for breakfast?'
];
UNANSWERABLE.forEach(q => {
  const a = C.ask(graph, ev, q);
  console.log('\nQ: ' + q);
  console.log('A: ' + a.text);
  console.log('   next: ' + a.nextStep);
  chk('refuses rather than invents: ' + q.slice(0, 32), a.answeredFromGraph === false);
  chk('offers a next step: ' + q.slice(0, 32), !!a.nextStep);
  chk('cites nothing it did not use: ' + q.slice(0, 32), (a.cites || []).length === 0);
});

hr('ROUTED, NOT ANSWERED  (variant / panel / external carry next steps)');
[['What if we doubled pricing?', 'variant'],
 ['What if this was only for Gen Z?', 'panel'],
 ['Is this legal in India?', 'external']].forEach(([q, op]) => {
  const a = C.ask(graph, ev, q);
  console.log('\nQ: ' + q);
  console.log('A: [' + a.opLabel + '] ' + a.text);
  console.log('   next: ' + a.nextStep);
  console.log('   requiresRun=' + a.requiresRun + '  reusesPanel=' + a.reusesPanel +
              '  costsCredits=' + a.costsCredits);
  chk('routes to ' + op, a.op === op);
  chk(op + ' is not answered from the graph', a.answeredFromGraph === false);
  chk(op + ' carries a next step', !!a.nextStep);
  chk(op + ' verifies', a.verified === true, (a.rejected || []).join(' / '));
});

const v = C.ask(graph, ev, 'What if we removed the verification step?');
chk('variant reuses the panel', v.reusesPanel === true && v.requiresRun === true);
const p = C.ask(graph, ev, 'What about Gen Z?');
chk('new panel does not reuse it', p.reusesPanel === false && p.requiresRun === true);
const x = C.ask(graph, ev, 'Is this legal?');
chk('external needs no run and costs nothing', x.requiresRun === false && x.costsCredits === false);

/* ------------------------------------------------------- verifier bites */
hr('ADVERSARIAL  (a fabricating answer is downgraded, not shipped)');
function expectReject(name, mutate, needle) {
  const a = C.answer('What was the biggest objection?', graph, ev);
  mutate(a);
  const r = C.verify(graph, ev, a);
  const caught = !r.ok && (!needle || r.errors.some(e => e.toLowerCase().includes(needle)));
  console.log((caught ? 'caught  ' : 'MISSED  ') + name);
  if (caught) console.log('        ' + r.errors.find(e => !needle || e.toLowerCase().includes(needle)));
  chk('rejects: ' + name, caught, r.errors.join(' / '));
}
// The figure has to be one this study genuinely does not contain. Hardcoding
// "63%" broke the moment eta-squared landed at 0.63 — at which point the
// verifier was right to accept it and the test was asserting a fabrication that
// was not one. Pick the number from what the evidence demonstrably lacks.
const quotable = window.RStrategist.quotableNumbers(ev);
let absent = 63;
while (quotable.has(absent)) absent++;
expectReject('fabricated figure in the answer',
  a => { a.text += ' Fixing it would recover ' + absent + '% of them.'; },
  'absent from the evidence');
expectReject('quote nobody said',
  a => { a.quotes = ['I would buy this instantly, no questions asked.']; }, 'no respondent said');
expectReject('cites a node that does not exist',
  a => { a.cites = ['obje_999']; }, 'unknown node');
expectReject('claims graph provenance with no citation',
  a => { a.cites = []; }, 'cites nothing');

// ask() must downgrade rather than pass a bad answer through.
const bad = Object.assign(C.answer('What was the biggest objection?', graph, ev), {});
bad.text += ' This will lift conversion by 41%.';
const dr = C.verify(graph, ev, bad);
console.log('\nverify catches it: ' + !dr.ok);
chk('verify catches a fabricated lift', !dr.ok);

hr('CONSISTENCY  (the same question twice gives the same answer)');
const a1 = C.ask(graph, ev, 'What was the biggest objection?');
const a2 = C.ask(graph, ev, 'What was the biggest objection?');
console.log('identical: ' + (a1.text === a2.text));
chk('answers are stable', a1.text === a2.text);
// The legacy engine returned one of nine strings regardless of the question.
const distinct = new Set(['What was the biggest objection?', 'Which segment was most positive?',
  'How confident should I be?', 'What should I test first?', 'What does the decision rest on?',
  'Is the panel split?', 'Who was most skeptical?', 'What should we do?']
  .map(q => C.ask(graph, ev, q).text)).size;
console.log('distinct answers for 8 different questions: ' + distinct + '/8');
chk('different questions get different answers', distinct === 8, String(distinct));

hr('SUMMARY');
console.log('passed: ' + pass + '   FAILED: ' + fail);
fails.forEach(f => console.log('  x ' + f));
