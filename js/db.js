// Indizilla platform — data layer ("database system").
// Runs on localStorage today; every method mirrors what a backend API would expose,
// so swapping to Supabase/Postgres later means reimplementing this file only.

window.DB = (() => {
  const KEY = 'indizilla_db_v1';
  const SESSION_KEY = 'indizilla_session';
  const PENDING_REF_KEY = 'indizilla_pending_ref';

  // Remote mode: real Supabase backend, activated by pasting the anon key in
  // js/config.js. Without it, everything below runs on localStorage (demo).
  const cfg = window.INDIZILLA_CONFIG || {};
  const REMOTE = !!(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase);
  const sb = REMOTE ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;

  const DEFAULT_COUPONS = [
    { code: 'WELCOME10', type: 'percent', value: 10, maxDiscount: 1000, minAmount: 0, active: true,
      desc: '10% off your first order (up to ₹1,000)' },
    { code: 'NEWSITE500', type: 'flat', value: 500, minAmount: 5000, active: true,
      desc: '₹500 off any order of ₹5,000 or more' },
    { code: 'GROWTH15', type: 'percent', value: 15, maxDiscount: 3000, minAmount: 10000, active: true,
      desc: '15% off orders of ₹10,000+ (up to ₹3,000)' }
  ];

  const SERVICES = [
    { id: 'gbp', name: 'Google Business Profile', price: 7999 },
    { id: 'brand', name: 'Brand Identity', price: 24999 },
    { id: 'website', name: 'Business Website', price: 39999 },
    { id: 'landing', name: 'Landing Page', price: 14999 },
    { id: 'seo', name: 'SEO', price: 14999 },
    { id: 'meta-ads', name: 'Meta Ads management', price: 11999, monthly: true },
    { id: 'google-ads', name: 'Google Ads management', price: 11999, monthly: true },
    { id: 'crm', name: 'CRM Setup', price: 14999 },
    { id: 'email', name: 'Business Email', price: 2499 },
    { id: 'chatbot', name: 'AI Chatbot', price: 17999 },
    { id: 'automation', name: 'Business Automation', price: 12999 },
    { id: 'social', name: 'Social Media', price: 14999, monthly: true },
    { id: 'maintenance', name: 'Website Maintenance', price: 3999, monthly: true },
    { id: 'reviews', name: 'Review Management', price: 5999, monthly: true },
    { id: 'profile-design', name: 'Business Profile Design', price: 4999 },
    { id: 'catalogue', name: 'Digital Catalogue', price: 9999 },
    { id: 'whatsapp', name: 'WhatsApp Business', price: 4999 },
    { id: 'booking', name: 'Booking System', price: 9999 },
    { id: 'tier-starter', name: 'Starter package', price: 24999 },
    { id: 'tier-launch', name: 'Launch package', price: 37999 },
    { id: 'tier-chain', name: 'Chain package', price: 149999 },
    { id: 'tier-chain-partner', name: 'Chain Partner plan', price: 69999, monthly: true },
    { id: 'tier-growth', name: 'Growth package', price: 79999 },
    { id: 'tier-partner', name: 'Partner plan', price: 34999, monthly: true }
  ];

  // Packages, used by the à la carte upsell: clubbing 2+ services that live inside
  // a package costs a combination premium — the package is always the better deal.
  const PACKAGES = [
    { id: 'tier-starter', name: 'Starter package', price: 24999, monthly: false,
      includes: ['gbp', 'landing', 'profile-design', 'whatsapp'] },
    { id: 'tier-growth', name: 'Growth package', price: 79999, monthly: false,
      includes: ['gbp', 'landing', 'profile-design', 'whatsapp', 'brand', 'website', 'seo', 'email', 'booking'] },
    { id: 'tier-launch', name: 'Launch package', price: 37999, monthly: false,
      includes: ['brand', 'landing', 'email', 'whatsapp'] },
    { id: 'tier-chain', name: 'Chain package', price: 149999, monthly: false,
      includes: ['gbp', 'landing', 'profile-design', 'whatsapp', 'brand', 'website', 'seo', 'email', 'booking', 'catalogue', 'crm', 'automation'] },
    { id: 'tier-partner', name: 'Partner plan', price: 34999, monthly: true,
      includes: ['maintenance', 'social', 'meta-ads', 'google-ads', 'reviews'] }
  ];
  const CLUB_PREMIUM = 0.25; // +25% on à-la-carte items that overlap the same package

  // Delivery timelines (working days) — drive job due dates and delay alerts.
  const TIMELINES = {
    gbp: 3, brand: 14, website: 21, landing: 7, seo: 14, 'meta-ads': 7, 'google-ads': 7,
    crm: 7, email: 1, chatbot: 7, automation: 7, social: 7, maintenance: 3, reviews: 3,
    'profile-design': 2, catalogue: 5, whatsapp: 2, booking: 4,
    'tier-starter': 7, 'tier-growth': 21, 'tier-partner': 7,
    'tier-launch': 14, 'tier-chain': 30, 'tier-chain-partner': 7, cart: 14
  };

  const REFERRAL_BONUS = 500;   // internal credits (₹ worth) per successful referral
  const REFERRAL_CAP = 3;       // per quarter

  let data;

  function blank() {
    return { users: [], orders: [], creditLedger: [], referrals: [], coupons: DEFAULT_COUPONS,
             jobs: [], bills: [], billSeq: 1000 };
  }
  function load() {
    if (REMOTE) { data = blank(); return; } // remote cache is filled by init()
    try { data = JSON.parse(localStorage.getItem(KEY)); } catch (e) { data = null; }
    if (!data || !Array.isArray(data.users)) data = blank();
    if (!Array.isArray(data.coupons) || !data.coupons.length) data.coupons = DEFAULT_COUPONS;
    if (!Array.isArray(data.jobs)) data.jobs = [];
    if (!Array.isArray(data.bills)) data.bills = [];
    if (typeof data.billSeq !== 'number') data.billSeq = 1000;
    // Backfill: orders created before jobs & bills existed get both, automatically.
    let backfilled = false;
    data.orders.forEach((o) => {
      if (!data.jobs.some(j => j.orderId === o.id)) { createJobForOrder(o); backfilled = true; }
      if (!data.bills.some(b => b.orderId === o.id)) { createBillForOrder(o); backfilled = true; }
    });
    if (backfilled) save();
  }
  function save() { if (REMOTE) return; localStorage.setItem(KEY, JSON.stringify(data)); }

  const uid = (p) => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // Catalogue prices are quoted for the Indian baseline. Visitors from pricier
  // markets are scaled up once, here, so every downstream calculation (coupons,
  // clubbing premium, credits, the Razorpay charge) works on one number.
  const MARKET_MULT = (window.Geo && window.Geo.market.mult) || 1;
  if (MARKET_MULT !== 1) {
    SERVICES.forEach((s) => { s.price = Math.round(s.price * MARKET_MULT); });
    PACKAGES.forEach((p) => { p.price = Math.round(p.price * MARKET_MULT); });
  }

  // Amounts held in the system are always the INR we actually charge. Abroad we
  // lead with the local figure; the rupee amount rides along wherever it matters.
  const inr = (n) => (window.Geo ? window.Geo.show(n) : '₹' + Number(n).toLocaleString('en-IN'));
  const inrRaw = (n) => '₹' + Number(n).toLocaleString('en-IN');

  load(); // after uid/inr — load() may backfill jobs & bills for old orders

  /* ---- users & sessions ---- */

  function upsertUserByEmail({ email, name, picture, provider }) {
    email = String(email || '').trim().toLowerCase();
    let user = data.users.find(u => u.email === email);
    let isNew = false;
    if (!user) {
      user = {
        id: uid('usr'), email, name: name || email.split('@')[0], picture: picture || '',
        provider: provider || 'demo', business: '', referralCode: null,
        createdAt: new Date().toISOString()
      };
      data.users.push(user);
      isNew = true;
    } else {
      if (name) user.name = name;
      if (picture) user.picture = picture;
    }
    save();
    return { user, isNew };
  }

  function getUser(id) { return data.users.find(u => u.id === id) || null; }
  function updateUser(id, patch) {
    const u = getUser(id); if (!u) return null;
    Object.assign(u, patch); save(); return u;
  }

  function setSession(userId) { localStorage.setItem(SESSION_KEY, userId); }
  function getSession() {
    const id = localStorage.getItem(SESSION_KEY);
    return id ? getUser(id) : null;
  }
  function clearSession() { localStorage.removeItem(SESSION_KEY); }

  /* ---- orders ---- */

  function createOrder({ userId, serviceId, serviceName, amount, discount, couponCode, creditsUsed, payable, paymentId, method }) {
    const order = {
      id: uid('ord'), userId, serviceId, serviceName,
      amount, discount: discount || 0, couponCode: couponCode || null,
      creditsUsed: creditsUsed || 0, payable, paymentId: paymentId || null,
      method: method || 'razorpay', status: 'paid',
      createdAt: new Date().toISOString()
    };
    data.orders.push(order);
    if (order.creditsUsed > 0) {
      data.creditLedger.push({
        id: uid('cr'), userId, amount: -order.creditsUsed,
        reason: 'Redeemed on ' + serviceName, date: new Date().toISOString()
      });
    }
    createJobForOrder(order);   // job sheet entry, with a due date from the service timeline
    createBillForOrder(order);  // bill is generated automatically on every order
    save();
    return order;
  }

  /* ---- jobs (admin job sheet) ---- */

  function createJobForOrder(order) {
    const days = TIMELINES[order.serviceId] || 14;
    const due = new Date(order.createdAt || Date.now());
    due.setDate(due.getDate() + days);
    const job = {
      id: uid('job'), orderId: order.id, userId: order.userId,
      serviceName: order.serviceName, status: 'queued',
      createdAt: order.createdAt || new Date().toISOString(),
      dueAt: due.toISOString(), issues: [],
      updatedAt: new Date().toISOString()
    };
    data.jobs.push(job);
    return job;
  }

  function allJobs() {
    return data.jobs.slice().sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  }
  function jobsFor(userId) { return data.jobs.filter(j => j.userId === userId); }
  function updateJob(id, patch) {
    const j = data.jobs.find(x => x.id === id); if (!j) return null;
    Object.assign(j, patch, { updatedAt: new Date().toISOString() });
    save(); return j;
  }
  function addJobIssue(id, text) {
    const j = data.jobs.find(x => x.id === id); if (!j || !text) return null;
    j.issues.push({ id: uid('iss'), text, open: true, date: new Date().toISOString() });
    j.updatedAt = new Date().toISOString();
    save(); return j;
  }
  function resolveJobIssue(jobId, issueId) {
    const j = data.jobs.find(x => x.id === jobId); if (!j) return null;
    const i = j.issues.find(x => x.id === issueId); if (i) i.open = false;
    j.updatedAt = new Date().toISOString();
    save(); return j;
  }

  // Alerts for the admin: delays, open issues, and jobs due soon.
  function jobAlerts() {
    const now = Date.now();
    const soon = now + 48 * 3600 * 1000;
    const alerts = [];
    data.jobs.forEach((j) => {
      if (j.status === 'delivered') return;
      const due = new Date(j.dueAt).getTime();
      const openIssues = j.issues.filter(i => i.open);
      if (due < now) {
        alerts.push({ level: 'delayed', jobId: j.id, text: j.serviceName + ' is overdue by ' + Math.ceil((now - due) / 86400000) + ' day(s)' });
      } else if (due < soon) {
        alerts.push({ level: 'due-soon', jobId: j.id, text: j.serviceName + ' is due within 48 hours' });
      }
      openIssues.forEach((i) => {
        alerts.push({ level: 'issue', jobId: j.id, text: j.serviceName + ': ' + i.text });
      });
    });
    return alerts;
  }

  /* ---- bills (auto-generated invoices) ---- */

  function createBillForOrder(order) {
    data.billSeq += 1;
    const bill = {
      id: uid('bill'), number: 'INV-' + new Date(order.createdAt || Date.now()).getFullYear() + '-' + data.billSeq,
      orderId: order.id, userId: order.userId,
      date: order.createdAt || new Date().toISOString(),
      items: [{ label: order.serviceName, amount: order.amount }],
      discount: order.discount || 0, couponCode: order.couponCode || null,
      creditsUsed: order.creditsUsed || 0, total: order.payable,
      paymentId: order.paymentId || null, method: order.method || 'razorpay', status: 'paid'
    };
    data.bills.push(bill);
    return bill;
  }

  function billsFor(userId) {
    return data.bills.filter(b => b.userId === userId).sort((a, b) => b.date.localeCompare(a.date));
  }
  function allBills() { return data.bills.slice().sort((a, b) => b.date.localeCompare(a.date)); }
  function getBill(id) { return data.bills.find(b => b.id === id) || null; }

  /* ---- admin ---- */

  function isAdmin(user) {
    if (!user) return false;
    if (user.isAdmin === true) return true; // remote: flag comes from the database
    const admins = (window.INDIZILLA_CONFIG && window.INDIZILLA_CONFIG.adminEmails) || [];
    return admins.map(e => e.toLowerCase()).includes(String(user.email).toLowerCase());
  }
  function listUsers() { return data.users.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
  function allOrders() { return data.orders.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }

  function listAllCoupons() { return data.coupons.slice(); }
  function upsertCoupon(c) {
    c.code = String(c.code || '').trim().toUpperCase();
    if (!c.code) return { ok: false, error: 'Code required' };
    const existing = data.coupons.find(x => x.code === c.code);
    if (existing) Object.assign(existing, c); else data.coupons.push(Object.assign({ active: true }, c));
    save();
    return { ok: true };
  }
  function setCouponActive(code, active) {
    const c = data.coupons.find(x => x.code === code);
    if (c) { c.active = active; save(); }
  }

  /* ---- à la carte cart quote & package upsell ---- */

  function cartQuote(ids) {
    const items = ids.map(id => SERVICES.find(s => s.id === id)).filter(Boolean);
    const subtotal = items.reduce((s, x) => s + x.price, 0);

    // Which package do these items overlap the most?
    let best = null;
    PACKAGES.forEach((p) => {
      const covered = items.filter(i => p.includes.includes(i.id));
      if (covered.length >= 2 && (!best || covered.length > best.covered.length)) {
        best = { pkg: p, covered };
      }
    });

    // Clubbing premium on items that belong to the recommended package.
    let premium = 0;
    if (best) premium = Math.round(best.covered.reduce((s, x) => s + x.price, 0) * CLUB_PREMIUM);
    const total = subtotal + premium;

    let recommendation = null;
    if (best) {
      const extras = best.pkg.includes
        .filter(id => !ids.includes(id))
        .map(id => (SERVICES.find(s => s.id === id) || {}).name)
        .filter(Boolean);
      recommendation = {
        pkg: best.pkg,
        coveredNames: best.covered.map(i => i.name),
        extras,
        savings: total - best.pkg.price
      };
    }
    return { items, subtotal, premium, total, recommendation };
  }

  function ordersFor(userId) {
    return data.orders.filter(o => o.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /* ---- credits ---- */

  function creditBalance(userId) {
    return data.creditLedger.filter(e => e.userId === userId)
      .reduce((s, e) => s + e.amount, 0);
  }
  function creditHistory(userId) {
    return data.creditLedger.filter(e => e.userId === userId)
      .sort((a, b) => b.date.localeCompare(a.date));
  }
  function addCredit(userId, amount, reason) {
    data.creditLedger.push({ id: uid('cr'), userId, amount, reason, date: new Date().toISOString() });
    save();
  }

  /* ---- coupons ---- */

  function validateCoupon(code, amount) {
    code = String(code || '').trim().toUpperCase();
    const c = data.coupons.find(x => x.code === code && x.active !== false);
    if (!c) return { ok: false, error: 'That code isn’t valid.' };
    if (amount < (c.minAmount || 0)) {
      return { ok: false, error: 'This code needs an order of ' + inr(c.minAmount) + ' or more.' };
    }
    let discount = c.type === 'percent' ? Math.round(amount * c.value / 100) : c.value;
    if (c.maxDiscount) discount = Math.min(discount, c.maxDiscount);
    discount = Math.min(discount, amount);
    return { ok: true, discount, coupon: c };
  }
  function listCoupons() { return data.coupons.filter(c => c.active !== false); }

  /* ---- referrals ---- */

  function quarterKey(d) {
    d = d || new Date();
    return d.getFullYear() + '-Q' + (Math.floor(d.getMonth() / 3) + 1);
  }

  function ensureReferralCode(userId) {
    const u = getUser(userId); if (!u) return null;
    if (!u.referralCode) {
      u.referralCode = 'INDI-' + Math.random().toString(36).slice(2, 6).toUpperCase();
      save();
    }
    return u.referralCode;
  }

  function findUserByReferralCode(code) {
    code = String(code || '').trim().toUpperCase();
    return data.users.find(u => u.referralCode === code) || null;
  }

  function referralsBy(ownerId) {
    return data.referrals.filter(r => r.ownerId === ownerId)
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  function creditedThisQuarter(ownerId) {
    const q = quarterKey();
    return data.referrals.filter(r => r.ownerId === ownerId && r.quarter === q && r.credited).length;
  }

  // Called when a NEW user signs up with someone's referral code.
  function recordReferral(code, newUserId) {
    const owner = findUserByReferralCode(code);
    if (!owner) return { ok: false, error: 'Referral code not recognised.' };
    if (owner.id === newUserId) return { ok: false, error: 'You can’t refer yourself.' };
    if (data.referrals.some(r => r.newUserId === newUserId)) {
      return { ok: false, error: 'This account was already referred.' };
    }
    const newUser = getUser(newUserId);
    const credited = creditedThisQuarter(owner.id) < REFERRAL_CAP;
    data.referrals.push({
      id: uid('ref'), ownerId: owner.id, newUserId,
      newUserName: newUser ? newUser.name : '', quarter: quarterKey(),
      credited, date: new Date().toISOString()
    });
    if (credited) {
      data.creditLedger.push({
        id: uid('cr'), userId: owner.id, amount: REFERRAL_BONUS,
        reason: 'Referral bonus — ' + (newUser ? newUser.name : 'new client'),
        date: new Date().toISOString()
      });
    }
    save();
    return { ok: true, credited };
  }

  // Referral codes unlock for existing clients (at least one paid order).
  function isEligibleReferrer(userId) { return ordersFor(userId).length > 0; }

  /* ================================================================== */
  /* Remote backend (Supabase). Same method names; the in-memory `data`  */
  /* cache keeps every read synchronous, writes go to Postgres via RLS-  */
  /* guarded tables and security-definer RPCs.                           */
  /* ================================================================== */

  let sessionUserId = null;

  const mapProfile = (r) => ({ id: r.id, email: r.email, name: r.name || '', business: r.business || '',
    picture: r.picture || '', referralCode: r.referral_code, isAdmin: r.is_admin === true,
    provider: 'supabase', createdAt: r.created_at });
  const mapOrder = (r) => ({ id: r.id, userId: r.user_id, serviceId: r.service_id, serviceName: r.service_name,
    amount: r.amount, discount: r.discount, couponCode: r.coupon_code, creditsUsed: r.credits_used,
    payable: r.payable, paymentId: r.payment_id, method: r.method, status: r.status, createdAt: r.created_at });
  const mapJob = (r) => ({ id: r.id, orderId: r.order_id, userId: r.user_id, serviceName: r.service_name,
    status: r.status, dueAt: r.due_at, issues: r.issues || [], createdAt: r.created_at, updatedAt: r.updated_at });
  const mapBill = (r) => ({ id: r.id, number: r.number, orderId: r.order_id, userId: r.user_id, date: r.date,
    items: r.items || [], discount: r.discount, couponCode: r.coupon_code, creditsUsed: r.credits_used,
    total: r.total, paymentId: r.payment_id, method: r.method, status: r.status });
  const mapLedger = (r) => ({ id: r.id, userId: r.user_id, amount: r.amount, reason: r.reason, date: r.created_at });
  const mapReferral = (r) => ({ id: r.id, ownerId: r.owner_id, newUserId: r.new_user_id,
    newUserName: r.new_user_name, quarter: r.quarter, credited: r.credited, date: r.created_at });
  const mapCoupon = (r) => ({ code: r.code, type: r.type, value: r.value, maxDiscount: r.max_discount,
    minAmount: r.min_amount, active: r.active, desc: r.descr });

  async function fetchRows() {
    // RLS scopes these to the caller's own rows; admins get everything.
    const [or, jb, bl, cl, rf] = await Promise.all([
      sb.from('orders').select('*'), sb.from('jobs').select('*'), sb.from('bills').select('*'),
      sb.from('credit_ledger').select('*'), sb.from('referrals').select('*')
    ]);
    data.orders = (or.data || []).map(mapOrder);
    data.jobs = (jb.data || []).map(mapJob);
    data.bills = (bl.data || []).map(mapBill);
    data.creditLedger = (cl.data || []).map(mapLedger);
    data.referrals = (rf.data || []).map(mapReferral);
  }

  // Returning from an OAuth provider, the URL carries a code that supabase-js
  // exchanges for a session in the background. getSession() can win that race
  // and report "signed out" a beat before the session lands — which sent people
  // back to the login page holding a perfectly valid token. When the URL shows
  // we've just come back from a provider, wait for the exchange to settle.
  async function settledSession() {
    const { data: { session } } = await sb.auth.getSession();
    if (session) return session;

    const returning = /[?&]code=/.test(location.search) ||
                      /access_token=|refresh_token=|[?&]error=/.test(location.hash + location.search);
    if (!returning) return null;

    return new Promise((resolve) => {
      let done = false;
      const finish = (s) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try { sub.data.subscription.unsubscribe(); } catch (e) { /* ignore */ }
        resolve(s);
      };
      const sub = sb.auth.onAuthStateChange((_event, s) => { if (s) finish(s); });
      const timer = setTimeout(async () => {
        const { data: { session: late } } = await sb.auth.getSession();
        finish(late || null);
      }, 6000);
    });
  }

  async function remoteInit() {
    data = { users: [], orders: [], creditLedger: [], referrals: [], coupons: [], jobs: [], bills: [] };
    const cps = await sb.from('coupons').select('*');
    data.coupons = (cps.data || []).map(mapCoupon);

    const session = await settledSession();
    if (!session) { sessionUserId = null; return null; }
    sessionUserId = session.user.id;

    // The profile row is created by a DB trigger — allow a beat right after signup.
    let prof = null;
    for (let i = 0; i < 4 && !prof; i++) {
      const r = await sb.from('profiles').select('*').eq('id', sessionUserId).maybeSingle();
      prof = r.data;
      if (!prof) await new Promise(res => setTimeout(res, 500));
    }
    if (!prof) { sessionUserId = null; return null; }

    // Referral code shared before signup? Redeem it now (server enforces once-only + caps).
    let pending = null;
    try { pending = localStorage.getItem(PENDING_REF_KEY); } catch (e) { /* ignore */ }
    if (pending) {
      try { await sb.rpc('redeem_referral', { p_code: pending }); } catch (e) { /* invalid code — ignore */ }
      try { localStorage.removeItem(PENDING_REF_KEY); } catch (e) { /* ignore */ }
    }

    const me = mapProfile(prof);
    if (me.isAdmin) {
      const pr = await sb.from('profiles').select('*');
      data.users = (pr.data || []).map(mapProfile);
      if (!data.users.some(u => u.id === me.id)) data.users.push(me);
    } else {
      data.users = [me];
    }
    await fetchRows();

    // Referral codes unlock with the first order; mint one server-side if due.
    const mine = data.users.find(u => u.id === me.id);
    if (mine && !mine.referralCode && data.orders.some(o => o.userId === me.id)) {
      const r = await sb.rpc('my_referral_code');
      if (r.data) mine.referralCode = r.data;
    }
    // NOT the module-level getSession() — that one reads the demo localStorage
    // key and always returns null in remote mode.
    return data.users.find(u => u.id === sessionUserId) || null;
  }

  // Supabase matches redirect URLs against an exact allowlist. The live site is
  // registered under the bare domain, so a visitor who arrives on www (or any
  // other alias) would otherwise be handed a redirect Supabase rejects, and the
  // sign-in silently bounces back to the login page. Always hand it the
  // canonical host on production; keep the real origin for localhost/previews.
  function authBase() {
    const site = (cfg.siteUrl || '').replace(/\/+$/, '');
    if (site && /(^|\.)indizilla\.com$/i.test(location.hostname)) return site + '/';
    return location.origin + location.pathname.replace(/[^/]*$/, '');
  }

  const remote = {
    init: remoteInit,
    isRemote: true,
    client: sb,   // shared with RDB (js/research-db.js) so there's one auth client

    getSession() { return sessionUserId ? (data.users.find(u => u.id === sessionUserId) || null) : null; },
    setSession() { /* session is owned by Supabase Auth */ },
    clearSession() { sessionUserId = null; },

    async signOut() { await sb.auth.signOut(); sessionUserId = null; },

    async signInGoogle(next) {
      const base = authBase();
      await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: base + (/^(dashboard|cart|admin|research-new)\.html$/.test(next || '') ? next : 'dashboard.html') }
      });
    },

    async signInEmailOtp(email) {
      const base = authBase();
      const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: base + 'dashboard.html' } });
      if (error) throw error;
    },

    rememberPendingReferral(code) {
      if (code) { try { localStorage.setItem(PENDING_REF_KEY, code.trim().toUpperCase()); } catch (e) { /* ignore */ } }
    },

    async createOrder({ serviceId, serviceName, amount, couponCode, creditsUsed, paymentId, method }) {
      const { data: row, error } = await sb.rpc('place_order', {
        p_service_id: serviceId, p_service_name: serviceName, p_amount: amount,
        p_coupon_code: couponCode || null, p_use_credits: (creditsUsed || 0) > 0,
        p_payment_id: paymentId || null, p_method: method || 'razorpay'
      });
      if (error) throw error;
      await fetchRows(); // pull the trigger-created job, bill and ledger entry
      return mapOrder(row);
    },

    async updateJob(id, patch) {
      const upd = { updated_at: new Date().toISOString() };
      if (patch.status) upd.status = patch.status;
      if (patch.dueAt) upd.due_at = patch.dueAt;
      if (patch.issues) upd.issues = patch.issues;
      const { error } = await sb.from('jobs').update(upd).eq('id', id);
      if (error) throw error;
      const j = data.jobs.find(x => x.id === id);
      if (j) Object.assign(j, patch, { updatedAt: upd.updated_at });
      return j;
    },

    async addJobIssue(id, text) {
      const j = data.jobs.find(x => x.id === id);
      if (!j || !text) return null;
      const issues = j.issues.concat({ id: uid('iss'), text, open: true, date: new Date().toISOString() });
      return remote.updateJob(id, { issues });
    },

    async resolveJobIssue(jobId, issueId) {
      const j = data.jobs.find(x => x.id === jobId);
      if (!j) return null;
      const issues = j.issues.map(i => i.id === issueId ? Object.assign({}, i, { open: false }) : i);
      return remote.updateJob(jobId, { issues });
    },

    async addCredit(userId, amount, reason) {
      const { error } = await sb.rpc('admin_adjust_credits', { p_user_id: userId, p_amount: amount, p_reason: reason });
      if (error) throw error;
      data.creditLedger.push({ id: uid('cr'), userId, amount, reason, date: new Date().toISOString() });
    },

    async updateUser(id, patch) {
      const { error } = await sb.from('profiles')
        .update({ name: patch.name, business: patch.business }).eq('id', id);
      if (error) throw error;
      const u = data.users.find(x => x.id === id);
      if (u) Object.assign(u, patch);
      return u;
    },

    ensureReferralCode(userId) {
      const u = data.users.find(x => x.id === userId);
      return u ? u.referralCode : null; // minted during init once the first order exists
    },

    async upsertCoupon(c) {
      const code = String(c.code || '').trim().toUpperCase();
      if (!code) return { ok: false, error: 'Code required' };
      const { error } = await sb.from('coupons').upsert({
        code, type: c.type, value: c.value, max_discount: c.maxDiscount || null,
        min_amount: c.minAmount || 0, active: c.active !== false, descr: c.desc || ''
      });
      if (error) return { ok: false, error: error.message };
      const existing = data.coupons.find(x => x.code === code);
      const mapped = { code, type: c.type, value: c.value, maxDiscount: c.maxDiscount || null,
        minAmount: c.minAmount || 0, active: c.active !== false, desc: c.desc || '' };
      if (existing) Object.assign(existing, mapped); else data.coupons.push(mapped);
      return { ok: true };
    },

    async setCouponActive(code, active) {
      const { error } = await sb.from('coupons').update({ active }).eq('code', code);
      if (error) throw error;
      const c = data.coupons.find(x => x.code === code);
      if (c) c.active = active;
    }
  };

  const api = {
    SERVICES, PACKAGES, REFERRAL_BONUS, REFERRAL_CAP, inr, inrRaw,
    upsertUserByEmail, getUser, updateUser,
    setSession, getSession, clearSession,
    createOrder, ordersFor,
    creditBalance, creditHistory, addCredit,
    validateCoupon, listCoupons,
    quarterKey, ensureReferralCode, findUserByReferralCode,
    referralsBy, creditedThisQuarter, recordReferral, isEligibleReferrer,
    allJobs, jobsFor, updateJob, addJobIssue, resolveJobIssue, jobAlerts,
    billsFor, allBills, getBill,
    isAdmin, listUsers, allOrders, listAllCoupons, upsertCoupon, setCouponActive,
    cartQuote,
    // demo-mode defaults for the async surface; remote mode overrides below
    isRemote: false,
    init: async () => getSession(),
    signOut: async () => { clearSession(); },
    signInGoogle: async () => {},
    signInEmailOtp: async () => {},
    rememberPendingReferral: () => {}
  };
  if (REMOTE) Object.assign(api, remote);
  return api;
})();
