-- ============================================================
-- Migration: per-stage bulls-eye scoring (2026-06-11)
--
-- The exact-score reward now grows through the knockout rounds (incl. R32):
--   Group 3 · R32 4 · R16 5 · QF 6 · SF 8 · 3rd-place 8 · Final 10
-- Goal-difference (2) and trend (1) stay flat at every stage.
--
-- Safe on a populated DB: replaces two functions, touches no rows. Already-
-- scored matches keep their old points until re-scored (see step 3).
-- ============================================================

-- 1. The 4-arg calc_match_points is replaced by a stage-aware version. Drop the
--    old signature first, otherwise a 4-arg call would be ambiguous against the
--    new function's defaulted p_stage argument.
drop function if exists public.calc_match_points(int, int, int, int);

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
    when sign(ph - pa) = sign(ah - aa) and ph - pa = ah - aa   then 2  -- exact goal difference
    when sign(ph - pa) = sign(ah - aa)                         then 1  -- correct trend
    else 0
  end;
$$;

-- 2. score_match must pass the match's stage into the formula.
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
  set points = public.calc_match_points(p.home_goals, p.away_goals, m.home_goals, m.away_goals, m.stage)
             + case when m.status = 'PEN'
                     and p.penalty_winner is not null
                     and p.penalty_winner = m.penalty_winner
                    then 1 else 0 end,   -- penalty shootout bonus
      is_bullseye = (p.home_goals = m.home_goals and p.away_goals = m.away_goals)
  where p.match_id = p_match_id;

  update public.matches set scored = true where id = p_match_id;
end;
$$;

-- 3. (only if knockout matches were already scored) re-score finished matches
--    so their stored points use the new per-stage values. Harmless otherwise.
-- select public.score_match(id) from public.matches where scored = true;
