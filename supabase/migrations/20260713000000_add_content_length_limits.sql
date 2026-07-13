-- Client-side maxlength only stops the app UI; anyone can still POST
-- arbitrarily long content directly via the public REST API. Add DB-level
-- caps matching the UI limits as defense in depth.

alter table public.posts
  add constraint posts_content_length check (char_length(content) <= 2000);

alter table public.taasiya_posts
  add constraint taasiya_posts_content_length check (char_length(content) <= 2000);

alter table public.replies
  add constraint replies_content_length check (char_length(content) <= 500);
