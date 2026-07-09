# Indizilla — indizilla.com

Marketing site + client platform (dashboard, à la carte, admin console, jobs, bills,
credits, referrals). Static frontend; Supabase for database + auth; Razorpay for payments.

## Go-live checklist

### 1. Database (one-time)
Open the [Supabase SQL Editor](https://supabase.com/dashboard/project/iykuvppjmmatsvrrtwra/sql),
paste the whole of `supabase/migration.sql`, press **Run**. Safe to re-run.

### 2. Keys → `js/config.js`
| Key | Where to get it |
|---|---|
| `supabaseAnonKey` | Supabase → Project Settings → API Keys → publishable/anon key |
| `razorpayKeyId` | Razorpay Dashboard → Settings → API Keys (`rzp_test_…` first, switch to `rzp_live_…` when ready) |

While `supabaseAnonKey` is empty the site runs in local demo mode (per-browser data).

### 3. Google login (inside Supabase, not in code)
Supabase Dashboard → **Authentication → Providers → Google** → paste your Google
OAuth **client ID and client secret**. In Google Cloud Console the OAuth client
must list this authorized redirect URI:

```
https://iykuvppjmmatsvrrtwra.supabase.co/auth/v1/callback
```

Then in Supabase → **Authentication → URL Configuration** set:
- Site URL: `https://indizilla.com`
- Additional redirect URLs: your `*.vercel.app` URL and `http://localhost:4173`

### 4. Deploy
Push to `main` → Vercel auto-deploys (repo imported at vercel.com/new on the
`ancoryen-6773` account). Custom domain: Vercel project → Settings → Domains →
add `indizilla.com` and `www.indizilla.com`; at your DNS registrar add
`A @ 76.76.21.21` and `CNAME www cname.vercel-dns.com`.

## Super admins
Set in `supabase/migration.sql` (`admin_email_list()`):
`ashishnarayan9110@gmail.com`, `ancor.yen@gmail.com`. Admin rights are enforced
by the database (RLS), not the frontend.

## Architecture notes
- `js/db.js` — one data API, two backends: Supabase (when anon key present) or
  localStorage demo. Reads are synchronous from an in-memory cache filled by
  `DB.init()`; writes go through RLS-guarded tables and security-definer RPCs
  (`place_order`, `redeem_referral`, `admin_adjust_credits`, `my_referral_code`).
- Orders trigger server-side creation of the job (with due date) and the bill
  (INV-year-seq) — clients can never write those tables directly.
- Coupons and credits are re-validated in Postgres at order time; the client
  math is display-only.
- Payment note: Razorpay checkout runs client-side with the key id. For
  signature verification / webhooks, add a Supabase Edge Function later —
  until then, treat payment ids in the DB as unverified references.
