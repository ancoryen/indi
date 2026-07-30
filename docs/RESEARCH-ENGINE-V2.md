# Indizilla Research — real panel simulation (design)

Design document for replacing the mock engine (`js/research-engine.js`) with real
per-persona inference. **Nothing here is built.** This records the decision, the
contract, the UI it implies, and what it costs — so the numbers can be argued
with before code exists.

Written 30 Jul 2026. Supersedes the "keep the return shapes" guidance in
`README.md`, which assumed a drop-in engine swap. It isn't one — see §4.

---

## 1. The decision this records

Two ways to build the Edge Function:

**(a) Generate the memo directly.** One LLM call writes the verdict and the
percentages. Cheap, fast, and the prose improves enormously. But the model
*invents* "28% positive" — there is no panel behind it. The four credit tiers
still have nothing to sell, because panel size doesn't change anything.

**(b) Actually run the panel.** N independent persona completions, aggregated
into a real distribution. "28%" means 56 of 200 personas said so. Segments are
computable because each persona has attributes. Objections cluster into a ranked
table because they were generated independently. Confidence follows from real n.

**We are building (b).** It is the only version where Quick Pulse → Prism is a
genuine ladder — 50 versus 400 real inferences, real cost scaling, real precision
— and therefore the only version where ₹710 for a Prism study is defensible.

The audit that led here is in `START-HERE.md` §9 and the session notes: the mock
never reads the idea (it hashes it), has 40 possible memos, 9 quotes, 9 survey
questions, and returns a different verdict 81% of the time depending on which
tier you pick.

---

## 2. Pipeline

Five stages. Only stages 2–4 are LLM calls.

| # | Stage | Where | Calls |
|---|---|---|---|
| 1 | Study fit + audience inference | Edge Function | 1 small |
| 2 | Survey generation | Edge Function | 1 |
| 3 | **Persona panel** | Edge Function, fanned out | **N** (50–400) |
| 4 | Memo synthesis | Edge Function | 1 |
| 5 | Follow-up (on demand) | Edge Function | 1 |

Stage 3 is the whole cost story and the whole product. Stages 1, 2, 4, 5 are
single calls whose cost rounds to nothing next to it.

### Stage 3 in detail

1. **Build the panel roster deterministically, in code — not by asking a model.**
   From the audience spec (markets, ages, roles, industry, company size,
   attitude, diversity), generate N persona attribute records by stratified
   sampling. This is what makes segments computable: you *know* each persona's
   attributes because you assigned them.
2. **One completion per persona.** Shared cached prefix (system + idea +
   decision + survey) plus that persona's attributes. Structured output, so the
   response is schema-valid and aggregatable without parsing prose.
3. **Aggregate in code.** Counts, percentages, per-segment breakdowns, objection
   clustering. No model involved — these are the numbers the memo will cite, and
   they must be arithmetic, not generation.

**Cluster objections by embedding, not by asking a model to summarise.** Each
persona returns a free-text objection plus a coarse `objection_category` from a
fixed enum. The enum gives you the ranked table for free; the free text gives you
the verbatims underneath each row.

---

## 3. Memo schema v2

The current shape can't express what a paying customer asked for. Mapping:

| Current | v2 | Why |
|---|---|---|
| `objection: string` | `objections: [{...}]` | Ranked table with counts |
| `segment: {name, pct}` | `segments: [{...}]` | Real subgroups, can be *below* average |
| `confidence: "Medium"` | `confidence: {...}` | Must reflect n and margin of error |
| `nextTest: string` | `nextTests: [{...}]` | Testable A/B, not generic advice |
| — | `assumption`, `fatalFlaw`, `surprise`, `whatWouldChangeOurMind` | New |
| `personas.shown[]` | `voices[]` | Quote tied to the persona's attributes |

