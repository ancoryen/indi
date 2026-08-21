# Delivery checklist — every engagement, no exceptions

The competitive study found the widest visible gap is proof: three case
studies, zero third-party voices. Proof is generated at delivery time or never,
so this checklist runs at the end of every engagement.

## At delivery confirmation

1. **Confirm delivery in writing** (email is sufficient). This is the moment
   defined in the terms: ownership transfers when delivery is confirmed AND
   full payment is received — in that order, checked, then transferred.
2. **Transfer everything at once** — domains, accounts, logins, files, repos.
   Keep the transfer email as the record. Nothing held back after transfer.

## Within one week of delivery

3. **Write the case study** — problem, approach, what shipped, lessons.
   No metrics unless the client measured them and approves the number.
   Template: the three cases on portfolio.html.
4. **Ask for the review** — one message, once:
   > "If the work earned it, a Google review helps us more than anything else
   > we could ask for. Two sentences is plenty — and if anything fell short,
   > tell us that instead, privately, and we'll fix it."
   Reviews land on the Google Business Profile. To show one on the site,
   insert it into the `reviews` table with `permission = true` only after the
   client has agreed in writing; `published = true` makes it live. The site
   renders only rows where both are true — there is no other path.
5. **Ask for logo permission** — separate, explicit question. A yes goes in
   writing before the logo appears anywhere.

## Operational notes

- Leads (callback, contact, print) land in `callback_requests` once the
  migration has run — work them newest-first, set `handled = true`.
- Payment confirmations arrive via the Razorpay webhook into
  `payment_events`; an order is trustworthy when `payment_verified = true`.
