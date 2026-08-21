// The quality reposition, made enforceable.
//
// Three things this pins down:
//   1. Cost-anchored copy stays gone. The site sells the standard of the work;
//      "affordable"/"cheap"/the old ₹50,000 line pull focus back to price.
//   2. Fabricated content stays gone. The old site carried invented
//      testimonials and case studies with made-up results; the portfolio now
//      holds real engagements and claims no metric nobody measured.
//   3. Prices cannot drift. db.js is the source of truth; every data-inr
//      attribute on the pages must match a real catalogue price.
//
//   node test/site-copy.test.js

const fs = require('fs');
const path = require('path');
const REPO = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');

let pass = 0, fail = 0; const fails = [];
const chk = (n, c, d) => c ? pass++ : (fail++, fails.push(n + (d ? ' — ' + d : '')));
const hr = t => console.log('\n' + '='.repeat(70) + '\n' + t + '\n' + '='.repeat(70));

const pages = fs.readdirSync(REPO).filter(f => f.endsWith('.html'));

/* ------------------------------------------------ 1. cost copy stays gone */
hr('NO COST-ANCHORED COPY');
// "testimonials" survives once as advice (a checklist telling businesses to
// show THEIR reviews) — that is content about the reader, not about us.
const BANNED = [
  [/₹50,000/, 'the old price-anchor line'],
  [/affordable/i, 'affordable'],
  [/\bcheap(est|er|ly)?\b/i, 'cheap'],
  [/budget-friendly/i, 'budget-friendly'],
  [/low[- ]cost/i, 'low-cost']
];
// research-sample.html is exempt from the cheap-ban: its memo quotes are
// simulated respondent VERBATIMS, and the product's honesty depends on panel
// data never being editable as marketing copy.
pages.filter(f => f !== 'research-sample.html').forEach(f => {
  const s = read(f);
  BANNED.forEach(([re, label]) => {
    if (re.test(s)) { chk(f + ' free of "' + label + '"', false, (s.match(re) || [])[0]); }
  });
});
chk('no page carries banned cost copy', fails.length === 0);
// Research pages carry the Research product's own tagline instead — also
// quality-led, and correct for that product's footer.
chk('every footer tagline is a brand line, not a price line',
  pages.filter(f => read(f).includes('class="tagline"'))
       .every(f => read(f).includes('Get Found. Be Seen. Get Chosen.') ||
                   read(f).includes('Test your idea on a simulated market')));

/* ------------------------------------------- 2. fabricated content stays gone */
hr('NO FABRICATED PEOPLE, PROJECTS OR RESULTS');
const FAKE = [/Shine\s*&amp;\s*Style/, /Patel'?s Kitchen/, /Sharma Precision/,
              /Priya Sharma/, /Arjun Patel/, /Meera Iyer/,
              /bookings doubled/i, /calls went up \d+%/i];
pages.forEach(f => {
  const s = read(f);
  FAKE.forEach(re => {
    if (re.test(s)) chk(f + ' free of fabricated content', false, String(re));
  });
});
chk('no fabricated names or results anywhere', true);

const portfolio = read('portfolio.html');
chk('GetPharm is on the portfolio', /GetPharm/.test(portfolio));
chk('GetPharm links to the live product', /getpharm\.in/.test(portfolio));
chk('Savison Life is on the portfolio', /Savison Life/.test(portfolio));
// The honest floor: scope statements, never metrics nobody measured.
chk('portfolio cases quote no percentage or multiplier results',
  !/class="num"[^>]*>\s*[\d.]+\s*[×%★]/.test(portfolio),
  (portfolio.match(/class="num"[^>]*>\s*[\d.]+\s*[×%★]/) || [])[0]);
chk('index features the real project, not the mock',
  /GetPharm/.test(read('index.html')) && !/Shine/.test(read('index.html')));
chk('the fabricated testimonial section is gone',
  !/class="card testimonial/.test(read('index.html')));

/* ------------------------------------------------------ 3. prices in sync */
hr('PRICES CANNOT DRIFT FROM THE CATALOGUE');
const db = read('js/db.js');
const svcBlock = db.slice(db.indexOf('const SERVICES'), db.indexOf('const PACKAGES'));
const catalogue = {};
[...svcBlock.matchAll(/id: '([a-z-]+)'[^}]*?price: (\d+)/g)]
  .forEach(m => { catalogue[m[1]] = Number(m[2]); });
const prices = new Set(Object.values(catalogue));
console.log('catalogue: ' + Object.keys(catalogue).length + ' priced items');

['services.html', 'pricing.html'].forEach(f => {
  const vals = [...read(f).matchAll(/data-inr="(\d+)"/g)].map(m => Number(m[1]));
  const orphans = vals.filter(v => !prices.has(v));
  chk(f + ': every displayed price exists in the catalogue', orphans.length === 0,
    'orphans: ' + orphans.join(', '));
  // The rendered ₹ text must agree with its own data-inr attribute.
  const pairs = [...read(f).matchAll(/data-inr="(\d+)" data-inr-note>₹([\d,]+)/g)];
  const off = pairs.filter(([, a, t]) => Number(t.replace(/,/g, '')) !== Number(a));
  chk(f + ': visible ₹ text matches data-inr', off.length === 0,
    off.map(o => o[0]).join(' | '));
});

// Premium floor: the flagship items must not quietly slide back down.
chk('website is priced as flagship work', catalogue.website >= 30000, String(catalogue.website));
chk('brand identity is priced as flagship work', catalogue.brand >= 20000, String(catalogue.brand));
chk('growth package is the premium tier', catalogue['tier-growth'] >= 70000, String(catalogue['tier-growth']));
// USD ceiling: dearest package × US multiplier stays under a $5k US-market
// equivalent — the "industry standard or USD counterpart, whichever is lower"
// rule, kept checkable.
chk('growth package converts below its USD counterpart',
  catalogue['tier-growth'] * 3.5 / 88 < 5000,
  '$' + Math.round(catalogue['tier-growth'] * 3.5 / 88));

/* -------------------------------------------------- packages stay coherent */
const pkgBlock = db.slice(db.indexOf('const PACKAGES'), db.indexOf('const CLUB_PREMIUM'));
[...pkgBlock.matchAll(/id: '(tier-[a-z]+)', name: '[^']+', price: (\d+)[^}]*includes: \[([^\]]+)\]/g)]
  .forEach(([, id, price, inc]) => {
    const parts = [...inc.matchAll(/'([a-z-]+)'/g)].map(m => catalogue[m[1]] || 0);
    const sum = parts.reduce((a, b) => a + b, 0);
    chk(id + ' costs less than its parts (' + price + ' vs ' + sum + ')', Number(price) < sum);
  });

console.log('\n' + '='.repeat(70) + '\nSUMMARY\n' + '='.repeat(70));
console.log('passed: ' + pass + '   FAILED: ' + fail);
fails.forEach(f => console.log('  x ' + f));
process.exitCode = fail ? 1 : 0;
