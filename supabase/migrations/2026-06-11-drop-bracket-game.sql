-- ============================================================
-- Migration: retire the bracket prediction game (2026-06-11)
--
-- The knockout bracket is now a live, auto-populated view only (driven by the
-- synced matches table) — players no longer pick it, and it no longer scores.
-- Group-winner picks (+3 each) remain the only "long game" prediction.
--
-- This drops bracket points and the "champion guessed" tie-breaker from the
-- leaderboard. The bracket_picks table is left in place (unused, harmless) so
-- no historical pick data is destroyed.
-- ============================================================

-- The view loses the champion_guessed column, so CREATE OR REPLACE VIEW won't
-- do (it can't drop a column) — drop and recreate.
drop view if exists public.leaderboard;

create view public.leaderboard as
with mp as (
  select p.user_id,
         coalesce(sum(p.points), 0)                                    as match_points,
         count(*) filter (where p.is_bullseye)                         as bullseyes,
         coalesce(sum(p.points) filter (where m.stage = 'GROUP'), 0)   as group_stage_points
  from public.predictions p
  join public.matches m on m.id = p.match_id
  where p.points is not null
  group by p.user_id
),
gw as (
  select g.user_id, count(*) * 3 as pts
  from public.group_winner_picks g
  join public.tournament_results r
    on r.kind = 'GROUP_WINNER' and r.group_name = g.group_name and r.team = g.team
  group by g.user_id
)
select pr.id                                                            as user_id,
       pr.nickname,
       coalesce(mp.match_points, 0) + coalesce(gw.pts, 0)               as total_points,
       coalesce(mp.match_points, 0)                                     as match_points,
       coalesce(gw.pts, 0)                                              as tournament_points,
       coalesce(mp.bullseyes, 0)                                        as bullseyes,
       coalesce(mp.group_stage_points, 0)                               as group_stage_points
from public.profiles pr
left join mp on mp.user_id = pr.id
left join gw on gw.user_id = pr.id
order by total_points desc, bullseyes desc, group_stage_points desc;

grant select on public.leaderboard to authenticated;
