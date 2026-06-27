-- ============================================================
-- Migration: enable the admin group-winner override (2026-06-27)
--
-- Adds the one-winner-per-group guarantee the override + auto-fill both rely on.
-- The override itself (setGroupWinners) and the auto-fill's skip-existing logic
-- live in lib/sync.ts — no other DB change is needed: writes go through the
-- service role, and the leaderboard view already scores GROUP_WINNER rows.
--
-- Safe to run on a populated DB, AS LONG AS no group currently has two winner
-- rows. If the index creation fails, run this first to find offenders:
--   select group_name, count(*) from public.tournament_results
--    where kind = 'GROUP_WINNER' group by group_name having count(*) > 1;
-- ============================================================

create unique index if not exists tournament_results_group_winner_uniq
  on public.tournament_results (group_name) where kind = 'GROUP_WINNER';
