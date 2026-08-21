// Indizilla — first-party page views.
//
// The whole record: path, referrer host, coarse screen bucket. No cookies, no
// identifiers, no fingerprinting — nothing here can be joined to a person,
// which is what lets the privacy policy describe measurement in one sentence.
// Fails silently: measurement must never cost a visitor anything.
(() => {
  try {
    const cfg = window.INDIZILLA_CONFIG || {};
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) return;
    if (navigator.doNotTrack === '1' || window.doNotTrack === '1') return;

    const w = window.innerWidth;
    const record = {
      path: location.pathname.replace(/\.html$/, '') || '/',
      ref: document.referrer ? new URL(document.referrer).hostname : null,
      screen: w < 480 ? 'phone' : w < 1024 ? 'tablet' : 'desktop'
    };
    // Own-site hops aren't acquisition data.
    if (record.ref === location.hostname) record.ref = null;

    const url = cfg.supabaseUrl.replace(/\/+$/, '') + '/rest/v1/page_views';
    const body = JSON.stringify(record);
    // sendBeacon can't carry headers; PostgREST needs the apikey, so use
    // keepalive fetch — same survive-the-navigation semantics.
    fetch(url, {
      method: 'POST',
      keepalive: true,
      headers: {
        apikey: cfg.supabaseAnonKey,
        Authorization: 'Bearer ' + cfg.supabaseAnonKey,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body
    }).catch(() => { /* table absent or offline — never the visitor's problem */ });
  } catch (e) { /* never the visitor's problem */ }
})();
