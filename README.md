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

## Indizilla Research

An AI-simulated market-research product folded into the same site: a user
describes an idea and a decision, defines an audience, and a panel of synthetic
personas answers a generated survey, producing a **decision memo** (verdict,
evidence, top objection, next test). Study credits are a **separate currency**
from the ₹ referral credits above.

**Pages** — `research.html` (landing), `research-pricing.html` (credit packs),
`research-sample.html` (example memo), `research-methodology.html` (how it works
+ limits), `research-new.html` (3-step wizard, behind login), `research-report.html`
(the memo + follow-up chat). The Research tab in `dashboard.html` handles buying
credits and listing studies; `admin.html` gets an all-studies overview.

**Data layer** — `js/research-db.js` (`window.RDB`) mirrors `js/db.js`'s
two-backend shape (Supabase / localStorage demo) and **reuses DB's Supabase
client** (`DB.client`) so there is one auth session per page. New tables:
`research_packs` (seeded), `research_studies`, `research_credit_ledger`. New
security-definer RPCs (in `supabase/migration.sql`): `buy_research_credits`,
`create_study`, `save_study_result`, `research_followup`,
`research_credit_balance`, `admin_adjust_research_credits`. Prices and mode costs
live server-side — the browser can't invent a free study or a discount.

**The simulation is a mock, on purpose** — `js/research-engine.js` generates the
study-fit check, audience inference, survey, persona panel and memo entirely
client-side, seeded from the inputs so a study is deterministic. Credit deduction
and persistence are already server-authoritative via the RPCs. To go live, swap
the engine's `generateSurvey` / `simulatePanel` / `synthesizeMemo` /
`followupAnswer` for a Supabase Edge Function calling an LLM — the return shapes
are the contract the UI depends on; keep them.

**Credit model** — packs: Starter ₹399/450cr, Growth ₹899/1050cr, Pro
₹1,499/1,900cr. Study modes: Quick Pulse 50 personas/100cr, Pulse Plus 100/200,
Signal Plus 200/400, Prism 400/900. A follow-up question costs 2 credits. Credits
never expire. Credit purchases don't yet generate a `bill` (the order trigger
would spawn a meaningless job) — the research ledger is the record; wiring an
invoice for purchases is a future enhancement.

> Re-running `supabase/migration.sql` (step 1 above) also creates all Research
> tables, RPCs and RLS — it's one idempotent file.
