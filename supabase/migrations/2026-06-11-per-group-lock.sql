-- ============================================================
-- Migration: per-group locking for group-winner picks (2026-06-11)
--
-- Before: one global `group_picks_lock` setting locked all 12 groups at once.
-- After:  each group locks automatically when its FIRST group-stage match
--         kicks off — no admin setting involved.
--
-- Safe on a populated DB: only replaces a function and the RLS policies on
-- group_winner_picks. No rows are touched. Paste the whole file into the
-- Supabase SQL editor and run it.
-- ============================================================

-- 1. New per-group lock check (replaces the global group_picks_open()).
create or replace function public.group_pick_open(p_group text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select now() < coalesce(
    (select min(m.kickoff)
       from public.matches m
       join public.teams t on t.name = m.home_team
      where m.stage = 'GROUP' and t.group_name = p_group),
    'infinity'::timestamptz);
$$;

-- 2. Repoint the RLS policies. Postgres has no CREATE OR REPLACE POLICY, so
--    drop the old ones (which reference group_picks_open()) and recreate them.
drop policy if exists "gw select" on public.group_winner_picks;
drop policy if exists "gw insert" on public.group_winner_picks;
drop policy if exists "gw update" on public.group_winner_picks;
drop policy if exists "gw delete" on public.group_winner_picks;

create policy "gw select" on public.group_winner_picks
  for select to authenticated
  using (user_id = auth.uid() or not public.group_pick_open(group_name));
create policy "gw insert" on public.group_winner_picks
  for insert to authenticated
  with check (user_id = auth.uid() and public.group_pick_open(group_name));
create policy "gw update" on public.group_winner_picks
  for update to authenticated
  using (user_id = auth.uid() and public.group_pick_open(group_name))
  with check (user_id = auth.uid() and public.group_pick_open(group_name));
create policy "gw delete" on public.group_winner_picks
  for delete to authenticated
  using (user_id = auth.uid() and public.group_pick_open(group_name));

-- 3. The old global function is now unused. Drop it (the policies above no
--    longer reference it). The `group_picks_lock` settings row, if any, is
--    harmless dead data — left in place.
drop function if exists public.group_picks_open();
