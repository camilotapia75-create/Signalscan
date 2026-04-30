import crypto from 'crypto';

const STRIPE_SECRET         = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const SUPABASE_URL          = process.env.SUPABASE_URL;
const SUPABASE_SVC          = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Vercel: disable body parsing so we can verify the raw signature
export const config = { api: { bodyParser: false } };

function verifySignature(rawBody, sigHeader) {
  const parts     = sigHeader.split(',');
  const timestamp = parts.find(p => p.startsWith('t='))?.slice(2);
  const sig       = parts.find(p => p.startsWith('v1='))?.slice(3);
  if (!timestamp || !sig) return false;
  const expected = crypto
    .createHmac('sha256', STRIPE_WEBHOOK_SECRET)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

async function upsertSubscription(data) {
  await fetch(`${SUPABASE_URL}/rest/v1/subscriptions`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SVC,
      Authorization: `Bearer ${SUPABASE_SVC}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({ ...data, updated_at: new Date().toISOString() }),
  });
}

async function fetchStripeSubscription(subId) {
  const res = await fetch(`https://api.stripe.com/v1/subscriptions/${subId}`, {
    headers: { Authorization: `Bearer ${STRIPE_SECRET}` },
    signal: AbortSignal.timeout(8000),
  });
  return res.json();
}

async function getUserIdByCustomer(customerId) {
  const res  = await fetch(
    `${SUPABASE_URL}/rest/v1/subscriptions?stripe_customer_id=eq.${customerId}&select=user_id`,
    { headers: { apikey: SUPABASE_SVC, Authorization: `Bearer ${SUPABASE_SVC}` } }
  );
  const rows = await res.json();
  return rows[0]?.user_id || null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks).toString('utf8');

  if (!verifySignature(rawBody, req.headers['stripe-signature'] || '')) {
    return res.status(400).json({ error: 'Invalid signature' });
  }

  const event = JSON.parse(rawBody);

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId  = session.metadata?.userId;
    if (userId && session.subscription) {
      const sub = await fetchStripeSubscription(session.subscription);
      await upsertSubscription({
        user_id:                userId,
        stripe_customer_id:    session.customer,
        stripe_subscription_id: session.subscription,
        status:                sub.status,
        period_end:            sub.current_period_end,
      });
    }
  } else if (['customer.subscription.updated', 'customer.subscription.deleted'].includes(event.type)) {
    const sub    = event.data.object;
    const userId = await getUserIdByCustomer(sub.customer);
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

  return res.status(200).json({ received: true });
}
