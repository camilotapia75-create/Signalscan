// ─── SignalScan Pro — Public Configuration ───────────────────────────────────
// Fill in your Supabase project URL and anon key (both are safe to be public).
// Stripe and Supabase service-role keys live in Vercel env vars — server-side only.
//
// Supabase setup (run once in your Supabase SQL Editor):
// -------------------------------------------------------
//   CREATE TABLE public.subscriptions (
//     user_id               UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
//     stripe_customer_id    TEXT UNIQUE,
//     stripe_subscription_id TEXT UNIQUE,
//     status                TEXT NOT NULL DEFAULT 'inactive',
//     period_end            BIGINT,
//     updated_at            TIMESTAMPTZ DEFAULT NOW()
//   );
//   ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
//   CREATE POLICY "Users read own sub" ON public.subscriptions
//     FOR SELECT USING (auth.uid() = user_id);
//
//   CREATE TABLE public.watchlists (
//     user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
//     tickers    TEXT[] NOT NULL DEFAULT '{}',
//     updated_at TIMESTAMPTZ DEFAULT NOW()
//   );
//   ALTER TABLE public.watchlists ENABLE ROW LEVEL SECURITY;
//   CREATE POLICY "Users manage own watchlist" ON public.watchlists
//     FOR ALL USING (auth.uid() = user_id);
//
// Vercel environment variables to set:
// ─────────────────────────────────────
//   SUPABASE_URL              (same value as supabaseUrl below)
//   SUPABASE_SERVICE_ROLE_KEY (from Supabase → Settings → API → service_role)
//   STRIPE_SECRET_KEY         (from Stripe Dashboard → Developers → API keys)
//   STRIPE_PRICE_ID           (from Stripe Dashboard → Products → your price ID)
//   STRIPE_WEBHOOK_SECRET     (from Stripe Dashboard → Webhooks → signing secret)
// ─────────────────────────────────────────────────────────────────────────────

window.SIGNALSCAN_CONFIG = {
  supabaseUrl:     'YOUR_SUPABASE_PROJECT_URL',   // e.g. https://abcdefg.supabase.co
  supabaseAnonKey: 'YOUR_SUPABASE_ANON_KEY',      // safe to be public (RLS protects data)
};
