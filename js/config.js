// Indizilla platform configuration.
// Paste real keys here to switch from demo mode to live integrations.
window.INDIZILLA_CONFIG = {
  // Supabase — the platform database and authentication.
  // Paste the publishable/anon key from Project Settings → API Keys.
  // While the key is empty the site runs in local demo mode.
  supabaseUrl: 'https://iykuvppjmmatsvrrtwra.supabase.co',
  supabaseAnonKey: '',

  // Google login is configured INSIDE Supabase (Dashboard → Authentication →
  // Providers → Google: paste client ID + secret there). This field is only
  // used by the legacy non-Supabase button and can stay empty.
  googleClientId: '',

  // Razorpay key id from dashboard.razorpay.com (Settings → API Keys). Use rzp_test_... first.
  // Leave empty to simulate payments.
  razorpayKeyId: '',

  siteUrl: 'https://indizilla.com',

  // Super admin accounts — full read/write on users, jobs, bills, coupons and credits.
  adminEmails: ['ashishnarayan9110@gmail.com']
};
