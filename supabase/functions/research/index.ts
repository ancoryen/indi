// Indizilla Research — Edge Function.
//
// Holds the Anthropic key and does the two things that need it: generating the
// persona panel, and generating the strategist's judgement. Everything else —
// roster construction, graph assembly, the evidence engine, verification, the
// views — stays client-side and unchanged.
//
// Two things are deliberately server-side because the browser must not decide
// them: the panel SIZE (read from the study row, so nobody pays for Quick Pulse
// and requests Prism) and the API key.
//
// Deploy:  supabase functions deploy research --project-ref iykuvppjmmatsvrrtwra
// Secret:  supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const PERSONA_MODEL = 'claude-sonnet-5';   // cheap fan-out, schema-constrained
const STRATEGIST_MODEL = 'claude-opus-5';  // one call, quality-critical

// Personas per request. One call each would be ~200 round trips and blow the
// function's wall clock; batching to 10 keeps it to ~20 calls. The trade is
// that personas in a batch share a context and so correlate somewhat — worth
// revisiting once we can measure it against a real panel.
const BATCH = 10;
const CONCURRENCY = 6;

const MODE_N: Record<string, number> = {
  'quick-pulse': 50, 'pulse-plus': 100, 'signal-plus': 200, 'prism': 400
};

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...cors, 'Content-Type': 'application/json' }
  });

/* ------------------------------------------------------------ Anthropic ---- */

async function anthropic(body: Record<string, unknown>) {
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set on this project');

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error('Anthropic ' + res.status + ': ' + text.slice(0, 400));
  }
  const data = await res.json();
  // Safety classifiers can decline with HTTP 200. Check before reading content.
  if (data.stop_reason === 'refusal') {
    throw new Error('refusal:' + (data.stop_details?.category ?? 'unspecified'));
  }
  const text = (data.content || []).find((b: any) => b.type === 'text')?.text ?? '';
  return { text, usage: data.usage ?? {}, model: data.model };
}

// Run tasks with a concurrency cap, and fire the first alone so the shared
// prefix is in cache before the rest go out — parallel requests cannot read a
// cache entry that is still being written.
async function pooled<T, R>(items: T[], fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  if (!items.length) return [];
  const out: R[] = new Array(items.length);
  out[0] = await fn(items[0], 0);
  let next = 1;
  const workers = Array.from({ length: Math.min(CONCURRENCY, items.length - 1) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

/* ------------------------------------------------------------- personas ---- */

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    responses: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer' },
          sentiment: { type: 'string', enum: ['positive', 'neutral', 'skeptical'] },
          intent: { type: 'integer', enum: [1, 2, 3, 4, 5] },
          category: { type: 'string', enum: ['trust', 'price', 'relevance', 'alternatives',
                       'effort', 'regulatory', 'dignity', 'safeguarding', 'other'] },
          text: { type: 'string' },
          branch: { type: 'string' },
          branchIntent: { type: 'integer', enum: [1, 2, 3, 4, 5] }
        },
        required: ['index', 'sentiment', 'intent', 'category', 'text'],
        additionalProperties: false
      }
    }
  },
  required: ['responses'],
  additionalProperties: false
};

const PERSONA_SYSTEM =
`You simulate market research respondents. You are given an idea, a decision the founder is
weighing, and a set of people with specific priors. Each person reacts in their own voice,
from their own worldview, incentives, bias and lived experience.

Rules:
- React as that specific person, not as a generic consumer. Their prior decides what they
  notice, not just how warmly they respond.
- The objection must be specific to THIS idea. Never generic. If the idea has a legal,
  dignity or safeguarding dimension, say so plainly when that persona would.
- One sentence for the objection, in their register. No hedging, no marketing voice.
- People disagree. Do not converge on a house view.
- sentiment must be consistent with intent: 4-5 positive, 3 neutral, 1-2 skeptical.
- If branch options are given, pick the one that person would actually choose and rate how
  strongly (branchIntent). Judge the option on its merits for that person — not by the order
  it was listed in.`;

function personaPrompt(study: any, people: any[], branches: string[] | null) {
  const roster = people.map((p, i) =>
    `${i}. ${p.role}, ${p.age}, ${p.market}
   worldview: ${p.worldview}
   wants: ${p.incentive}
   bias: ${p.bias}
   background: ${p.experience}`).join('\n');

  return `IDEA
${study.idea}

DECISION BEING WEIGHED
${study.decision_q}
${branches ? `\nOPTIONS (pick one per person, on merit, order is not meaningful)\n- ${branches.join('\n- ')}\n` : ''}
PEOPLE
${roster}

Return one response object per person, using their index.`;
}

