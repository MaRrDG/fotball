-- ============================================================
-- Migration: draws never earn the goal-difference tier (2026-06-14)
--
-- Before: a draw prediction against a draw result (e.g. 1-1 vs 2-2) matched the
-- "exact goal difference" tier — both differences are 0 — and scored 2 points.
-- A draw is a 0-goal margin: calling it right is the trend tier (1 point). The
-- +2 tier is now reserved for decisive results where the winning margin is the
-- same (e.g. you said 1-3, it ended 0-2 — both an away win by two).
--
-- Safe to run on a populated DB: CREATE OR REPLACE only, no rows touched. The
-- final statement re-scores every already-scored match so stored points use the
-- corrected rule. Paste the whole file into the Supabase SQL editor and run it.
-- ============================================================

create or replace function public.calc_match_points(ph int, pa int, ah int, aa int, p_stage text default 'GROUP')
returns int
language sql immutable
as $$
  select case
    when ph = ah and pa = aa then
      case p_stage
        when 'R32' then 4
        when 'R16' then 5
        when 'QF'  then 6
        when 'SF'  then 8
        when '3RD' then 8
        when 'F'   then 10
        else 3                                                       -- GROUP
      end
    when sign(ph - pa) = sign(ah - aa) and ph - pa = ah - aa
         and ph <> pa                                          then 2  -- exact goal difference (decisive results only)
    when sign(ph - pa) = sign(ah - aa)                         then 1  -- correct trend (incl. any draw-for-a-draw)
    else 0
  end;
$$;

-- Re-score every finished match so already-stored predictions.points pick up the
-- corrected draw rule. Harmless if nothing has been scored yet.
select public.score_match(id) from public.matches where scored = true;
