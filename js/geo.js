// Indizilla — market-aware pricing.
//
// Rule (set by the business): India is the baseline. A visitor from a market
// where professional services cost more pays that market's rate; a visitor from
// a market at or below Indian rates pays the Indian baseline. So the multiplier
// is never below 1.
//
// Everything is billed in INR through Razorpay. The local figure is shown so the
// number means something to the reader; the INR charge is always displayed too.

window.Geo = (() => {
  const STORE_KEY = 'indizilla_market';

  // mult   — price multiplier vs the Indian baseline (floor 1.0)
  // fx     — INR per 1 unit of the local currency (indicative; update quarterly)
  // anchor — what a traditional agency in that market realistically charges for
  //          a brand + website package. Used by the brand promise line, which is
  //          rhetoric about agency pricing, not a converted price.
  const MARKETS = {
    IN: { name: 'India',          cur: 'INR', sym: '₹',   mult: 1,    fx: 1,    anchor: '₹50,000' },
    US: { name: 'United States',  cur: 'USD', sym: '$',   mult: 3.5,  fx: 88,   anchor: '$5,000' },
    CA: { name: 'Canada',         cur: 'CAD', sym: 'C$',  mult: 3,    fx: 63,   anchor: 'C$6,000' },
    GB: { name: 'United Kingdom', cur: 'GBP', sym: '£',   mult: 3.2,  fx: 112,  anchor: '£4,000' },
    AU: { name: 'Australia',      cur: 'AUD', sym: 'A$',  mult: 3,    fx: 57,   anchor: 'A$7,000' },
    NZ: { name: 'New Zealand',    cur: 'NZD', sym: 'NZ$', mult: 2.8,  fx: 52,   anchor: 'NZ$7,500' },
    IE: { name: 'Ireland',        cur: 'EUR', sym: '€',   mult: 3,    fx: 95,   anchor: '€4,500' },
    DE: { name: 'Germany',        cur: 'EUR', sym: '€',   mult: 3,    fx: 95,   anchor: '€4,500' },
    FR: { name: 'France',         cur: 'EUR', sym: '€',   mult: 2.9,  fx: 95,   anchor: '€4,500' },
    NL: { name: 'Netherlands',    cur: 'EUR', sym: '€',   mult: 3,    fx: 95,   anchor: '€4,500' },
    ES: { name: 'Spain',          cur: 'EUR', sym: '€',   mult: 2.4,  fx: 95,   anchor: '€3,500' },
    IT: { name: 'Italy',          cur: 'EUR', sym: '€',   mult: 2.4,  fx: 95,   anchor: '€3,500' },
    AE: { name: 'UAE',            cur: 'AED', sym: 'AED', mult: 2.5,  fx: 24,   anchor: 'AED 18,000' },
    SA: { name: 'Saudi Arabia',   cur: 'SAR', sym: 'SAR', mult: 2.2,  fx: 23.5, anchor: 'SAR 18,000' },
    SG: { name: 'Singapore',      cur: 'SGD', sym: 'S$',  mult: 2.8,  fx: 65,   anchor: 'S$6,500' },
    JP: { name: 'Japan',          cur: 'JPY', sym: '¥',   mult: 2.5,  fx: 0.57, anchor: '¥700,000' },
    ZA: { name: 'South Africa',   cur: 'ZAR', sym: 'R',   mult: 1.4,  fx: 4.8,  anchor: 'R60,000' },
    MY: { name: 'Malaysia',       cur: 'MYR', sym: 'RM',  mult: 1.8,  fx: 20,   anchor: 'RM12,000' },
    TH: { name: 'Thailand',       cur: 'THB', sym: '฿',   mult: 1.5,  fx: 2.6,  anchor: '฿90,000' },
    MX: { name: 'Mexico',         cur: 'MXN', sym: 'MX$', mult: 1.4,  fx: 4.6,  anchor: 'MX$60,000' },
    BR: { name: 'Brazil',         cur: 'BRL', sym: 'R$',  mult: 1.3,  fx: 15,   anchor: 'R$20,000' }
  };

  // Markets at or below the Indian baseline keep Indian pricing in ₹ — the rule
  // says never charge below baseline, and quoting a weaker currency at 1× would
  // read as a discount we are not offering.
  const BASELINE = MARKETS.IN;

  // Timezones worth mapping — covers the cases where the browser locale carries
  // no region (plain "en"), which is common.
  const TZ_COUNTRY = {
    'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US',
    'America/Los_Angeles': 'US', 'America/Phoenix': 'US', 'America/Anchorage': 'US',
    'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Edmonton': 'CA',
    'Europe/London': 'GB', 'Europe/Dublin': 'IE', 'Europe/Berlin': 'DE',
    'Europe/Paris': 'FR', 'Europe/Amsterdam': 'NL', 'Europe/Madrid': 'ES',
    'Europe/Rome': 'IT', 'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU',
    'Australia/Brisbane': 'AU', 'Australia/Perth': 'AU', 'Pacific/Auckland': 'NZ',
    'Asia/Dubai': 'AE', 'Asia/Riyadh': 'SA', 'Asia/Singapore': 'SG',
    'Asia/Tokyo': 'JP', 'Asia/Kuala_Lumpur': 'MY', 'Asia/Bangkok': 'TH',
    'Africa/Johannesburg': 'ZA', 'America/Mexico_City': 'MX', 'America/Sao_Paulo': 'BR',
    'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN'
  };

  function detectCountry() {
    try {
      const saved = localStorage.getItem(STORE_KEY);
      if (saved && MARKETS[saved]) return saved;
    } catch (e) { /* private mode */ }

    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz && TZ_COUNTRY[tz]) return TZ_COUNTRY[tz];
    } catch (e) { /* unsupported */ }

    const lang = (navigator.languages && navigator.languages[0]) || navigator.language || '';
    const region = (lang.split('-')[1] || '').toUpperCase();
    if (MARKETS[region]) return region;

    return 'IN';
  }

  let code = detectCountry();
  let market = MARKETS[code] || BASELINE;

  // Round to a number that reads like a price rather than a conversion result.
  function roundNice(n) {
    if (n < 100) return Math.round(n / 5) * 5;
    if (n < 1000) return Math.round(n / 10) * 10 - 1;      // 349, 899
    if (n < 10000) return Math.round(n / 100) * 100 - 1;   // 1,499, 2,999
    return Math.round(n / 1000) * 1000;
  }

  // Base INR price -> what this visitor actually pays, in INR (what Razorpay charges).
  function inrFor(baseInr) {
    return Math.round(Number(baseInr) * market.mult);
  }

  // The headline figure shown to the visitor, in their own currency.
  function localFor(baseInr) {
    if (market.cur === 'INR') return Math.round(Number(baseInr));
    return roundNice(Number(baseInr) * market.mult / market.fx);
  }

  function groupINR(n) { return '₹' + Number(n).toLocaleString('en-IN'); }

  // Primary display string, e.g. "₹2,999" at home, "$119" abroad.
  function format(baseInr) {
    if (market.cur === 'INR') return groupINR(Math.round(baseInr));
    const v = localFor(baseInr);
    const sep = /[A-Z]$/.test(market.sym) ? ' ' : '';
    return market.sym + sep + v.toLocaleString('en-US');
  }

  // What we will actually charge, spelled out. Empty at home, where format() is already INR.
  function billedNote(baseInr) {
    if (market.cur === 'INR') return '';
    return 'billed as ' + groupINR(inrFor(baseInr));
  }

  // Display an amount that has ALREADY been scaled to this market (an order
  // total, a cart line). Converts currency only — never multiplies again.
  function show(chargedInr) {
    if (market.cur === 'INR') return groupINR(Math.round(chargedInr));
    const sep = /[A-Z]$/.test(market.sym) ? ' ' : '';
    return market.sym + sep + roundNice(Number(chargedInr) / market.fx).toLocaleString('en-US');
  }

  function setCountry(c) {
    if (!MARKETS[c]) return;
    try { localStorage.setItem(STORE_KEY, c); } catch (e) { /* ignore */ }
    location.reload();
  }

  // Rewrite any element carrying a base price, plus the brand-promise anchor.
  function apply(root) {
    (root || document).querySelectorAll('[data-inr]').forEach((el) => {
      const base = Number(el.getAttribute('data-inr'));
      if (!base) return;
      el.textContent = format(base);
      if (el.hasAttribute('data-inr-note')) {
        const note = billedNote(base);
        el.setAttribute('title', note || '');
      }
    });
    (root || document).querySelectorAll('[data-anchor]').forEach((el) => {
      el.textContent = market.anchor;
    });
  }

  function init() {
    apply(document);
    // Currency switcher, wherever a page provides the mount point.
    document.querySelectorAll('.market-picker').forEach((sel) => {
      Object.keys(MARKETS).forEach((c) => {
        const o = document.createElement('option');
        o.value = c;
        o.textContent = MARKETS[c].name + ' · ' + MARKETS[c].cur;
        if (c === code) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', (e) => setCountry(e.target.value));
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  return {
    get country() { return code; },
    get market() { return market; },
    isBaseline: () => market.cur === 'INR',
    inrFor, localFor, format, show, billedNote, setCountry, apply, MARKETS
  };
})();
