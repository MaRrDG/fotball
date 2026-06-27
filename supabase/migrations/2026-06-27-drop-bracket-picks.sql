-- ============================================================
-- Migration: drop the leftover bracket-picks objects (2026-06-27)
--
-- The bracket prediction game was retired on 2026-06-11 (drop-bracket-game.sql),
-- which stopped it scoring but deliberately left the bracket_picks table in
-- place. We no longer keep any tournament-level pick beyond group winners, so
-- this removes the dead objects for good. The knockout bracket remains a live,
-- display-only view driven by the matches table — nothing visible changes.
--
-- Safe to run on a populated DB: only drops unused objects + their bookkeeping
-- settings rows. Paste the whole file into the Supabase SQL editor and run it.
-- ============================================================

-- The table drop cascades its bracket_cap trigger and RLS policies.
drop table if exists public.bracket_picks cascade;

-- Functions that only ever served bracket_picks.
drop function if exists public.bracket_slot_limit();
drop function if exists public.bracket_picks_open();

-- Window settings that only gated bracket picks.
delete from public.settings where key in ('bracket_picks_open', 'bracket_picks_lock');
