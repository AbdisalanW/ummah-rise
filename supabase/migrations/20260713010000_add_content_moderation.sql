-- Reports previously only emailed the admin with no automatic effect —
-- content stayed visible to everyone regardless of how many people
-- flagged it. Add a report count + auto-hide threshold so obviously
-- abusive content stops showing up without waiting on manual review
-- (relevant for Apple App Store Guideline 1.2, which expects some
-- filtering mechanism beyond after-the-fact human review for UGC apps).

alter table public.posts
  add column if not exists report_count integer not null default 0,
  add column if not exists hidden boolean not null default false;

alter table public.taasiya_posts
  add column if not exists report_count integer not null default 0,
  add column if not exists hidden boolean not null default false;

-- Public feed reads need to filter by `hidden`, but report_count stays
-- service-role-only (no reason for clients to see exact report tallies).
revoke select on public.posts from anon, authenticated;
grant select (id, created_at, anon_name, content, tag, likes, has_fund, fund_goal, fund_raised, hidden)
  on public.posts to anon, authenticated;

revoke select on public.taasiya_posts from anon, authenticated;
grant select (id, created_at, anon_name, content, grief_type, duas, has_fund, fund_goal, fund_raised, hidden)
  on public.taasiya_posts to anon, authenticated;
