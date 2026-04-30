const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_SVC  = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { userId, email } = req.body || {};
  if (!userId || !email) return res.status(400).json({ error: 'Missing params' });

  // Find this user's Stripe customer by email
  const custRes  = await fetch(
    `https://api.stripe.com/v1/customers?email=${encodeURIComponent(email)}&limit=5`,
    { headers: { Authorization: `Bearer ${STRIPE_SECRET}` }, signal: AbortSignal.timeout(8000) }
  );
  const custData = await custRes.json();
  const customers = custData.data || [];
  if (!customers.length) return res.status(200).json({ subscribed: false });

  // Check each customer for an active subscription (handles duplicate customer edge case)
  for (const customer of customers) {
    const subRes  = await fetch(
      `https://api.stripe.com/v1/subscriptions?customer=${customer.id}&status=active&limit=1`,
      { headers: { Authorization: `Bearer ${STRIPE_SECRET}` }, signal: AbortSignal.timeout(8000) }
    );
    const subData = await subRes.json();
    const sub     = subData.data?.[0];
    if (!sub) continue;

    // Write to Supabase
    await fetch(`${SUPABASE_URL}/rest/v1/subscriptions`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SVC,
        Authorization: `Bearer ${SUPABASE_SVC}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        user_id:                userId,
        stripe_customer_id:    customer.id,
        stripe_subscription_id: sub.id,
        status:                sub.status,
        period_end:            sub.current_period_end,
        updated_at:            new Date().toISOString(),
      }),
    });

    return res.status(200).json({ subscribed: true, status: sub.status });
  }

  return res.status(200).json({ subscribed: false });
}
