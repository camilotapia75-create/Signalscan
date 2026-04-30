import { createHmac, timingSafeEqual } from 'crypto';

const STRIPE_SECRET         = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const SUPABASE_URL          = process.env.SUPABASE_URL;
const SUPABASE_SVC          = process.env.SUPABASE_SERVICE_ROLE_KEY;

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function verifySignature(rawBody, sigHeader) {
  const parts     = sigHeader.split(',');
  const timestamp = parts.find(p => p.startsWith('t='))?.slice(2);
  const sig       = parts.find(p => p.startsWith('v1='))?.slice(3);
  if (!timestamp || !sig) throw new Error('Malformed stripe-signature header');
  const expected = createHmac('sha256', STRIPE_WEBHOOK_SECRET)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
  const a = Buffer.from(sig,      'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function upsertSubscription(data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/subscriptions`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SVC,
      Authorization: `Bearer ${SUPABASE_SVC}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({ ...data, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error('[WEBHOOK] Supabase upsert failed:', res.status, text);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // Guard: env vars must be present
  if (!STRIPE_WEBHOOK_SECRET) {
    console.error('[WEBHOOK] STRIPE_WEBHOOK_SECRET is not set');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  // Read raw body using event listeners (compatible with all Vercel runtimes)
  let rawBuffer;
  try {
    rawBuffer = await readRawBody(req);
  } catch (e) {
    console.error('[WEBHOOK] Failed to read body:', e.message);
    return res.status(400).json({ error: 'Cannot read request body' });
  }
  const rawBody = rawBuffer.toString('utf8');

  // Verify Stripe signature
  const sigHeader = req.headers['stripe-signature'] || '';
  try {
    if (!verifySignature(rawBody, sigHeader)) {
      console.error('[WEBHOOK] Signature mismatch');
      return res.status(400).json({ error: 'Invalid signature' });
    }
  } catch (e) {
    console.error('[WEBHOOK] Signature error:', e.message);
    return res.status(400).json({ error: e.message });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch (e) {
    console.error('[WEBHOOK] JSON parse error:', e.message);
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  console.log('[WEBHOOK] Received event:', event.type);

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const userId  = session.metadata?.userId;
      console.log('[WEBHOOK] checkout.session.completed — userId:', userId, 'sub:', session.subscription);
      if (userId && session.subscription) {
        const subRes = await fetch(`https://api.stripe.com/v1/subscriptions/${session.subscription}`, {
          headers: { Authorization: `Bearer ${STRIPE_SECRET}` },
          signal: AbortSignal.timeout(8000),
        });
        const sub = await subRes.json();
        await upsertSubscription({
          user_id:                userId,
          stripe_customer_id:    session.customer,
          stripe_subscription_id: session.subscription,
          status:                sub.status,
          period_end:            sub.current_period_end,
        });
        console.log('[WEBHOOK] Subscription upserted for userId:', userId);
      }

    } else if (['customer.subscription.updated', 'customer.subscription.deleted'].includes(event.type)) {
      const sub    = event.data.object;
      const lookupRes = await fetch(
        `${SUPABASE_URL}/rest/v1/subscriptions?stripe_customer_id=eq.${sub.customer}&select=user_id`,
        { headers: { apikey: SUPABASE_SVC, Authorization: `Bearer ${SUPABASE_SVC}` } }
      );
      const rows   = await lookupRes.json();
      const userId = rows[0]?.user_id;
      console.log('[WEBHOOK]', event.type, '— customerId:', sub.customer, 'userId:', userId);
      if (userId) {
        await upsertSubscription({
          user_id:                userId,
          stripe_customer_id:    sub.customer,
          stripe_subscription_id: sub.id,
          status:                sub.status,
          period_end:            sub.current_period_end,
        });
      }
    }
  } catch (e) {
    console.error('[WEBHOOK] Handler error:', e.message);
    return res.status(500).json({ error: e.message });
  }

  return res.status(200).json({ received: true });
}