```jsonc
{
  // A study is started by a DECISION QUESTION, which is often a fork
  // ("direct-to-beneficiary, or NGO-partnership first?"). The memo must answer
  // the question that was asked, not just grade the idea. When the engine
  // detects branches in decision_q, it verdicts each and recommends one.
  "verdict": "go" | "conditional" | "no",   // the idea overall
  "branches": [                             // null when the question isn't a fork
    { "label": "Direct-to-beneficiary", "verdict": "no",
      "why": "Panel put the legal and safeguarding load entirely on you" },
    { "label": "NGO-partnership first",  "verdict": "conditional",
      "why": "Solves KYC, 80G and safeguarding; caps growth" }
  ],
  "recommendation": "NGO-partnership first",  // null when branches is null

  "headline": "string",                  // specific to THIS idea, cites the driver

  "confidence": {
    "level": "high" | "medium" | "low",
    "n": 200,
    "marginOfError": 6.6,                // percentage points, 95% CI
    "basis": "string",                   // plain-English why
    "verdictIsRobust": true              // false when the CI straddles a threshold
  },

  "stats": {
    "positive": { "pct": 28, "count": 56 },
    "neutral":  { "pct": 35, "count": 70 },
    "skeptical":{ "pct": 38, "count": 76 },
    "meanIntent": 2.9
  },

  // Ranked, with counts. Answers "why did people reject it".
  "objections": [
    {
      "reason": "Donors doubt beneficiary verification is real",
      "category": "trust",
      "pct": 46, "count": 92,
      "evidence": ["verbatim quote", "verbatim quote"],
      "segmentSkew": "Strongest among donors 45+"
    }
  ],

  // Real subgroups. MUST be able to score below the overall rate.
  "segments": [
    {
      "name": "Socially-conscious donors, 25-34, metro India",
      "n": 48, "positivePct": 41,
      "vsOverall": 13,                   // signed — negative is allowed
      "why": "Already give digitally; verification reads as a feature not a hurdle"
    }
  ],

  "assumption": "Users trust platform verification more than NGO vetting",
  "fatalFlaw": "Donors don't want to choose between individual people",
  "surprise": "Under-30s preferred recurring sponsorship to one-time giving",
  "whatWouldChangeOurMind": "If 60%+ preferred verified individuals over NGO pools",

  // Concrete A/B, not "run 5 interviews".
  "nextTests": [
    {
      "variantA": "Sponsor a homeless person's monthly meals",
      "variantB": "Crowdfund verified homeless individuals",
      "measures": "click-to-signup",
      "rationale": "Isolates framing from mechanism",
      "expectedLift": "+18pp among the strongest segment"
    }
  ],

  "voices": [
    {
      "persona": { "role": "NGO Director", "age": "35-44", "market": "India" },
      "sentiment": "skeptical", "score": 2,
      "quote": "Verification becomes your entire business.",
      "reasoning": "Ties the objection to her own operational experience"
    }
  ],

  "generatedAt": "ISO-8601",
  "model": "claude-...",                 // provenance
  "engineVersion": 2
}
```

Two rules the schema exists to enforce:

- **`segments[].vsOverall` is signed.** The mock's segment could never be below
  average because it was `overall + random(0,12)`. A real segment analysis must
  be able to say "this group liked it *less*".
- **`confidence.verdictIsRobust`** is false when the CI straddles a verdict
  threshold. The mock's default audience sat 0.01pp from the 35% boundary and
  never said so. If the answer is a coin flip, the memo says the answer is a
  coin flip.

### Persona response schema (stage 3, per call)

Structured output, so aggregation needs no parsing:

```jsonc
{
  "answers": [{ "questionId": "q_1", "answer": "string" }],
  "sentiment": "positive" | "neutral" | "skeptical",
  "intentToTry": 1,                      // 1-5
  "objection": "string",                 // free text, this persona's own
  // "dignity" and "safeguarding" are not optional niceties — on a dry run
  // against a homelessness-donation idea, 5 of 12 objections landed in those
  // two and would otherwise have been forced into "other", collapsing the
  // single most important row of the ranked table.
  "objectionCategory": "trust" | "price" | "relevance" | "alternatives"
                     | "effort" | "regulatory" | "dignity" | "safeguarding"
                     | "other",
  "wouldPay": { "yes": false, "amount": null, "currency": "INR" },
  "oneLineReaction": "string"            // candidate for voices[]
}
```

---

## 4. Edge Function contract

This is where the README's "keep the return shapes" guidance breaks. The RPCs
stay; the generation moves.

```
POST /functions/v1/research-run
  auth: caller's Supabase JWT (RLS applies)
  body: { studyId }
```

The function does **not** take the idea or mode from the request body. It reads
them from `research_studies` by `studyId`, after verifying the row belongs to
the caller. Otherwise the browser can pay for Quick Pulse and request Prism.

