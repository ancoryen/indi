# Google Search Console — phone-friendly setup for indizilla.com

Written 20 Aug 2026, for doing on the go. Every step is tappable from a phone.
Why this matters right now: the brand search still shows the retired
"₹50,000" title from a stale index. Bing/DDG were already pushed via IndexNow;
**GSC is the only lever for Google**, and it needs your Google account.

---

## Part 1 — Verify the site (5–10 minutes)

Go to **search.google.com/search-console** on your phone, signed into the
Google account you want to own this permanently.

You'll be offered two property types. Both work; pick by how much you want to
do from the phone:

### Option A — URL-prefix property (fastest, zero DNS)

1. Choose **URL prefix**, enter exactly: `https://www.indizilla.com/`
2. On the verification screen pick **HTML tag**.
3. It shows a line like
   `<meta name="google-site-verification" content="AbC123…" />`
   **Copy just the content value** (the `AbC123…` part) and send it to me in
   chat. It is not a secret — this token is designed to sit in public page
   source; anyone can read it there anyway.
4. I add the tag to the site and deploy (≈1 minute).
5. Back in GSC, tap **Verify**. Done.

### Option B — Domain property (better long-term, needs DNS access)

Covers www + apex + http/https in one property.

1. Choose **Domain**, enter `indizilla.com`.
2. GSC gives you a TXT record (`google-site-verification=…`).
3. Add it wherever indizilla.com's DNS lives — if the domain is managed in
   Vercel: **vercel.com dashboard → Domains → indizilla.com → DNS Records →
   Add → TXT**, paste the value, save. If it's at a registrar, same idea in
   their DNS panel.
4. Tap **Verify**. DNS can take a few minutes to propagate — if it fails,
   wait ten minutes and tap Verify again; the record stays valid.

If you do Option A now, you can add the Domain property later without redoing
anything.

---

## Part 2 — First actions after verification (10 minutes)

Do these in order, same visit if possible:

1. **Submit the sitemap.** Left menu → *Sitemaps* → enter `sitemap.xml` →
   Submit. (It's live at https://www.indizilla.com/sitemap.xml — 18 URLs.)
2. **Request indexing on the money pages.** Top search bar (URL Inspection) →
   paste a URL → *Request indexing*. Google caps this around 10/day, so
   spend them in this order:
   1. `https://www.indizilla.com/`  ← kills the stale ₹50,000 title
   2. `https://www.indizilla.com/services`
   3. `https://www.indizilla.com/pricing`
   4. `https://www.indizilla.com/build`
   5. `https://www.indizilla.com/print`
   6. `https://www.indizilla.com/research`
   7. `https://www.indizilla.com/portfolio`
   8. `https://www.indizilla.com/compare`
   9. `https://www.indizilla.com/about`
   10. `https://www.indizilla.com/contact`
3. **Nothing else needs configuring today.** Ignore Enhancements/Experience
   reports until data accumulates.

---

## Part 3 — While you're at it (5 minutes, big payoff)

1. **Make the repo private.** GitHub app or github.com → `ancoryen/indi` →
   Settings → General → Danger Zone → *Change visibility* → Private.
   The repo currently **ranks #3 on your own brand search** — source code,
   commit messages and pricing history, publicly indexed. Vercel keeps
   deploying private repos; nothing breaks.
2. **Bing Webmaster Tools** (optional, 2 taps): bing.com/webmasters →
   *Import from Google Search Console*. IndexNow already pushed Bing/DDG, so
   this just adds their reporting dashboard.

---

## Part 4 — What to check on day 3–7

Back in GSC:

- **Pages** (Indexing → Pages): the 18 sitemap URLs should move to
  "Indexed". Anything under "Not indexed" with reason *"Page with redirect"*
  is fine — those are the old `.html` URLs redirecting to clean ones.
- **Search the brand** in an incognito tab: the title should now read
  *"Indizilla — Get Found. Be Seen. Get Chosen."* If the old title persists
  past a week, tell me — there are further steps (outdated-content removal
  tool), but they're rarely needed once the homepage recrawls.

## What to send back to me

| You send | I do |
|---|---|
| The meta-tag content value (Option A) | Add + deploy within the session |
| "Verified" | Nothing — proceed with Part 2 yourself |
| A screenshot of Pages report anytime | Read it and tell you what, if anything, needs action |
