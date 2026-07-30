# Shipping Research v2 — live inference

Everything that does not need your credentials is written and tested. This is
the short list of things only you can do, in order. Budget about 20 minutes.

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

## 1. Run the migration  (~2 min)

`supabase/migration.sql` has three additions at the bottom. Copy it with the
correct encoding — it is UTF-8 without a BOM and contains `₹`:

```powershell
Set-Clipboard -Value ([System.IO.File]::ReadAllText('D:\INDIZILLA\supabase\migration.sql', (New-Object System.Text.UTF8Encoding $false)))
```

Paste into the [SQL Editor](https://supabase.com/dashboard/project/iykuvppjmmatsvrrtwra/sql)
and Run. It is idempotent.

What the additions do:

| Function | Why |
|---|---|
| `fail_study` | **Refunds credits when a run fails.** Generation now costs real money, so a mid-run failure must not leave the user charged for nothing. |
| `create_study` | Adds an advisory lock, closing a read-then-write gap where two concurrent runs could both pass the balance check. |
| `research_credit_balance` | Adds a caller check. It was readable for any profile UUID. |

---

## 2. Set the API secret  (~3 min)

Get a key from [console.anthropic.com](https://console.anthropic.com) → API Keys.

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-... --project-ref iykuvppjmmatsvrrtwra
```

Or Dashboard → Project Settings → Edge Functions → Secrets → Add.

**Set a monthly spend limit on the Anthropic key before you do anything else.**
A loop in the wrong place is the one failure mode here that costs money rather
than time.

---

## 3. Deploy the Edge Function  (~5 min)

```bash
npx supabase login
npx supabase functions deploy research --project-ref iykuvppjmmatsvrrtwra
```

If the CLI is logged in as the wrong account (see START-HERE §7 — this machine
has two), `npx supabase logout` first.

---

## 4. Verify  (~5 min)

Sign in at https://indizilla.com/login.html, then from the browser console on
any Research page:

```js
RLive.available()          // true once deployed and signed in
await RLive.call({ action: 'strategist', request: { rules: [], evidence: {} } })
```

A `401` means the session is not being passed. A `500` naming
`ANTHROPIC_API_KEY` means step 2 did not take. Function logs:

```bash
npx supabase functions logs research --project-ref iykuvppjmmatsvrrtwra
```

Then run a real study — **start with Quick Pulse** (50 personas, ~₹20) rather
than Prism, so the first live run is cheap if something is wrong.

Check afterwards, in the console on the report page:

```js
const s = await RDB.getStudy(new URLSearchParams(location.search).get('id'));
s.memo.graph.meta          // engine: 'live', personaModel, usage
```

`engine: 'mock'` with a `liveError` means it fell back — the study still
completed, and the error says why.

---

## 5. What to watch on the first live runs

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