| Step | Detail |
|---|---|
| 1 | Verify `studyId` belongs to `auth.uid()`, status is `running` |
| 2 | Read `mode` from the row — never from the request |
| 3 | Build roster, fan out N calls, aggregate |
| 4 | Call `save_study_result` with the v2 memo |
| 5 | On failure: set `status='failed'` **and refund the credits** |

**Refund-on-failure does not exist today** and must be added — `create_study`
deducts up front, and a mid-run failure currently leaves the user charged for
nothing. New RPC:

```sql
create or replace function public.fail_study(p_study_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_study public.research_studies;
begin
  select * into v_study from public.research_studies
    where id = p_study_id and status = 'running' for update;
  if not found then return; end if;              -- idempotent
  update public.research_studies set status = 'failed', updated_at = now()
    where id = p_study_id;
  insert into public.research_credit_ledger (user_id, amount, reason)
    values (v_study.user_id, v_study.credits_cost, 'Refund — study failed: ' || p_reason);
end $$;
```

Also needs fixing while we're in here (found in the audit, all pre-existing):

- **`create_study` TOCTOU** — reads balance then inserts. Take a row lock, or
  add a ledger balance constraint.
- **`research_credit_balance(uid)`** is security-definer with no caller check —
  anyone with a profile UUID can read any balance. Add `if uid <> auth.uid() and
  not is_admin() then raise`.
- **Prism has no server-side gate.** If the tier is ever meant to be restricted,
  that belongs in `create_study`, not a `disabled` attribute.

The follow-up path (`research_followup`) keeps its RPC but its 2-credit price
needs revisiting once follow-ups actually read the question — see §7.

---

## 5. Report UI implied

`research-report.html` gains sections it has no markup for today:

| Section | Renders | Status |
|---|---|---|
| Verdict + headline | existing | reuse |
| **Branch verdicts** | `branches[]`, `recommendation` | **new** — answers a fork question directly |
| Stat tiles | `stats` | reuse, add counts alongside % |
| **Confidence band** | `confidence` | **new** — "28% ±6.6pp, n=200" |
| **Coin-flip warning** | `verdictIsRobust: false` | **new** — inline caution |
| **Top rejection reasons** | `objections[]` | **new** — ranked bars + counts |
| **Segment table** | `segments[]` | **new** — must render negative deltas |
| Assumption / fatal flaw / surprise / what-would-change-our-mind | 4 fields | **new** — 4 callouts |
| **Next tests** | `nextTests[]` | **new** — A/B pairs, replaces one-liner |
| Sample voices | `voices[]` | rework — show persona attributes |
| Survey | existing | reuse |
| Follow-up chat | existing | reuse |

The existing report is well-built and the design system carries it — this is
additive markup against a richer payload, not a rewrite.

---

## 6. Costing model

Pricing per 1M tokens, first-party Anthropic API, as of 2026-06-24:

| Model | Input | Output | Context | Cache minimum |
|---|---|---|---|---|
| Claude Opus 5 (`claude-opus-5`) | $5.00 | $25.00 | 1M | 512 tok |
| Claude Sonnet 5 (`claude-sonnet-5`) | $3.00 | $15.00 | 1M | 1024 tok |
| Claude Haiku 4.5 (`claude-haiku-4-5`) | $1.00 | $5.00 | 200K | **4096 tok** |

> Sonnet 5 has introductory pricing of **$2.00/$10.00 through 2026-08-31** —
> about a month away. Do not build the business case on the intro rate.

### The two levers that decide viability

**Prompt caching.** Every persona call shares an identical prefix — system
prompt, idea, decision question, survey, audience spec. Cache writes cost 1.25×,
reads cost 0.1×. Across 400 personas that turns the prefix from 400 full charges
into one write plus 399 reads at a tenth. This is the difference between the
product working and not.

Three implementation constraints, all real:

- **Haiku 4.5's cache minimum is 4096 tokens.** A 1,500-token prefix silently
  won't cache on Haiku — no error, just `cache_creation_input_tokens: 0`. Either
  pad the prefix to ≥4096 (a genuinely richer system prompt would get there) or
  the Haiku economics below don't hold.
- **Parallel requests can't read a cache that's still being written.** Fire one
  call, wait for its first streamed token, *then* fan out the remaining N−1.
- **Any byte change invalidates the prefix.** No timestamps, no per-persona IDs
  before the breakpoint, deterministic JSON key order.

**Batch API.** 50% off all token usage. Most batches finish within an hour; the
hard ceiling is 24 hours. See the SLA tension in §7 before assuming it applies.

