// Indizilla platform configuration.
// Paste real keys here to switch from demo mode to live integrations.
window.INDIZILLA_CONFIG = {
  // Supabase — the platform database and authentication.
  // Paste the publishable/anon key from Project Settings → API Keys.
  // While the key is empty the site runs in local demo mode.
  supabaseUrl: 'https://iykuvppjmmatsvrrtwra.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5a3V2cHBqbW1hdHN2cnJ0d3JhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1ODg1MDQsImV4cCI6MjA5OTE2NDUwNH0.5RgBrsjUJbaPA-M9pxInjskl3TZ45mAFgUyIGlb8IFk',

  // Google login is configured INSIDE Supabase (Dashboard → Authentication →
  // Providers → Google: paste client ID + secret there). This field is only
  // used by the legacy non-Supabase button and can stay empty.
  googleClientId: '',

  // Razorpay key id from dashboard.razorpay.com (Settings → API Keys).
  // Test mode key — swap to rzp_live_... when going live.
  // NOTE: only the key ID belongs here. The key SECRET must never ship to the
  // browser — it lives in .env.local (gitignored) for future server-side use.
  razorpayKeyId: 'rzp_test_TBTbs7jZCH2Wpl',

  siteUrl: 'https://indizilla.com',

  // Super admin accounts — full read/write on users, jobs, bills, coupons and credits.
  adminEmails: ['ashishnarayan9110@gmail.com', 'ancor.yen@gmail.com']
};
