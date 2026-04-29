const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_SVC  = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'Missing userId' });

  const origin = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`;

  // Look up Stripe customer ID
  const subRes = await fetch(
    `${SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${userId}&select=stripe_customer_id`,
    { headers: { apikey: SUPABASE_SVC, Authorization: `Bearer ${SUPABASE_SVC}` } }
  );
  const rows = await subRes.json();
  const customerId = rows[0]?.stripe_customer_id;
  if (!customerId) return res.status(404).json({ error: 'No subscription found' });

  const portalRes = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ customer: customerId, return_url: origin }),
    signal: AbortSignal.timeout(8000),
  });
  const portal = await portalRes.json();
  if (portal.error) return res.status(400).json({ error: portal.error.message });
  return res.status(200).json({ url: portal.url });
}
