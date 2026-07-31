# Shipping Research v2 — live inference

Everything that can be automated is automated. Deployment is one command; the
only thing that cannot be scripted is issuing two credentials, because both
require a logged-in browser session on an account that is yours.

Written 30 Jul 2026.

---

## What runs where

```
browser                          Edge Function              Anthropic
─────────────────────────────    ──────────────────────     ───────────────
roster (deterministic)      ──▶  reads study row for n  ──▶ Sonnet 5  ×N/10
                                 (the browser must not
                                  choose the panel size)
graph assembly              ◀──  persona responses
evidence engine (arithmetic)
strategist request          ──▶  forwards                ──▶ Opus 5   ×1
verify → keep or discard    ◀──  judgement
views
```

The API key lives only as a Supabase secret. It never reaches `js/config.js`,
which is committed.

**Nothing here is trusted blindly.** Generated judgement goes through the same
verifier as before: a strategist that asserts a figure the evidence does not
contain is discarded in favour of the rules baseline. A study always completes,
and `graph.meta.engine` records whether it was `live` or `mock`.

---

## Deploy

One command. It applies the migration, sets the secret, deploys the function and
verifies all three:

```bash
SUPABASE_ACCESS_TOKEN=sbp_... ANTHROPIC_API_KEY=sk-ant-... node scripts/ship.mjs
```

Two credentials are needed and neither can be obtained programmatically:

- **Supabase access token** — https://supabase.com/dashboard/account/tokens →
  Generate new token. Issuing it requires a logged-in browser session on the
  account that owns the project. This one token covers all three deploy steps.
- **Anthropic API key** — https://console.anthropic.com/settings/keys. It bills
  your account, so it has to be yours. Set a spend limit while you are there.

Both are read from the environment by the script and are never printed, logged
or written to disk. Re-running is safe: the migration is idempotent, the secret
upserts, the function redeploys in place.

If it finishes with errors, the output says which step failed and why.

---

## What to watch on the first live runs

| Signal | Where | What it means |
|---|---|---|
| `meta.engine` | graph meta | `live` or `mock`. Silent fallback is the thing to catch. |
| `meta.missingResponses` | graph meta | Personas the model failed to return. Non-zero means batches are dropping. |
| `meta.usage` | graph meta | Real token cost. Compare against the ₹ estimates in RESEARCH-ENGINE-V2 §6. |
| `strategistNote` | strategy | Live strategist unavailable, fell back to rules. |
| `provenance.rejectedGenerated` | memo footer | The model fabricated a figure and was discarded. **Worth reading — this is the verifier earning its keep.** |

---

## Known rough edges, deliberately shipped

- **Personas are generated in batches of ten**, not one call each. One call per
  persona would be ~200 round trips and exceed the function's wall clock.
  Personas in a batch share a context and so correlate somewhat. Worth
  measuring against a real panel before changing.
- **The strategist is Opus 5 with a rules fallback.** If generated judgement
  fails verification the memo still renders, from rules. Check
  `provenance.producedBy` to see which ran.
- **Determinism is gone in live mode.** The same study run twice gives
  different numbers. `research-methodology.html` still implies stability and
  should be updated — the margin of error is the honest substitute.
- **Mock-era artefacts persist in fallback mode**: six fixed archetypes, a
  small content pool. Expected, and the reason to watch `meta.engine`.

---

## Rollback

The live path is additive. To disable it without a deploy, delete the
`js/research-live.js` script tag from the four pages — `runStudy` falls back to
the mock automatically. To disable server-side, remove the secret; the function
then errors and the client falls back on its own.