### Per-study cost

Assumptions — **these need measuring, not trusting**: 1,500-token shared prefix,
200 tokens of per-persona attributes, 400 tokens of output per persona, plus one
memo call (~15K in, ~2K out). INR at ₹88/USD.

Effective per-persona cost with caching, before batch discount:

| Model | Input (200 + 150 cached) | Output (400) | Per persona |
|---|---|---|---|
| Haiku 4.5 | $0.00035 | $0.00200 | **$0.00235** |
| Sonnet 5 | $0.00105 | $0.00600 | **$0.00705** |
| Opus 5 | $0.00175 | $0.01000 | **$0.01175** |

Full study cost — personas on the named model, memo synthesis always on Opus 5.
Revenue is at the **Pro pack rate**: the best rate a customer can get, so the
worst case for margin.

**Caching + batch (50% off):**

| Mode | n | Haiku 4.5 | Sonnet 5 | Opus 5 | Revenue |
|---|---|---|---|---|---|
| Quick Pulse | 50 | ₹11 · 86% | ₹21 · 73% | ₹32 · 60% | ₹79 |
| Pulse Plus | 100 | ₹16 · 90% | ₹37 · 77% | ₹58 · 64% | ₹158 |
| Signal Plus | 200 | ₹26 · 92% | ₹68 · 79% | ₹109 · 65% | ₹316 |
| Prism | 400 | ₹47 · 93% | ₹130 · 82% | ₹213 · 70% | ₹710 |

**Caching only, live calls (no batch discount):**

| Mode | n | Haiku 4.5 | Sonnet 5 | Opus 5 | Revenue |
|---|---|---|---|---|---|
| Quick Pulse | 50 | ₹22 · 73% | ₹43 · **46%** | ₹64 · **20%** | ₹79 |
| Pulse Plus | 100 | ₹32 · 80% | ₹74 · 53% | ₹115 · 27% | ₹158 |
| Signal Plus | 200 | ₹53 · 83% | ₹136 · 57% | ₹219 · 31% | ₹316 |
| Prism | 400 | ₹94 · 87% | ₹260 · 63% | ₹425 · 40% | ₹710 |

**The current credit pricing survives contact with real economics** — and the
ladder is defensible, because cost now scales roughly linearly with panel size.

But note where it *doesn't* survive comfortably: **live calls with Opus 5
personas leave 20% on Quick Pulse.** The batch-versus-live decision is a bigger
economic lever than model choice at the cheap tiers — batched Sonnet 5 (73%)
beats live Haiku 4.5 (73%) at Quick Pulse while being the better model. Decide
§7 before optimising model choice.

The low tiers are also where margin is thinnest in every column, because the
fixed memo-synthesis call (₹5.5 batched, ₹11 live) is amortised over 50 personas
instead of 400. If Quick Pulse margin gets tight, a cheaper memo model at that
tier moves the needle more than a cheaper persona model.

### Model recommendation

**Sonnet 5 for personas, Opus 5 for memo synthesis.** Personas are short-form
constrained roleplay against a fixed schema — cheap-fan-out territory. The memo
is the one quality-critical reasoning step and it's a single call, so its cost is
noise; spend there.

