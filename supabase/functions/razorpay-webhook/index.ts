// Indizilla — Razorpay webhook.
//
// Until now a payment_id in the database was an unverified reference: the
// browser said "paid" and the row believed it. This function is the other
// half — Razorpay calls it directly, the HMAC signature proves the call is
// really Razorpay's, and only then does an order get payment_verified = true.
//
// Configure in the Razorpay dashboard: Settings → Webhooks →
//   URL:    https://<project>.supabase.co/functions/v1/razorpay-webhook
//   Secret: the same value set as RAZORPAY_WEBHOOK_SECRET on this project
//   Events: payment.captured, payment.failed
//
// Deployed by scripts/ship.mjs alongside the research function.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const enc = new TextEncoder();

async function validSignature(body: string, signature: string, secret: string) {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  const hex = [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('');
  // Constant-time compare — a timing oracle on a webhook secret is a real bug.
  if (hex.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });

  const secret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET');
  if (!secret) return new Response('webhook secret not configured', { status: 503 });

  const body = await req.text();
  const signature = req.headers.get('x-razorpay-signature') ?? '';
  if (!signature || !(await validSignature(body, signature, secret))) {
    // Unverified callers learn nothing beyond "no".
    return new Response('invalid signature', { status: 401 });
  }

  let payload: any;
  try { payload = JSON.parse(body); } catch { return new Response('bad json', { status: 400 }); }

  const event = payload?.event ?? 'unknown';
  const payment = payload?.payload?.payment?.entity ?? {};

  // Service role: RLS-free by design, and the only writer of payment_events.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const verified = event === 'payment.captured';
  await supabase.from('payment_events').insert({
    event,
    payment_id: payment.id ?? null,
    amount: typeof payment.amount === 'number' ? Math.round(payment.amount / 100) : null,
    verified,
    raw: payload
  });

  if (verified && payment.id) {
    await supabase.rpc('mark_payment_verified', { p_payment_id: payment.id });
  }

  // Razorpay retries on non-2xx; everything past the signature is our problem,
  // not theirs, so acknowledge receipt regardless of matching.
  return new Response('ok', { status: 200 });
});
