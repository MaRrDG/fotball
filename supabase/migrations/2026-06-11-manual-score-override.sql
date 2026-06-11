-- Manual score override: when an admin enters a final score by hand (the free
-- football-data.org API sometimes lags hours behind the real result),
-- score_locked stops the sync job from overwriting the row until the admin
-- clears the lock. Run in the Supabase SQL Editor.
alter table public.matches
  add column if not exists score_locked boolean not null default false;
