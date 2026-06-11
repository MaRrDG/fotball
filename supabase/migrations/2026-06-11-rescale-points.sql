-- ============================================================
-- Migration: rescale scoring (2026-06-11)
--   Match:  exact 5->3 · goal-diff 3->2 · trend 2->1 · penalty 2->1
--   Long game: group winner 10->3 · bracket 5/10/20/30/50 -> 1/2/3/5/8
--
-- Safe to run on a populated DB: every statement is CREATE OR REPLACE
-- (functions + view) — no tables are touched, no rows are dropped.
-- Paste the whole file into the Supabase SQL editor and run it.
-- ============================================================

-- 1. per-match formula
create or replace function public.calc_match_points(ph int, pa int, ah int, aa int)
returns int
language sql immutable
as $$
  select case
    when ph = ah and pa = aa                                   then 3  -- bulls-eye
    when sign(ph - pa) = sign(ah - aa) and ph - pa = ah - aa   then 2  -- exact goal difference
    when sign(ph - pa) = sign(ah - aa)                         then 1  -- correct trend
    else 0
  end;
$$;

-- 2. match scoring (penalty bonus 2 -> 1)
create or replace function public.score_match(p_match_id bigint)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  m public.matches%rowtype;
begin
  select * into m from public.matches where id = p_match_id;
  if m.id is null
     or m.status not in ('FT','AET','PEN')
     or m.home_goals is null or m.away_goals is null then
    return;
  end if;

  update public.predictions p
  set points = public.calc_match_points(p.home_goals, p.away_goals, m.home_goals, m.away_goals)
             + case when m.status = 'PEN'
                     and p.penalty_winner is not null
                     and p.penalty_winner = m.penalty_winner
                    then 1 else 0 end,   -- penalty shootout bonus
      is_bullseye = (p.home_goals = m.home_goals and p.away_goals = m.away_goals)
  where p.match_id = p_match_id;

  update public.matches set scored = true where id = p_match_id;
end;
$$;

-- 3. leaderboard view (group winner *3, bracket 1/2/3/5/8)
create or replace view public.leaderboard as
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
),
bk as (
  select b.user_id,
         sum(case b.round
               when 'R16'   then 1
               when 'QF'    then 2
               when 'SF'    then 3
               when 'F'     then 5
               when 'CHAMP' then 8
             end)                       as pts,
         bool_or(b.round = 'CHAMP')     as champion_guessed
  from public.bracket_picks b
  join public.tournament_results r on r.kind = b.round and r.team = b.team
  group by b.user_id
)
select pr.id                                                            as user_id,
       pr.nickname,
       coalesce(mp.match_points, 0) + coalesce(gw.pts, 0) + coalesce(bk.pts, 0) as total_points,
       coalesce(mp.match_points, 0)                                     as match_points,
       coalesce(gw.pts, 0) + coalesce(bk.pts, 0)                        as tournament_points,
       coalesce(mp.bullseyes, 0)                                        as bullseyes,
       coalesce(bk.champion_guessed, false)                             as champion_guessed,
       coalesce(mp.group_stage_points, 0)                               as group_stage_points
from public.profiles pr
left join mp on mp.user_id = pr.id
left join gw on gw.user_id = pr.id
left join bk on bk.user_id = pr.id
order by total_points desc, bullseyes desc, champion_guessed desc, group_stage_points desc;

grant select on public.leaderboard to authenticated;

-- 4. (only if matches were ALREADY scored under the old values)
--    Re-score every finished match so stored predictions.points use the new
--    scale. Harmless to run even if nothing has been scored yet.
-- select public.score_match(id) from public.matches where scored = true;
