-- ============================================================
-- Migration: flatten elimination-round scoring (2026-07-01)
--   The mates were arguing about the points, so the exact-score (bulls-eye)
--   reward no longer climbs through the knockout rounds. New per-match rubric:
--     · Bulls-eye (exact score)    GROUP 3 · elimination 4
--     · Goal difference (2)        same winning margin, incl. a draw called as a draw
--     · Right team (1)             right winner, wrong margin
--     · Miss (0)                   wrong outcome
--   Only calc_match_points changes — group-winner picks (+3) and the leaderboard
--   view are untouched.
--
-- Safe to run on a populated DB: CREATE OR REPLACE only, no tables touched, no
-- rows dropped. Paste the whole file into the Supabase SQL editor and run it.
-- ============================================================

-- 1. per-match formula — elimination exact score drops from the old 4/5/6/8/10
--    scale to a flat 4.
create or replace function public.calc_match_points(ph int, pa int, ah int, aa int, p_stage text default 'GROUP')
returns int
language sql immutable
as $$
  select case
    when ph = ah and pa = aa then
      case when p_stage = 'GROUP' then 3 else 4 end                  -- bulls-eye: group 3, elimination 4
    when ph - pa = ah - aa                                     then 2  -- same goal difference, incl. a draw called as a draw (both a 0 margin)
    when sign(ph - pa) = sign(ah - aa)                         then 1  -- right team only (right winner, wrong margin)
    else 0
  end;
$$;

-- 2. Re-score every already-finished match so stored predictions.points move
--    onto the new scale. Only elimination-round exact-score predictions actually
--    change; everything else recomputes to the same value. Idempotent.
select public.score_match(id) from public.matches where scored = true;
