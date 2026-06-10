-- Migration: lock predictions at T-30 (was T-15) + fix upsert permission bug.
-- Paste this into the Supabase SQL Editor and run it once.

-- 1. Lock window → 30 minutes before kick-off.
create or replace function public.match_is_open(p_match_id bigint)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.matches
    where id = p_match_id
      and now() < kickoff - interval '30 minutes'
  );
$$;

-- 2. Fix: re-saving a prediction failed with "permission denied" because the
--    upsert's on-conflict UPDATE also writes user_id/match_id, which weren't
--    in the column grant. RLS still pins both to the caller's own row on an
--    open match, so this is safe.
grant update (user_id, match_id, home_goals, away_goals, penalty_winner)
  on public.predictions to authenticated;
