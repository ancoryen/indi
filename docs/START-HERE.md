# Start here — Indizilla handover

Everything a new session needs to work on this project confidently. Read this
top to bottom once; `README.md` is the deeper reference for the data-layer
architecture, the Research product and the original go-live checklist.

**Scope note:** `ashish.sbs` is a *different* project in a different folder
(`D:\AshishSBS-Platform`), on different GitHub / Vercel / Supabase accounts.
Nothing in this repo relates to it. If a task mentions ashish.sbs, realty or
smallbusinessforsale, it belongs in that session.

---

## 1. What this project is

**Indizilla** — a business-enablement company for small businesses, mostly
Indian, expanding internationally. Marketing site *and* a working client
platform: clients sign in, order services, pay, and track delivery.

The brand promise is the anchor for everything: *"You don't need ₹50,000 to
start looking professional."* Voice is plain and honest — short sentences, no
jargon, no fake urgency, no countdown timers. Prices are published rather
than hidden behind "contact us". This is a deliberate positioning against
traditional agencies, and copy that drifts from it should be pushed back on.

Two products live in one site:

1. **Services platform** — services, packages, à-la-carte cart, checkout,
   client dashboard, bills, job tracking, credits, referrals, admin console.
2. **Indizilla Research** — an AI-simulated market-research product. A user
   describes an idea and a decision; a panel of synthetic personas answers a
   generated survey; the output is a decision memo. Separate credit currency
   from the ₹ referral credits.

---

## 2. Stack — deliberately plain

**Static HTML/CSS/vanilla JS.** No framework, no build step, no bundler, no
`node_modules`. Files are served exactly as written.

| Layer | Choice |
|---|---|
| Frontend | Hand-written HTML, one stylesheet (`css/style.css`), ES modules-free plain JS on `window.*` globals |
| Backend | **Supabase** — Postgres + Auth + RLS. No server of our own |
| Auth | Supabase Auth: **Google OAuth** + email magic link |
| Payments | **Razorpay** checkout, client-side, **test mode** |
| Hosting | Vercel static (`vercel.json` sets `cleanUrls`) |
| Local dev | `npx http-server -p 4173` (see `.claude/launch.json`) |

Why it matters: there is nothing to compile. Edit a file, refresh, done. Any
proposal to add a framework should be weighed against that.

---

## 3. Accounts & infrastructure

**Identifiers only — no secrets in this repo.** See §4.

| Service | Account / identifier |
|---|---|
| **Local checkout** | `D:\INDIZILLA` — the only folder needed |
| **GitHub** | `ancoryen` → `indi`, branch `main` |
| **Vercel** | account `ancoryen-6773`, project `indi`, prod URL `indi-five.vercel.app` |
| **Supabase** | project ref `iykuvppjmmatsvrrtwra` — most likely under `ancor.yen@gmail.com` (**unverified**, see §9) |
| **Registrar / DNS** | **Hostinger** |
| **Payments** | Razorpay — **test mode** (`rzp_test_…`) |
| **Google OAuth** | client `867046311743-uq0kd82nv1qbf3igu28p9jaeh60nuq4r`, configured *inside Supabase*, not in code |
| **Super admins** | `ashishnarayan9110@gmail.com`, `ancor.yen@gmail.com` — enforced by the database, not the frontend |

### Live DNS (edited in Hostinger, never in Vercel)

| Type | Name | Value |
|---|---|---|
| A | `@` | `76.76.21.21` |
| CNAME | `www` | `cname.vercel-dns.com` |

`indizilla.com` currently **308s to `www.indizilla.com`**, which serves
production. See §9 — the apex should probably be primary instead.

---

## 4. Secrets — where they live

Nothing secret is committed. Three locations:

- **`js/config.js`** — *is* committed, and holds the Supabase **anon key**
  and Razorpay **key id**. Both are publishable-by-design and safe in a
  browser; the anon key is useless without RLS permission. Do not add
  anything else here.
- **`.env.local`** (gitignored) — `RAZORPAY_KEY_SECRET` for future
  server-side signature verification. **This must never reach the browser.**
- **Supabase dashboard** — Google OAuth client secret, service-role key.

---

## 5. Running it

```bash
npx --yes http-server -p 4173 -c-1 .
```

Then http://localhost:4173. No install step.

**Local dev hits the live production database.** There is no separate dev
project, so any order placed locally creates real rows visible in the live
admin console. `http://localhost:4173/**` is in the Supabase redirect
allowlist so Google sign-in works locally.

Note for agent sessions: the Browser pane in this environment has been
unreliable (hidden pane → screenshots and JS evaluation time out). Most
verification here has been done with `curl` and by evaluating JS through the
preview tool when the pane cooperated.

---

## 6. Architecture

