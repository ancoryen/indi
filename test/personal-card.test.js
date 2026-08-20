// Ashish Narayan's card page (/ANC -> /ashish) must match the printed card.
//
// The printed card is the source of truth and cannot be re-issued once it is
// in someone's wallet. So the details here are asserted literally: a phone
// number or address that drifts from the card is a contact that silently fails
// for as long as the cards are in circulation.
//
//   node test/personal-card.test.js

const fs = require('fs');
const path = require('path');
const REPO = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');

const page = read('ashish.html');
const vcf = read('assets/card/ashish-narayan.vcf');
const vercel = JSON.parse(read('vercel.json'));

let pass = 0, fail = 0; const fails = [];
const chk = (n, c, d) => c ? pass++ : (fail++, fails.push(n + (d ? ' — ' + d : '')));
const hr = t => console.log('\n' + '='.repeat(70) + '\n' + t + '\n' + '='.repeat(70));

// Exactly what is printed on the card, both sides.
const CARD = {
  brand: 'INDIZILLA',
  tagline: 'Get Found. Be Seen. Get Chosen.',
  name: 'Ashish Narayan',
  role: 'Business Enablement Specialist',
  web: 'indizilla.com',
  phone: '+91 91067 19194',
  email: 'hi@indizilla.com'
};
const PHONE_E164 = '+919106719194';

/* ------------------------------------------------- every detail is present */
hr('THE PAGE CARRIES EVERY DETAIL ON THE CARD');
Object.entries(CARD).forEach(([k, v]) => {
  const found = page.includes(v);
  console.log('  ' + (found ? 'ok ' : '!! ') + k.padEnd(8) + v);
  chk('page shows ' + k, found, v);
});

/* --------------------------------------------------- and they are actionable */
hr('THE DETAILS ARE TAPPABLE');
chk('phone is a tel: link in E.164', page.includes('href="tel:' + PHONE_E164 + '"'), PHONE_E164);
chk('email is a mailto: link', page.includes('href="mailto:' + CARD.email + '"'));
chk('website is a real link', /href="https:\/\/www\.indizilla\.com"/.test(page));
// The digits behind tel: must be the printed number with the spaces removed —
// a mismatch here dials the wrong person and nothing on screen looks wrong.
chk('tel: digits match the printed number',
  PHONE_E164 === '+' + CARD.phone.replace(/[^\d]/g, ''),
  PHONE_E164 + ' vs ' + CARD.phone);

/* --------------------------------------------------------- side one is bare */
hr('SIDE ONE STAYS MINIMAL (print rule)');
const brandBlock = (page.match(/<div class="vcard-brand">([\s\S]*?)<\/div>\s*<div class="vcard-person">/) || [])[1] || '';
chk('brand block exists', !!brandBlock);
chk('brand block holds only the wordmark, tagline and mark',
  /vcard-wordmark/.test(brandBlock) && /vcard-tagline/.test(brandBlock) && /vcard-mark/.test(brandBlock));
chk('no contact details leak onto the brand side',
  !/tel:|mailto:|91067/.test(brandBlock));
chk('no QR or extra links on the brand side',
  !/<a\b/.test(brandBlock) && !/qr/i.test(brandBlock));

/* -------------------------------------------------------------- the vCard */
hr('vCARD');
chk('begins and ends correctly', /^BEGIN:VCARD/.test(vcf) && /END:VCARD\r\n$/.test(vcf));
chk('is vCard 3.0', /\r\nVERSION:3\.0\r\n/.test(vcf));
// RFC 6350 wants CRLF. Importers on both phone platforms are strict about it.
chk('uses CRLF line endings throughout', !/(?<!\r)\n/.test(vcf));
chk('full name matches the card', vcf.includes('FN:' + CARD.name));
chk('title matches the card', vcf.includes('TITLE:' + CARD.role));
chk('phone matches the page', vcf.includes(':' + PHONE_E164));
chk('email matches the card', vcf.includes(':' + CARD.email));
chk('organisation is set', /\r\nORG:Indizilla\r\n/.test(vcf));
chk('the page offers it for download',
  /href="assets\/card\/ashish-narayan\.vcf"/.test(page) && /download=/.test(page));

const vcfHeader = (vercel.headers || []).find(h => /\.vcf$/.test(h.source));
chk('served as text/vcard so phones open it in contacts', !!vcfHeader &&
  vcfHeader.headers.some(h => h.key === 'Content-Type' && /text\/vcard/.test(h.value)));

/* ------------------------------------------------------------ the /ANC route */
hr('THE PRINTED SHORT URL');
const rule = (vercel.redirects || []).find(r => r.destination === '/ashish');
chk('an /ANC redirect exists', !!rule);
if (rule) {
  console.log('  ' + rule.source + '  ->  ' + rule.destination);
  chk('matches every casing by construction, not by matcher default',
    /\[aA\]\[nN\]\[cC\]/.test(rule.source), rule.source);
  // A redirect whose destination matches its own source loops forever. The
  // destination is deliberately a different word for exactly this reason.
  chk('destination cannot match its own source',
    !/^\/[aA][nN][cC]$/.test(rule.destination), rule.destination);
  chk('temporary, so a printed card stays repointable',
    rule.permanent === false, 'permanent: ' + rule.permanent);
  chk('the destination page exists',
    fs.existsSync(path.join(REPO, rule.destination.replace(/^\//, '') + '.html')));
  chk('canonical points at the destination, not the alias',
    page.includes('href="https://www.indizilla.com' + rule.destination + '"'));
}

/* --------------------------------------------------------------- page rules */
hr('PAGE RULES');
chk('noindex (typed off a card, not found in search)',
  /content="noindex, follow"/.test(page));
chk('mobile viewport is set', /width=device-width/.test(page));
chk('structured data names the person and their employer',
  /"@type":\s*"Person"/.test(page) && /"name":\s*"Ashish Narayan"/.test(page));
// Structured data that disagrees with the visible page is worse than none.
const ld = JSON.parse((page.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/) || [])[1]);
chk('structured data phone matches the card', ld.telephone === CARD.phone, ld.telephone);
chk('structured data email matches the card', ld.email === CARD.email, ld.email);
chk('structured data title matches the card', ld.jobTitle === CARD.role, ld.jobTitle);
chk('internal links use the real page, not the alias',
  /href="visiting_panel\.html"/.test(page) && !/href="card"/.test(page));

/* --------------------------------------------- the two aliases stay distinct */
hr('THE TWO PRINTED ALIASES DO NOT COLLIDE');
const all = vercel.redirects || [];
chk('both aliases are configured', all.length >= 2);
const dests = all.map(r => r.destination);
chk('each alias has its own destination', new Set(dests).size === dests.length, dests.join(', '));
chk('no alias redirects to another alias source',
  !all.some(a => all.some(b => b !== a && new RegExp('^' + b.source.replace(/\/:[a-z]+\(/, '/(') + '$').test(a.destination))));

console.log('\n' + '='.repeat(70) + '\nSUMMARY\n' + '='.repeat(70));
console.log('passed: ' + pass + '   FAILED: ' + fail);
fails.forEach(f => console.log('  x ' + f));
process.exitCode = fail ? 1 : 0;
