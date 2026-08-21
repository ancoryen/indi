// Whole-site structural audit: tag balance, ids, links, navs, contact
// touchpoints, and JS syntax. Born from a live report — the contact page's
// WhatsApp button pointed at wa.me/910000000000, a placeholder that shipped
// because nothing was checking touchpoints. Now something is.
//
//   node test/site-audit.test.js

const fs = require('fs');
const path = require('path');
const REPO = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');

let pass = 0, fail = 0; const fails = [];
const chk = (n, c, d) => c ? pass++ : (fail++, fails.push(n + (d ? ' — ' + d : '')));
const hr = t => console.log('\n' + '='.repeat(70) + '\n' + t + '\n' + '='.repeat(70));

const pages = fs.readdirSync(REPO).filter(f => f.endsWith('.html'));

// The one phone number and the one address this business has.
const PHONE = '+919106719194';
const WA = '919106719194';
const EMAIL = 'hi@indizilla.com';

// Anchors that are handled by script rather than by an id on the page.
const JS_ANCHORS = new Set(['dashboard.html#research']);

hr('STRUCTURE');
for (const f of pages) {
  const s = read(f);
  const problems = [];

  for (const t of ['div', 'section', 'article', 'ul', 'ol', 'li', 'form', 'main',
                   'header', 'footer', 'a', 'p', 'span', 'label', 'button',
                   'details', 'summary', 'dl', 'table', 'h1', 'h2', 'h3', 'h4']) {
    const open = (s.match(new RegExp('<' + t + '(\\s|>)', 'g')) || []).length;
    const close = (s.match(new RegExp('</' + t + '>', 'g')) || []).length;
    if (open !== close) problems.push('<' + t + '> ' + open + '/' + close);
  }
  const ids = [...s.matchAll(/ id="([^"]+)"/g)].map(m => m[1]);
  const dup = [...new Set(ids.filter((v, i) => ids.indexOf(v) !== i))];
  if (dup.length) problems.push('duplicate ids: ' + dup.join(','));
  if (/&amp;amp;/.test(s)) problems.push('double-encoded entity');
  const typo = s.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ')
    .match(/\bteh\b|\brecieve\b|\bseperate\b|\boccured\b|\bbuisness\b|\bproffessional\b/i);
  if (typo) problems.push('typo: ' + typo[0]);

  chk(f + ' structure', problems.length === 0, problems.join(' | '));
}