```
*.html                 every page, hand-written, sharing one header/footer pattern
css/style.css          the entire design system — tokens, components, responsive
js/config.js           keys + admin emails (committed, publishable values only)
js/geo.js              market detection and price conversion — loads before db.js
js/db.js               core data API: Supabase backend + localStorage demo fallback
js/auth.js             sign-in/out, route guards, post-login redirect
js/payments.js         Razorpay checkout wrapper
js/cart.js             à-la-carte cart, clubbing premium, package upsell
js/dashboard.js        client dashboard (orders, bills, credits, referrals)
js/admin.js            admin console (users, jobs, bills, coupons, credits)
js/bills.js            invoice rendering/printing
js/research-*.js       the Research product (db, engine, wizard, report, admin)
supabase/migration.sql the entire database — idempotent, safe to re-run
```

### The data layer is the thing to understand first

`js/db.js` exposes **one API with two backends**. If `supabaseAnonKey` is
set, it talks to Supabase; if not, it falls back to a localStorage demo so
the site is fully browsable with no backend. Both expose identical method
names.

- Pages call `await DB.init()` first. That fills an in-memory cache, so all
  **reads are synchronous** afterwards.
- **Writes go through security-definer RPCs**, never direct table writes:
  `place_order`, `redeem_referral`, `admin_adjust_credits`,
  `my_referral_code`, plus the research set.
- **Server-side integrity:** inserting an order fires a trigger that creates
  the job (with a due date from a per-service timeline) and the bill
  (`INV-year-seq`), and deducts credits. Clients cannot write jobs or bills.
- Coupons and credit balances are **re-validated in Postgres** at order
  time. Client-side math is display only.

`js/research-db.js` (`window.RDB`) mirrors the same shape and **reuses
`DB.client`** so there's a single auth session per page.

### Business rules — encoded, don't guess at them

- **Referrals:** ₹500 internal credits per referral, capped at **3 credited
  per quarter**, unlocked only after the referrer's first paid order.
- **À-la-carte clubbing premium:** picking 2+ services that sit inside the
  same package costs **+25%** on those items, and the nearest package is
  recommended. Upsell only — never quietly downgrade.
- **Market pricing:** India is the **baseline and the floor**. Visitors from
  pricier markets are scaled up by a per-market multiplier; anything at or
  below Indian rates stays at the Indian price. 21 markets defined in
  `js/geo.js`. Detection: saved manual choice → IP lookup (ipapi.co, cached
  7 days) → timezone → browser locale → India.
- **Money display:** the storefront shows local currency; **credits, bills
  and the admin console stay in ₹** because they're an internal rupee ledger
  and an audit trail. `DB.inr()` converts, `DB.inrRaw()` does not.
- **Charging is always in INR** via Razorpay. The local price is display
  with the rupee amount alongside it.

### Brand system (`css/style.css`)

Archivo (display) + Inter (body). Acid lime `#DAFE31` as the single accent —
CTAs, focus rings, highlights only. Radii 4/6/10. Dark mode is an
**explicit, persisted toggle**, never silent auto-detect — the brand bible
requires a visible control. The brand promise line localises per market via
`data-anchor` (a US visitor reads "$5,000", not a converted ₹50,000).

---

## 7. Operational gotchas — read before touching infra

**Two GitHub accounts on this machine.** This repo is `ancoryen`;
ashish.sbs is `ashishnarayan9110-gif`. Git Credential Manager otherwise
reuses whichever was cached last and pushes 403. Already pinned:

```bash
git config credential.https://github.com.username ancoryen
```

**The domain was hijacked once.** `indizilla.com` was claimed by a project
on a *different* Vercel account serving a placeholder ("Hello Bos"). Fixed by
removing the domain there and proving ownership with `_vercel` TXT records.
If the site ever serves the wrong content, check which Vercel project owns
the domain before anything else.

**Vercel/Supabase MCP servers here point at the old accounts.** The Vercel
CLI on this machine is logged in as `ashishnarayan9110-gif` and cannot see
`ancoryen-6773`. `.mcp.json` configures a project-scoped Supabase MCP for
`iykuvppjmmatsvrrtwra`, but it needs a one-time browser OAuth in an
interactive session before it works.

**Push to `main` = deploy to production.** No staging.

**`migration.sql` is idempotent** — safe to re-run in full, and that is the
intended way to apply schema changes. There is no migration tool. Audited
30 Jul 2026: every table is `create table if not exists`, every seed is
`on conflict do nothing`, the bill sequence is `if not exists` so invoice
numbers never rewind, and the only data write is the super-admin flag update.
Nothing truncates or drops a table.

**`migration.sql` is UTF-8 with no BOM, and it contains `₹`.** Windows
PowerShell 5.1's `Get-Content` defaults to the ANSI codepage for BOM-less
files, which silently mangles all eight rupee symbols into mojibake. Copy it
with an explicit encoding, never bare `Get-Content`:

```powershell
Set-Clipboard -Value ([System.IO.File]::ReadAllText('D:\INDIZILLA\supabase\migration.sql', (New-Object System.Text.UTF8Encoding $false)))
```