async function generatePanel(study: any, people: any[], branches: string[] | null) {
  const batches: any[][] = [];
  for (let i = 0; i < people.length; i += BATCH) batches.push(people.slice(i, i + BATCH));

  const results = await pooled(batches, async (batch, bi) => {
    const offset = bi * BATCH;
    const { text, usage } = await anthropic({
      model: PERSONA_MODEL,
      max_tokens: 8000,
      thinking: { type: 'disabled' },
      system: [{
        type: 'text',
        text: PERSONA_SYSTEM + '\n\n' + personaPrompt(study, [], branches).split('PEOPLE')[0],
        cache_control: { type: 'ephemeral' }      // shared across every batch
      }],
      output_config: { effort: 'low', format: { type: 'json_schema', schema: RESPONSE_SCHEMA } },
      messages: [{ role: 'user', content: personaPrompt(study, batch, branches) }]
    });
    let parsed: any;
    try { parsed = JSON.parse(text); }
    catch { throw new Error('persona batch ' + bi + ' returned unparseable JSON'); }
    return (parsed.responses || []).map((r: any) => ({ ...r, index: offset + (r.index ?? 0), usage }));
  });

  const flat = ([] as any[]).concat(...results);
  const usage = flat.reduce((a, r) => ({
    input: a.input + (r.usage?.input_tokens ?? 0),
    output: a.output + (r.usage?.output_tokens ?? 0),
    cacheRead: a.cacheRead + (r.usage?.cache_read_input_tokens ?? 0)
  }), { input: 0, output: 0, cacheRead: 0 });

  // The client expects one response per persona in roster order. Fill any gap
  // rather than silently shrinking the panel — a short panel would understate
  // every share downstream.
  const byIndex = new Map(flat.map((r) => [r.index, r]));
  const responses = people.map((p, i) => byIndex.get(i) ?? {
    index: i, sentiment: 'neutral', intent: 3, category: 'other',
    text: 'No clear reaction recorded.', missing: true
  });
  return { responses, usage, model: PERSONA_MODEL };
}

/* ------------------------------------------------------------ strategist ---- */

async function generateStrategist(request: any) {
  const { text, usage } = await anthropic({
    model: STRATEGIST_MODEL,
    max_tokens: 8000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high' },
    system: [{
      type: 'text',
      text: `You are a strategist advising a founder. You are given a computed evidence bundle
from a simulated research panel. Produce judgement, not evidence.

Hard rules — output that breaks any of these is discarded:
${(request.rules || []).map((r: string) => '- ' + r).join('\n')}
- Cite node ids from allowedNodeIds on every judgement.
- Never state a quantity that is not already present in the evidence.
- Never predict an outcome. A prediction is only valid once a variant has been run.
- Use the confidence level given. You may not raise it.
- Always include the case against your own recommendation.

Return JSON matching outputShape exactly.`
    }],
    messages: [{ role: 'user', content: JSON.stringify(request) }]
  });
  try { return { strategist: JSON.parse(text), usage, model: STRATEGIST_MODEL }; }
  catch { throw new Error('strategist returned unparseable JSON'); }
}

/* ----------------------------------------------------------------- serve ---- */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    const auth = req.headers.get('Authorization') ?? '';
    if (!auth) return json({ error: 'Not signed in' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: auth } } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'Not signed in' }, 401);

    const body = await req.json();
    const action = body.action ?? 'panel';

    if (action === 'strategist') {
      const out = await generateStrategist(body.request ?? {});
      return json(out);
    }

    // Panel. The study row is the authority on size — never the request body.
    const { data: study } = await supabase
      .from('research_studies').select('*')
      .eq('id', body.studyId).eq('user_id', user.id).maybeSingle();
    if (!study) return json({ error: 'Study not found' }, 404);

    const n = MODE_N[study.mode] ?? 50;
    const people = (body.personas ?? []).slice(0, n);
    if (people.length !== n) {
      return json({ error: 'Roster is ' + people.length + ', mode requires ' + n }, 400);
    }

    const out = await generatePanel(study, people, body.branches ?? null);
    return json({ ...out, n, mode: study.mode });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // A safety refusal is a content outcome, not a server fault — the client
    // needs to tell them apart to decide whether a retry is worth anything.
    const refusal = msg.startsWith('refusal:');
    return json({ error: msg, refusal }, refusal ? 200 : 500);
  }
});
