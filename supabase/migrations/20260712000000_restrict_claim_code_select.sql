-- Prevent public/anon read access to claim_code (previously fully readable,
-- allowing anyone to enumerate every fundraiser's claim code and submit
-- fraudulent payout requests). Lookups now go through the claim-lookup
-- edge function, which uses the service role key server-side.

revoke select on public.posts from anon, authenticated;
grant select (id, created_at, anon_name, content, tag, likes, has_fund, fund_goal, fund_raised)
  on public.posts to anon, authenticated;

revoke select on public.fund_campaigns from anon, authenticated;
grant select (id, created_at, anon_name, content, goal, raised)
  on public.fund_campaigns to anon, authenticated;

revoke select on public.taasiya_posts from anon, authenticated;
grant select (id, created_at, anon_name, content, grief_type, duas, has_fund, fund_goal, fund_raised)
  on public.taasiya_posts to anon, authenticated;
