-- fund_raised/raised were previously updatable directly by anyone (client
-- trusted Stripe redirect URL params with no server verification), letting
-- anyone fake a donation by visiting a crafted URL. Donation amounts are now
-- only written by the stripe-webhook edge function (service role). Also
-- protects the new stripe_account_id/payout_transferred_at columns from
-- being overwritten by anyone, the same class of issue as claim_code.

revoke update on public.posts from anon, authenticated;
grant update (likes) on public.posts to anon, authenticated;

revoke update on public.fund_campaigns from anon, authenticated;
-- no client-writable columns remain; raised is set only via webhook

revoke update on public.taasiya_posts from anon, authenticated;
grant update (duas) on public.taasiya_posts to anon, authenticated;