A correct read is 26,900 chars and 8 `₹`; an ANSI read is 26,930 and zero.

---

## 8. What changed recently (Jul 2026)

Newest first, all deployed and verified live:

`b32155a` — **Fixed the silent sign-in bounce.** Returning from Google, the
URL carries a `?code=` that supabase-js exchanges for a session
*asynchronously*. `init()` called `getSession()` immediately, sometimes won
that race, saw no session and redirected to login — moments before the
exchange wrote a valid token. `settledSession()` now waits for the exchange,
but only when the URL shows a provider return, so anonymous visits stay fast
(measured 219ms). **Deployed but never confirmed by a real sign-in — see §9.**

`875caf8` — **Free browsing; sign-in at the point of action.** The research
wizard no longer demands login before rendering: anyone can describe an idea,
shape the audience and see the cost; the launch button becomes the sign-in
step and the full draft is restored afterwards. The cart already worked this
way (gated at Pay). Also: OAuth redirects now always use the canonical host
on production, since Supabase matches redirect URLs exactly and only the bare
domain is allowlisted — a visitor on `www` was being handed a redirect
Supabase rejects. Plus IP-based market detection.

`dfe0b4e` — **Header fix, nav trimmed to six.** The wordmark could be
squeezed by the nav and overlapped it; brand is now `flex-shrink:0` and the
hamburger takes over at 1150px instead of 960px. Nav dropped Resources and
Contact (both in the footer; the Get Started button goes to contact).

`224f985` — **Market-aware pricing** (`js/geo.js`, 21 markets) and the
à-la-carte page merged into Services in the nav.

---

## 9. Open items — read this before planning work

**① ~~Research is broken in production.~~ Fixed 30 Jul 2026.** The three
research tables were missing (404) because `migration.sql` had not been
re-run since the Research feature was added. The full file has now been run.
Verified: all three tables return 200; packs seeded correctly; all six
research RPCs present and rejecting anonymous callers; direct anon writes to
`research_studies` and `research_credit_ledger` denied at the grant level;
anon cannot mint a credit pack (RLS). The Research flow has still not been
exercised by a signed-in user — that's part of ② below.

**② Sign-in has never been confirmed working.** The race-condition fix is
deployed but no successful end-to-end Google sign-in has been observed. This
also blocks testing the dashboard, admin console and research wizard. **This
is the highest-value thing to verify first:** open
https://indizilla.com/login.html, click Continue with Google, and see what
happens. Earlier symptom was a silent bounce back to the login page.

**③ The apex should probably be primary.** `indizilla.com` 308s to `www`,
but every canonical tag, OG URL and the Supabase redirect allowlist use the
bare domain. Set apex as Primary in Vercel → Settings → Domains, or add
`https://www.indizilla.com/**` to the Supabase allowlist.

**④ Payments are unverified test-mode.** Razorpay runs client-side with the
key id only; there is no signature verification or webhook, so payment ids in
the database are unverified references. Real money needs a Supabase Edge
Function using `RAZORPAY_KEY_SECRET`, plus a switch to `rzp_live_…`.

**⑤ The Research simulation is a deliberate mock.** `js/research-engine.js`
generates the survey, panel and memo client-side, seeded from inputs so a
study is deterministic. Credit deduction and persistence are already
server-authoritative. To go live, swap `generateSurvey` / `simulatePanel` /
`synthesizeMemo` / `followupAnswer` for an Edge Function calling an LLM —
**keep the return shapes**, they're the contract the UI depends on.

**⑥ Market multipliers are estimates.** US 3.5×, UK 3.2×, UAE 2.5× and so
on in `js/geo.js` were my approximations of relative market rates, never
reviewed as a business decision. FX rates are hardcoded and drift — one
table at the top of the file, worth refreshing quarterly.

**⑦ Referral credits don't scale by market.** ₹500 is fixed server-side, so
it's worth proportionally less to a US client. Deliberate (credits are an
internal rupee ledger) but worth revisiting.

**⑧ Which Supabase account owns the project is unverified.** Inferred as
`ancor.yen@gmail.com` from the pattern of the other new accounts. The
dashboard URL works regardless:
https://supabase.com/dashboard/project/iykuvppjmmatsvrrtwra

**⑨ Credit purchases don't generate a bill** — the order trigger would spawn
a meaningless job. The research ledger is the record.

---

## 10. House style

- Plain English, short sentences. No jargon, no hype, **no fake urgency** —
  no countdown timers or "limited offer". This is a brand rule, not taste.
- Publish prices. Never "contact us for pricing".
- One accent-coloured CTA per view.
- Dark mode stays an explicit toggle.
- Business rules live in the database, not the browser. If a rule can be
  bypassed by editing JS in devtools, it's in the wrong place.
- Match surrounding code — this is hand-written vanilla JS with a consistent
  style; follow it rather than introducing new patterns.
- Confirm before anything irreversible: production database writes, DNS
  changes, domain moves, force pushes.
