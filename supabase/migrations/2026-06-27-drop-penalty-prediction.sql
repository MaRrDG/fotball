-- ============================================================
-- Migration: remove the penalty-shootout prediction (+1 bonus) (2026-06-27)
--
-- Drops the user-facing "who advances on penalties" pick entirely. The +1
-- bonus is gone, so knockout matches score exactly like group matches (exact /
-- goal-difference / trend), off the 90'/120' score.
--
-- NOTE: this only removes the PREDICTION side. matches.penalty_winner (the
-- actual shootout result) stays — it still decides who advances in the bracket
-- and who lifts the trophy when a Final goes to penalties.
--
-- Safe to run on a populated DB. score_match is re-defined without the bonus and
-- every already-scored match is re-scored so stored points drop the +1. The
-- column drop is last. Paste the whole file into the Supabase SQL editor.
-- ============================================================

-- 1. Re-define scoring without the penalty bonus.
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
  set points = public.calc_match_points(p.home_goals, p.away_goals, m.home_goals, m.away_goals, m.stage),
      is_bullseye = (p.home_goals = m.home_goals and p.away_goals = m.away_goals)
  where p.match_id = p_match_id;

  update public.matches set scored = true where id = p_match_id;
end;
$$;

-- 2. Re-score every finished match so stored points drop the old +1.
select public.score_match(id) from public.matches where scored = true;

-- 3. Tighten the write grants to no longer include penalty_winner, then drop it.
revoke insert, update on public.predictions from authenticated;
grant insert (user_id, match_id, home_goals, away_goals)
  on public.predictions to authenticated;
grant update (user_id, match_id, home_goals, away_goals)
  on public.predictions to authenticated;

alter table public.predictions drop column if exists penalty_winner;
