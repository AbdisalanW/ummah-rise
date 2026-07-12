-- Track Stripe Connect account + payout state per fundraiser, for the
-- migration away from manual admin-mediated payouts.

alter table public.posts
  add column if not exists stripe_account_id text,
  add column if not exists stripe_onboarded boolean default false,
  add column if not exists payout_transferred_at timestamptz;

alter table public.fund_campaigns
  add column if not exists stripe_account_id text,
  add column if not exists stripe_onboarded boolean default false,
  add column if not exists payout_transferred_at timestamptz;

alter table public.taasiya_posts
  add column if not exists stripe_account_id text,
  add column if not exists stripe_onboarded boolean default false,
  add column if not exists payout_transferred_at timestamptz;

-- These are only ever read/written by service-role edge functions, never
-- directly by the client, so no anon/authenticated grants are added.
