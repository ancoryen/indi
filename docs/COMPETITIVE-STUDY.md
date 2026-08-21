# Indizilla — competitive study

Prepared 20 Aug 2026. Sources: the Indizilla codebase and live site (verified
directly), competitor positioning from live-site probes (NowFloats, Wix,
VistaPrint reachable and checked; GoDaddy and Fiverr bot-blocked) plus market
knowledge. **Competitor prices are indicative and must be re-verified on the
day anything is published to the site** — theirs move; ours are in `js/db.js`.

---

## 1. What kind of business this is

- **Category:** productized business-enablement platform for Indian SMBs — not
  a classic agency and not pure SaaS, but the hybrid between them.
- **Four arms under one brand:**
  1. **Productized services** — fixed-scope, fixed-price digital services
     (GBP, brand, websites, ads, CRM…) with self-serve ordering, Razorpay
     checkout, automatic bills and a client dashboard.
  2. **Build** — scoped custom work: platforms, web apps, MVPs.
  3. **Research** — a simulated market-research product (software, credits,
     margins unlike any agency line).
  4. **Print & merch** — quote-driven physical marketplace.
- **Segments served (by the site's own pricing):** owner-run local businesses,
  founders/pre-launch ventures, multi-location operations.
- **Positioning (post-reposition):** quality-led — "Get Found. Be Seen. Get
  Chosen." — premium prices kept below USD-market counterparts.
- **What that mix means competitively:** no single company competes with all
  four arms; each arm has a different set of predators. The moat candidate is
  the combination — one accountable vendor from idea (Research) to build
  (Build) to presence (Services) to physical (Print).

---

## 2. Top 5 competitors

### 1. NowFloats *(managed SMB presence, India)*
- **Who:** Indian platform that puts small businesses online — website,
  discovery, updates — sold as a managed subscription; Reliance/Jio-aligned
  distribution; enterprise + SMB tiers.
- **Systems:** mature multi-tenant platform, mobile app for the merchant,
  telecalling + field sales machine.
- **Services:** presence-in-a-box; little bespoke brand or custom build depth.
- **Pricing:** subscription-led (₹thousands/quarter, indicative; verify).
- **Their edge:** distribution and volume; a sales force Indizilla doesn't have.
- **Our edge:** craft and ownership — NowFloats customers rent presence on a
  platform; Indizilla clients own every account, file and login. Depth of
  brand/build work they don't attempt.

### 2. GoDaddy (Websites + Marketing / Airo, India) *(DIY + do-it-for-you at scale)*
- **Who:** global registrar turned SMB suite; aggressive India pricing and
  marketing; AI-assisted site building; also sells "we build it for you".
- **Systems:** domains, hosting, email, site builder, marketing tools in one
  account — deepest infrastructure integration of the five.
- **Services:** templated; the DIFY tier is production-line, not brand work.
- **Pricing:** entry plans at ₹hundreds/month (indicative; verify) — anchors
  the market's floor and shapes what "a website costs" in buyers' heads.
- **Their edge:** price anchoring, brand recall, infrastructure lock-in.
- **Our edge:** everything they templatize — identity, copy, systems design.
  A GoDaddy site is a slot in a template; ours is an argument for the business.

### 3. Wix / Wix Studio *(DIY builder, global)*
- **Who:** the strongest DIY builder brand in India's English-speaking SMB
  segment; Studio adds an agency channel.
- **Systems:** best-in-class editor, app market, bookings, e-commerce modules.
- **Services:** none first-party — the customer does the work, or hires a
  Wix partner (which is where Indizilla-shaped firms live in their world).
- **Pricing:** ₹hundreds/month per site plan (indicative; verify).
- **Their edge:** the "I'll do it myself this weekend" instinct — competing
  with our client's optimism, not with our output.
- **Our edge:** the finished thing. DIY dies at brand identity, copywriting,
  SEO discipline, and everything on our services page below the website row.

### 4. Fiverr / freelance marketplaces *(gig-priced substitutes)*
- **Who:** global gig marketplace; for an Indian SMB it is the cheapest route
  to "a logo", "a landing page", "an ad campaign" as disconnected gigs.
- **Systems:** marketplace with escrow, reviews, tiered gig packages — trust
  machinery Indizilla lacks (public reviews, ratings, delivery guarantees).
- **Services:** everything, atomized; nothing accountable end to end.
- **Pricing:** from ₹hundreds per gig — the floor below the floor.
- **Their edge:** price and apparent choice.
- **Our edge:** accountability and coherence. Ten gigs don't make a brand;
  the buyer becomes their own project manager. Our packages exist precisely
  against this fragmentation.

### 5. VistaPrint *(print + basic digital for SMBs)*
- **Who:** the default name for SMB print in India — cards, banners, merch —
  now upselling logos and basic websites.
- **Systems:** e-commerce print pipeline with instant online pricing,
  previews, and delivery logistics at national scale.
- **Services:** print first; digital is an attach.
- **Pricing:** transparent per-quantity pricing online (e.g. cards from
  ₹hundreds per 100 — indicative; verify).
- **Their edge:** instant self-serve pricing and fulfilment scale — our print
  arm quotes by callback; theirs prices in the cart.
- **Our edge:** the print is downstream of an actual identity. VistaPrint
  prints what you upload; we design what gets printed — and the same vendor
  built the brand it belongs to.

**Adjacent threats worth watching (not top-5):** Zoho (systems/CRM suite),
Canva (DIY brand + print), Justdial/IndiaMART (visibility spend), local
one-person agencies (relationship pricing), Razorpay/ONDC ecosystems
(commerce rails absorbing SMB attention).

---

## 3. Holistic comparison — systems, services, pricing

| | Indizilla | NowFloats | GoDaddy | Wix | Fiverr | VistaPrint |
|---|---|---|---|---|---|---|
| **Model** | productized hybrid | managed subscription | suite + DIY/DIFY | DIY builder | gig marketplace | print e-commerce |
| **Systems maturity** | dashboard, checkout, auto-bills, credits, research engine; young | mature platform + app | deepest infra bundle | best editor | trust/escrow machinery | print pipeline + instant pricing |
| **Service depth** | brand→build→ads→CRM→print, one vendor | shallow, wide | templated | none first-party | atomized | print only |
| **Custom build (apps/MVPs)** | **yes (Build)** | no | no | partner channel | gig-by-gig | no |
| **Research/validation product** | **yes — unique in this set** | no | no | no | survey gigs only | no |
| **Print & merch** | yes (quote-led) | no | no | no | design-only gigs | **yes (instant pricing)** |
| **Ownership stance** | client owns everything | platform-locked | infra-locked | platform-locked | per-gig | n/a |
| **Public social proof** | 3 cases, no reviews | testimonials + scale claims | massive brand | massive brand | per-seller ratings | reviews + scale |
| **Pricing display** | fixed, geo-adjusted, on-page | quote/sales-led | monthly plans | monthly plans | per gig | per quantity, instant |
| **Price position** | premium-below-USD | mid subscription | floor anchor | floor anchor | below floor | mid, volume |

**Reading of the table:**
- Nobody else holds all four arms. That is the story to sell — and currently
  the site never says it in one place.
- Every mass competitor beats us on **social proof machinery** (reviews,
  ratings, logos, volume claims). This is our widest visible gap.
- VistaPrint beats our print arm on **instant pricing**; Fiverr beats our
  services on **perceived price**; both lose on coherence — the comparison
  page we publish should be framed on coherence and ownership, not price.

---

## 4. What's lacking — the gaps list

Ordered by severity. Items marked **[verified]** were confirmed directly in
the codebase or live site during this study.

### A. Compliance & trust infrastructure (urgent — blocks money)
1. **[verified] No privacy policy, terms, or refund policy pages exist.**
   Razorpay live mode expects them; buyers and ad platforms look for them.
   Highest-priority addition on the whole list.
2. **[verified] Payments are unverified references** — no Razorpay webhook /
   signature verification; the database trusts the client's word that payment
   happened. Fine for demo, not for revenue.
3. **[verified] No business identity on the site** — no GSTIN, registered
   name, or address. Premium pricing asks for institutional trust signals.

### B. Proof & reputation (urgent — blocks conversion at premium prices)
4. **No client reviews or ratings anywhere** — and the fabricated ones were
   rightly removed, so the site currently argues quality with 3 case studies
   and zero third-party voices. Needs a real review pipeline (Google reviews
   on the GBP, imported honestly) before the premium prices feel earned.
5. **Portfolio depth: 3 cases.** Every completed engagement should ship with
   a case-study step in the delivery checklist.
6. **No client logos / "as used by" strip** (only with permission — the
   honesty tests should extend to this).

### C. Own-medicine gaps (embarrassing in sales conversations)
7. **[verified] No booking system for our own calls** — we sell booking
   systems; "book a call" is a mailto. Calendly-class embed or self-built.
8. **[verified] No CRM on our own leads** — callback/quote submissions go to
   a table (post-migration) or email; no pipeline, no follow-up automation.
   We sell exactly this.
9. **[verified] `callback_requests` migration not yet applied to production**
   — every lead currently arrives by the mailto fallback.
10. **[verified] No analytics at all** — no traffic, conversion or funnel
    measurement on a site that sells measurable marketing. One privacy-sane
    script (e.g. Plausible/Umami class) resolves it.
11. **[verified] WhatsApp is a link, not a channel** — no WhatsApp Business
    API, no catalogue, no quick replies; we sell WhatsApp Business setup.

### D. Distribution & discoverability
12. **[verified] No sitemap.xml, no robots.txt.** Trivial to add; currently
    throttles the SEO service's own credibility.
13. **No content engine** — resources page is static; no blog, no email
    capture, no newsletter, no drip. Premium positioning without content
    marketing leaves inbound to paid ads we aren't running.
14. **No self-serve print pricing** — VistaPrint converts on instant prices;
    our quote-callback loses the impatient buyer. A price-band calculator
    (still quote-confirmed) would close half the gap without lying about spec
    -dependent pricing.

### E. Product & operations
15. **[verified] Research live inference not enabled in production** — the
    engine's key isn't set, so studies run on the mock. The differentiator is
    shipped but not switched on (`node scripts/ship.mjs`, two credentials).
16. **No uptime or error monitoring** — a broken checkout would be discovered
    by a customer.
17. **Single payment rail** — Razorpay only; geo-priced markets (US 3.5×)
    can't actually pay in their currency.
18. **Bus factor of one** — sales, delivery, support and engineering converge
    on one person; the "reply within one business day" promise has no queue
    behind it.

---

## 5. What Indizilla already has that the set doesn't

For balance — the comparison isn't one-way:

- **Fixed, visible, geo-adjusted pricing on custom-grade work** — agencies
  hide prices; platforms hide humans. Both shown here.
- **A research product none of the five can answer** — idea validation as a
  first-party, margin-bearing product.
- **All four arms under one accountable vendor** — the "one throat to choke"
  a fragmented Fiverr stack can never offer.
- **The ownership stance** — everything handed over, no platform lock-in;
  the exact inverse of NowFloats/Wix/GoDaddy economics.
- **Honesty as infrastructure** — 721 automated checks including copy and
  claims guards; no fabricated testimonials, no invented metrics. Rare at
  any size.

---

## 6. Shortlist ready to add to the site ("then we will add them here")

In build order, cheapest-first within urgency:

1. **Legal pages** — privacy, terms, refund/cancellation (+ footer links,
   audit-test coverage). *Hours of work; unblocks payments credibility.*
2. **sitemap.xml + robots.txt.** *Minutes.*
3. **Run the callback migration + Razorpay webhook function.** *The two
   revenue pipes.*
4. **Analytics (privacy-sane).** *An afternoon.*
5. **Real reviews pipeline** — GBP reviews rendered honestly on-site.
6. **Book-a-call embed** on contact + /ANC.
7. **Print price-band calculator** (quote-confirmed, honestly labelled).
8. **"Why one vendor" comparison page** — the §3 table, buyer-facing, framed
   on coherence and ownership, with competitor prices re-verified same-week.
9. **Case-study-per-engagement** delivery rule + logo permission ask.
10. **Enable Research live inference** (`scripts/ship.mjs`).
