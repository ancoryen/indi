// The visiting-card panel must not drift from the services page.
//
// /visiting_panel restates, in the visitor's own words, the "Problem:" line
// that services.html already carries for each service. Those two copies live
// in different files, so nothing stops one being reworded and the other left
// behind — a card that outlives the website it points at is exactly the sort
// of quiet rot this catches.
//
// The site has no build step, so the panel cannot be generated from the
// services page at deploy time. The achievable guarantee is that drift is
// impossible to MISS rather than impossible, which is what these checks are.
//
//   node test/visiting-panel.test.js

const fs = require('fs');
const path = require('path');
const REPO = path.join(__dirname, '..');

const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const services = read('services.html');
const panel = read('visiting_panel.html');
const vercel = JSON.parse(read('vercel.json'));

let pass = 0, fail = 0; const fails = [];
const chk = (n, c, d) => c ? pass++ : (fail++, fails.push(n + (d ? ' — ' + d : '')));
const hr = t => console.log('\n' + '='.repeat(70) + '\n' + t + '\n' + '='.repeat(70));

// Both files are hand-written HTML, so compare decoded text rather than markup:
// the panel escapes the near-me quotes as &quot; where services.html does not.
const decode = (s) => String(s)
  .replace(/&quot;/g, '"').replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&apos;/g, "'")
  .replace(/\s+/g, ' ').trim();

/* ---------------------------------------------------- what each file holds */
const serviceProblems = [...services.matchAll(/<p class="problem">Problem:\s*([\s\S]*?)<\/p>/g)]
  .map(m => decode(m[1]));

const serviceSections = [...services.matchAll(/<section class="section" id="([a-z-]+)"/g)]
  .map(m => m[1])
  .filter(id => services.slice(services.indexOf('id="' + id + '"')).includes('class="problem"'));

const panelSymptoms = [...panel.matchAll(/<li><a href="(services\.html#[a-z-]+)">([\s\S]*?)<\/a><\/li>/g)]
  .map(m => ({ href: m[1], anchor: m[1].split('#')[1], text: decode(m[2]) }));

hr('SOURCES');
console.log('services.html : ' + serviceProblems.length + ' problem statements across ' +
            serviceSections.length + ' anchored sections');
console.log('visiting_panel: ' + panelSymptoms.length + ' symptoms linking to services');

/* ------------------------------------------- 1. no symptom is invented */
hr('EVERY SYMPTOM IS A REAL SERVICE PROBLEM, VERBATIM');
const invented = panelSymptoms.filter(s => !serviceProblems.includes(s.text));
invented.forEach(s => console.log('  ! not in services.html: "' + s.text.slice(0, 72) + '"'));
chk('no symptom text is invented or reworded', invented.length === 0,
  invented.length + ' of ' + panelSymptoms.length + ' drifted');

/* ------------------------------- 2. nothing the services page sells is lost */
hr('EVERY SERVICE PROBLEM REACHES THE PANEL');
const panelTexts = panelSymptoms.map(s => s.text);
const missing = serviceProblems.filter(p => !panelTexts.includes(p));
missing.forEach(p => console.log('  ! on services.html but not on the card page: "' + p.slice(0, 72) + '"'));
chk('every service problem appears on the panel', missing.length === 0,
  missing.length + ' missing');

/* ----------------------------------- 3. each symptom points at its own section */
hr('EACH SYMPTOM LINKS TO THE SECTION THAT ACTUALLY CONTAINS IT');
let misrouted = 0;
panelSymptoms.forEach(s => {
  // Slice out the section the link claims, and check the problem lives there.
  const start = services.indexOf('id="' + s.anchor + '"');
  const rest = services.slice(start);
  const end = rest.indexOf('<section class="section"', 10);
  const body = end === -1 ? rest : rest.slice(0, end);
  const here = [...body.matchAll(/<p class="problem">Problem:\s*([\s\S]*?)<\/p>/g)].map(m => decode(m[1]));
  if (!here.includes(s.text)) {
    misrouted++;
    console.log('  ! "' + s.text.slice(0, 54) + '" links to #' + s.anchor + ' but is not in it');
  }
});
chk('no symptom links to the wrong section', misrouted === 0, misrouted + ' misrouted');

