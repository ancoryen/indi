// vercel.json must satisfy Vercel's schema, which is STRICT.
//
// This exists because of a real outage-shaped failure: `"//"` keys were added
// inside the redirect and header objects as inline documentation. JSON has no
// comments, and that convention is fine in most tooling — but Vercel rejects
// unknown properties outright ("should NOT have additional properties"). The
// build failed schema validation, so the previous deployment kept serving and
// the site silently stayed four days stale. A green `git push` and a live site
// that never changes is the worst shape a deploy failure can take, because
// nothing anywhere looks broken.
//
// Explanation belongs in docs/VISITING-CARD.md, not in the config.
//
//   node test/vercel-config.test.js

const fs = require('fs');
const path = require('path');
const REPO = path.join(__dirname, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(REPO, 'vercel.json'), 'utf8'));

let pass = 0, fail = 0; const fails = [];
const chk = (n, c, d) => c ? pass++ : (fail++, fails.push(n + (d ? ' — ' + d : '')));
const hr = t => console.log('\n' + '='.repeat(70) + '\n' + t + '\n' + '='.repeat(70));

// Only what Vercel actually documents for each object.
const TOP = ['cleanUrls', 'trailingSlash', 'redirects', 'headers', 'rewrites',
             'routes', 'regions', 'functions', 'crons', 'buildCommand',
             'outputDirectory', 'installCommand', 'framework', 'devCommand',
             'ignoreCommand', 'public', 'github', 'images'];
const REDIRECT = ['source', 'destination', 'permanent', 'statusCode', 'has', 'missing'];
const HEADER   = ['source', 'headers', 'has', 'missing'];
const REWRITE  = ['source', 'destination', 'has', 'missing'];

const extras = (obj, allowed) => Object.keys(obj).filter(k => !allowed.includes(k));

hr('NO PROPERTIES VERCEL WOULD REJECT');
const topExtra = extras(cfg, TOP);
topExtra.forEach(k => console.log('  ! unknown top-level key: ' + JSON.stringify(k)));
chk('top level has no unknown keys', topExtra.length === 0, topExtra.join(', '));

[['redirects', REDIRECT], ['headers', HEADER], ['rewrites', REWRITE]].forEach(([key, allowed]) => {
  (cfg[key] || []).forEach((entry, i) => {
    const bad = extras(entry, allowed);
    bad.forEach(k => console.log('  ! ' + key + '[' + i + '] unknown key: ' + JSON.stringify(k)));
    chk(key + '[' + i + '] has no unknown keys', bad.length === 0, bad.join(', '));
  });
});

// The specific mistake that caused it, called out by name so a future reader
// understands why the rule exists.
const hasCommentKey = JSON.stringify(cfg).includes('"//"');
chk('no "//" pseudo-comment keys anywhere', !hasCommentKey,
  'JSON has no comments and Vercel rejects the key outright');

hr('THE ROUTES STILL SAY WHAT THEY SHOULD');
console.log('redirects:');
(cfg.redirects || []).forEach(r => console.log('  ' + r.source + '  ->  ' + r.destination +
  '  (' + (r.permanent ? 308 : 307) + ')'));

const card = (cfg.redirects || []).find(r => r.destination === '/visiting_panel');
const anc  = (cfg.redirects || []).find(r => r.destination === '/ashish');
chk('/card alias present', !!card);
chk('/ANC alias present', !!anc);
[['card', card, /\[cC\]\[aA\]\[rR\]\[dD\]/], ['anc', anc, /\[aA\]\[nN\]\[cC\]/]].forEach(([n, r, re]) => {
  if (!r) return;
  chk(n + ' matches every casing by construction', re.test(r.source), r.source);
  // A printed alias cannot be reissued, so it must not be cached permanently.
  chk(n + ' is a temporary redirect', r.permanent === false, 'permanent: ' + r.permanent);
  chk(n + ' destination cannot match its own source', !new RegExp(
    '^' + r.source.replace(/\/:[a-z]+\(/, '/(') + '$').test(r.destination), r.destination);
});

// Every redirect and header must point at something that exists.
hr('DESTINATIONS EXIST');
(cfg.redirects || []).forEach(r => {
  const f = r.destination.replace(/^\//, '') + '.html';
  chk('destination exists: ' + r.destination, fs.existsSync(path.join(REPO, f)), f);
});
(cfg.headers || []).forEach(h => {
  if (/[*(\[]/.test(h.source)) return;   // pattern, not a literal path
  chk('header target exists: ' + h.source,
    fs.existsSync(path.join(REPO, h.source.replace(/^\//, ''))), h.source);
});

console.log('\n' + '='.repeat(70) + '\nSUMMARY\n' + '='.repeat(70));
console.log('passed: ' + pass + '   FAILED: ' + fail);
fails.forEach(f => console.log('  x ' + f));
process.exitCode = fail ? 1 : 0;