hr('LINKS RESOLVE');
for (const f of pages) {
  const s = read(f);
  const dead = [];
  for (const m of s.matchAll(/href="([^"]+)"/g)) {
    const h = m[1];
    if (/^(https?:|mailto:|tel:|javascript:|#$)/.test(h)) continue;
    if (h.startsWith('#')) {
      if (!s.includes('id="' + h.slice(1) + '"')) dead.push(h);
      continue;
    }
    const clean = h.split('?')[0];                    // query strings are not paths
    const [file, frag] = clean.split('#');
    if (!file) continue;
    if (!fs.existsSync(path.join(REPO, file))) { dead.push(h); continue; }
    if (frag && !JS_ANCHORS.has(file + '#' + frag) &&
        !read(file).includes('id="' + frag + '"')) dead.push(h);
  }
  chk(f + ' links', dead.length === 0, dead.join(', '));
}

hr('NAV CONSISTENT ON MARKETING PAGES');
// Pages carrying the standard marketing nav (they link services.html) must all
// offer the same destinations; app pages (admin, the study wizard) keep their
// own reduced navs on purpose.
const NAV_EXPECT = ['services.html', 'build.html', 'pricing.html', 'print.html',
                    'research.html', 'portfolio.html', 'about.html'];
for (const f of pages) {
  const s = read(f);
  if (!s.includes('main-nav')) continue;
  const nav = (s.match(/<nav class="main-nav"[\s\S]*?<\/nav>/) || [''])[0];
  if (!nav.includes('services.html')) continue;       // app-nav variant
  const missing = NAV_EXPECT.filter(e => !nav.includes('href="' + e + '"'));
  chk(f + ' nav complete', missing.length === 0, 'missing ' + missing.join(', '));
}

hr('CONTACT TOUCHPOINTS');
// Wrong numbers dial strangers; old addresses bounce. One of each, everywhere.
for (const f of pages) {
  const s = read(f);
  const bad = [];
  if (/910000000000/.test(s)) bad.push('placeholder WhatsApp number');
  if (/hello@indizilla/.test(s)) bad.push('old email');
  for (const m of s.matchAll(/tel:([+\d]+)/g)) if (m[1] !== PHONE) bad.push('tel:' + m[1]);
  for (const m of s.matchAll(/wa\.me\/(\d+)/g)) if (m[1] !== WA) bad.push('wa.me/' + m[1]);
  for (const m of s.matchAll(/mailto:([a-z@.]+[a-z])/g)) {
    if (m[1] !== EMAIL) bad.push('mailto:' + m[1]);
  }
  chk(f + ' touchpoints', bad.length === 0, bad.join(', '));
}
chk('contact page has a working WhatsApp button',
  new RegExp('wa\\.me/' + WA + '\\?text=').test(read('contact.html')));
chk('scripts send to the one address',
  [...read('js/main.js').matchAll(/mailto:([a-z@.]+[a-z])/g)]
    .concat([...read('js/callback.js').matchAll(/mailto:([a-z@.]+[a-z])/g)])
    .concat([...read('js/print.js').matchAll(/mailto:([a-z@.]+[a-z])/g)])
    .every(m => m[1] === EMAIL));

hr('SERP SIGNALS');
// The brand query showed the retired title for days because canonicals
// pointed at URLs that redirect twice. One URL shape, everywhere, forever.
const titles = {};
for (const f of pages) {
  const s = read(f);
  const title = (s.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
  chk(f + ' title is unique', !titles[title], 'duplicate of ' + titles[title]);
  titles[title] = f;
  if (s.includes('name="robots" content="noindex')) continue;
  const clean = 'https://www.indizilla.com/' + (f === 'index.html' ? '' : f.replace(/\.html$/, ''));
  const canon = (s.match(/rel="canonical" href="([^"]*)"/) || [])[1];
  chk(f + ' canonical is www + clean', canon === clean, canon);
  const og = (s.match(/property="og:url" content="([^"]*)"/) || [])[1];
  if (og) chk(f + ' og:url matches canonical', og === clean, og);
  const d = (s.match(/name="description" content="([^"]*)"/) || [])[1] || '';
  chk(f + ' description 50–160 chars', d.length >= 50 && d.length <= 160, d.length + ' chars');
}
// The brand-query answer: enriched Organization data and a pushable index key.
const home = read('index.html');
chk('Organization JSON-LD carries logo, founder, slogan and sameAs',
  /"logo": "https:\/\/www\.indizilla\.com\/assets/.test(home) &&
  /"founder"/.test(home) && /"slogan"/.test(home) && /"sameAs"/.test(home));
chk('an IndexNow key file exists at the root',
  fs.readdirSync(REPO).some(f => /^[0-9a-f]{32}\.txt$/.test(f)));

hr('SITEMAP AND ROBOTS STAY IN SYNC');
// The sitemap is generated from each page's own noindex state; this asserts
// the sync so a new page or a robots change cannot silently drift it.
const sitemap = read('sitemap.xml');
const robots = read('robots.txt');
for (const f of pages) {
  const noindex = read(f).includes('name="robots" content="noindex');
  const loc = 'https://www.indizilla.com/' + (f === 'index.html' ? '' : f.replace(/\.html$/, ''));
  const listed = sitemap.includes('<loc>' + loc + '</loc>');
  chk(f + (noindex ? ' stays out of the sitemap' : ' is in the sitemap'),
    noindex ? !listed : listed);
}
chk('robots points at the sitemap', /Sitemap: https:\/\/www\.indizilla\.com\/sitemap\.xml/.test(robots));
chk('robots blocks the app surfaces',
  /Disallow: \/dashboard/.test(robots) && /Disallow: \/admin/.test(robots));

hr('THE REVENUE PIPES ARE BUILT');
chk('razorpay webhook function exists',
  fs.existsSync(path.join(REPO, 'supabase/functions/razorpay-webhook/index.ts')));
const webhook = read('supabase/functions/razorpay-webhook/index.ts');
chk('webhook verifies the signature before anything else',
  /validSignature/.test(webhook) && /invalid signature/.test(webhook));
chk('webhook compare is constant-time', /diff \|=/.test(webhook));
chk('ship.mjs deploys both functions',
  /'research', 'razorpay-webhook'/.test(read('scripts/ship.mjs')));
const mig = read('supabase/migration.sql');
chk('migration has the four new tables',
  ['callback_requests', 'page_views', 'reviews', 'payment_events']
    .every(t => mig.includes('create table if not exists public.' + t)));
chk('orders gain payment_verified', /add column if not exists payment_verified/.test(mig));

hr('JS PARSES');
for (const f of fs.readdirSync(path.join(REPO, 'js')).filter(f => f.endsWith('.js'))) {
  let ok = true, msg = '';
  try { new Function(read('js/' + f)); } catch (e) { ok = false; msg = e.message; }
  chk('js/' + f, ok, msg);
}

console.log('\n' + '='.repeat(70) + '\nSUMMARY\n' + '='.repeat(70));
console.log('passed: ' + pass + '   FAILED: ' + fail);
fails.forEach(f => console.log('  x ' + f));
process.exitCode = fail ? 1 : 0;