const linkedAnchors = [...new Set(panelSymptoms.map(s => s.anchor))];
const unlinked = serviceSections.filter(id => !linkedAnchors.includes(id));
console.log('sections linked: ' + linkedAnchors.sort().join(', '));
chk('every service section is reachable from the panel', unlinked.length === 0,
  'unlinked: ' + unlinked.join(', '));

/* ------------------------------------------------ 4. the page's own rules */
hr('PAGE RULES');
chk('the page is noindex (a card is handed over in person)',
  /<meta name="robots" content="noindex, follow">/.test(panel));
chk('but follow, so its outbound links still count',
  /content="noindex, follow"/.test(panel));
chk('both audiences get their own section',
  /id="running"/.test(panel) && /id="idea"/.test(panel));
chk('each audience has its own call to action',
  (panel.match(/class="callout vp-cta"/g) || []).length >= 2);
chk('no invented statistic or credential',
  !/\b\d+\s*(?:%|percent|clients|customers|years|projects|businesses)\b/i
    .test(panel.replace(/₹50,000/g, '')),
  (panel.match(/\b\d+\s*(?:%|percent|clients|customers|years|projects|businesses)\b/i) || [])[0]);

/* ------------------------------------------------------ 5. the short alias */
hr('SHORT ALIAS');
const rule = (vercel.redirects || []).find(r => /card/i.test(r.source));
chk('a /card redirect exists', !!rule);
if (rule) {
  console.log('source     : ' + rule.source);
  console.log('destination: ' + rule.destination);
  const { pathToRegexp } = (() => { try { return require('path-to-regexp'); } catch (e) { return {}; } })();
  if (pathToRegexp) {
    const re = pathToRegexp(rule.source);
    const cases = ['/card', '/CARD', '/Card', '/cArD', '/CarD', '/cARd'];
    cases.forEach(c => chk('matches ' + c, re.test(c)));
    chk('does not over-match /cards', !re.test('/cards'));
    chk('does not over-match /cardholder', !re.test('/cardholder'));
  } else {
    // Not installed here; the pattern is still asserted structurally below.
    console.log('(path-to-regexp not available — pattern checked structurally)');
    chk('pattern is case-insensitive by construction, not by matcher default',
      /\[cC\]\[aA\]\[rR\]\[dD\]/.test(rule.source), rule.source);
  }
  chk('the alias is case-insensitive by construction',
    /\[cC\]\[aA\]\[rR\]\[dD\]/.test(rule.source), rule.source);
  // A printed card cannot be reissued. A 308 would be cached by browsers
  // indefinitely, so the destination must stay repointable.
  chk('the redirect is temporary, so the card stays repointable',
    rule.permanent === false, 'permanent: ' + rule.permanent);
  chk('the destination page exists',
    fs.existsSync(path.join(REPO, rule.destination.replace(/^\//, '') + '.html')),
    rule.destination);
}

/* ---------------------------------------------------------- 6. the QR files */
hr('QR ARTWORK');
['card-qr-brand.svg', 'card-qr-brand.png', 'card-qr-mono.svg', 'card-qr-mono.png']
  .forEach(f => chk('exists: ' + f, fs.existsSync(path.join(REPO, 'assets/card', f))));
const svg = fs.existsSync(path.join(REPO, 'assets/card/card-qr-mono.svg'))
  ? read('assets/card/card-qr-mono.svg') : '';
if (svg) {
  const size = Number((svg.match(/viewBox="0 0 (\d+) /) || [])[1]);
  console.log('symbol: ' + size + ' modules across, including the quiet zone');
  // 25 data modules + 4 quiet each side. If this grows, the QR got denser and
  // the printed module size shrank — which is the thing that breaks scanning.
  chk('still 33 modules across (v2 + quiet zone)', size === 33, String(size));
  chk('mono variant is pure black on white', /#000000/.test(svg) && /#FFFFFF/.test(svg));
}

console.log('\n' + '='.repeat(70) + '\nSUMMARY\n' + '='.repeat(70));
console.log('passed: ' + pass + '   FAILED: ' + fail);
fails.forEach(f => console.log('  x ' + f));
process.exitCode = fail ? 1 : 0;