Haiku 4.5 looks tempting at 89–93% margin and may well be fine, but two things
argue against it as the default: the 4096-token cache minimum is a real design
constraint, and persona believability is exactly the dimension the current
product is weakest on (finding #6). **Pilot Sonnet 5 against Haiku 4.5 on the
same 50-persona panel and judge against your own quality bar** before optimising
₹10/study.

Use **structured outputs** (`output_config.format` with a JSON schema) on the
persona calls regardless of model. Schema-valid responses are what make
aggregation arithmetic instead of parsing, and they're supported on all three.

---

## 7. Consequences worth arguing about

**The advertised times are now wrong — in a good way.** The UI promises 10–15
min for Quick Pulse and 40–60 min for Prism. Those were invented for a mock that
returns in 2ms. Run live, 400 parallel Haiku or Sonnet calls complete in
*minutes*. So:

- **Live calls:** beat the advertised window comfortably, no discount.
- **Batch:** 50% off, but "most within an hour" is not a 10-minute promise.
  Batch would break the Quick Pulse SLA as written.

Running live costs roughly double (both tables are in §6). On Sonnet 5 that's
46% margin at Quick Pulse versus 73% batched; on Opus 5 it's 20% versus 60%.

**Recommended split: fast tiers live, Signal Plus and Prism batched** with a
widened advertised window. That keeps the 10–25 minute promise you already make
on the tiers where speed is the selling point, takes the discount where the
promise is already "40–60 min", and — on Sonnet 5 — lands 46% / 53% / 79% / 82%
across the ladder. All viable.

The alternative is to re-advertise everything as "minutes" and run live
throughout. Better product promise, materially worse margin at the low tiers, and
it forecloses Opus 5 personas entirely (20% at Quick Pulse is not a business).

**Follow-ups at 2 credits need re-pricing.** Today they cost 2 credits and return
one of 9 canned strings that ignore the question. A real follow-up re-queries the
stored panel — either a fresh completion over the aggregated data (cheap, one
call) or a re-run against a persona subset (expensive). The former is ~₹0.10 and
2 credits is fine. The latter is not. Decide which one "ask the panel" means.

**Determinism goes away, and the methodology page must say so.** The mock is
seeded and reproducible. Real inference is not — the same study run twice gives
different numbers. `research-methodology.html` currently implies stability.
Either pin a seed where the API allows, or state plainly that panels vary and
report the margin of error (which is the honest version, and is why
`confidence.marginOfError` is in the schema).

**Cost is now per-run, so failed runs cost real money.** Hence `fail_study` in
§4, and hence a hard cap on retries.

---

## 8. Phasing

Each phase ships something testable.

| Phase | Scope | Gate |
|---|---|---|
| 1 | Measure, don't guess: build the prefix, run 50 real personas, count tokens with `count_tokens`, verify cache hits via `cache_read_input_tokens` | Real per-study cost within 20% of §6 |
| 2 | Memo schema v2 + `fail_study` + the three SQL fixes; mock engine emits v2 shape | Report renders v2 from the mock; nothing regresses |
| 3 | Report UI sections (§5) against v2 | New sections render, mobile clean, both themes |
| 4 | Edge Function: real stages 1–4, feature-flagged per study | A/B a real run against a mock run on the same idea |
| 5 | Follow-ups, methodology page rewrite, advertised-time decision | — |

Phase 2 and 3 are worth doing **before** any inference exists — they're the
expensive-to-change parts, they're testable against the mock, and they de-risk
phase 4 to "fill in the generation".

---

## 9. Open questions

1. **Batch or live?** Decides both margin and the advertised SLA (§7).
2. **Haiku or Sonnet for personas?** ~₹10/study at Prism. Measure quality first.
3. **What does "ask the panel" mean?** Determines whether 2 credits is right.
4. **Does Prism stay ungated?** If it needs restricting, it belongs in SQL.
5. **Do studies stay reproducible?** Affects the methodology page and support.
6. **Where does the API key live?** Supabase Edge Function secret — it must
   never reach `js/config.js`, which is committed.
7. **How are decision-question branches detected?** `branches[]` assumes the
   engine can spot a fork in `decision_q`. Stage 1 can do this, but a
   mis-detected fork produces a confusing memo. Worth a confirmation step in the
   wizard ("we read this as an A-or-B decision — correct?") rather than silent
   inference.

---

## 10. Dry run (30 Jul 2026)

Before writing any code, the architecture was exercised by hand against a real
pitch — a crowdfunding platform for homeless people and street performers,
asking direct-to-beneficiary versus NGO-partnership-first. Roster built
deterministically, 12 personas generated, numbers **counted** rather than
invented. Not the real pipeline (n=12, one context, so correlated draws, ±25pp)
— but enough to test the schema against real output.

What it produced that the mock structurally cannot:

- A segment scoring **25 points below** the overall rate (NGO and frontline
  workers, 0% positive, 4 of 4) — the mock's segment was `overall + random(0,12)`.
- Objections specific to the idea: no 80G deduction on gifts to individuals,
  payment-aggregator licensing, KYC on people without ID, handler coercion, and
  the fact that begging is a prosecutable offence in several Indian states —
  making a verified public registry a legal hazard rather than an asset.
- A genuine surprise nobody prompted for: street performers and people begging
  split the panel cleanly. Performers read as "gig worker, tip them"; begging
  read as "charity, needs an institution". **Nobody treated them as one product.**

Both schema changes above came out of this run, which is the argument for doing
phase 1 as a measurement exercise rather than a build.
