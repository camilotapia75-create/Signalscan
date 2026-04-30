const STRIPE_SECRET   = process.env.STRIPE_SECRET_KEY;
const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID;
const SUPABASE_URL    = process.env.SUPABASE_URL;
const SUPABASE_SVC    = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function stripePost(path, params) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(8000),
  });
  return res.json();
}

async function getStripeCustomerId(userId) {
  const res  = await fetch(
    `${SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${userId}&select=stripe_customer_id`,
    { headers: { apikey: SUPABASE_SVC, Authorization: `Bearer ${SUPABASE_SVC}` } }
  );
  const rows = await res.json();
  return rows[0]?.stripe_customer_id || null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { userId, email } = req.body || {};
  if (!userId || !email) return res.status(400).json({ error: 'Missing userId or email' });

  const origin = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`;

  // Reuse existing Stripe customer if present
  let customerId = await getStripeCustomerId(userId);
  if (!customerId) {
    const cust = await stripePost('/customers', { email, [`metadata[userId]`]: userId });
    if (cust.error) return res.status(400).json({ error: cust.error.message });
    customerId = cust.id;
  }

  const sess = await stripePost('/checkout/sessions', {
    customer: customerId,
    'line_items[0][price]': STRIPE_PRICE_ID,
    'line_items[0][quantity]': '1',
    mode: 'subscription',
    success_url: `${origin}/?subscribed=true`,
    cancel_url: origin,
    [`metadata[userId]`]: userId,
  });

  if (sess.error) return res.status(400).json({ error: sess.error.message });
  return res.status(200).json({ url: sess.url });
}
