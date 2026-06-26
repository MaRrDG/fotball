-- ============================================================
-- Migration: a predicted draw that ends as a draw earns the goal-difference tier (2026-06-26)
--
-- Reverses the 2026-06-14 "draw-trend-fix": a draw is a 0-goal margin, so a draw
-- prediction against a draw result (e.g. 1-1 vs 2-2) DOES match the goal
-- difference and now scores 2 points, not 1. The +2 tier means "right goal
-- difference but not the exact score" — the same decisive winning margin
-- (1-3 vs 0-2, both an away win by two) OR a draw called as a draw.
--
-- An exact draw (0-0 vs 0-0) is still the bulls-eye tier (3+). The trend tier (1)
-- now only covers decisive results with the right winner but the wrong margin —
-- a draw can no longer land there.
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
    when ph - pa = ah - aa                                     then 2  -- same goal difference, incl. a draw called as a draw (both a 0 margin)
    when sign(ph - pa) = sign(ah - aa)                         then 1  -- correct trend only (right winner, wrong margin)
    else 0
  end;
$$;

-- Re-score every finished match so already-stored predictions.points pick up the
-- corrected draw rule. Harmless if nothing has been scored yet.
select public.score_match(id) from public.matches where scored = true;
