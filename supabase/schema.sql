-- ============================================================
-- World Cup 2026 Office Predictor — Supabase schema
-- Run this whole file in the Supabase SQL Editor (Dashboard > SQL).
-- ============================================================

-- ------------------------------------------------------------
-- PROFILES (one row per auth user)
-- ------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  nickname    text not null check (char_length(nickname) between 1 and 24),
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Auto-create a profile when an auth user is created (invite or admin-created).
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, nickname)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nickname', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- TEAMS (name + group letter, derived from football-data.org fixtures)
-- ------------------------------------------------------------
create table public.teams (
  name        text primary key,
  group_name  text not null            -- 'A' .. 'L'
);

-- ------------------------------------------------------------
-- MATCHES (id = football-data.org match id; the local cache the UI reads)
-- ------------------------------------------------------------
create table public.matches (
  id              bigint primary key,
  kickoff         timestamptz not null,
  stage           text not null check (stage in ('GROUP','R32','R16','QF','SF','3RD','F')),
  round_label     text,                -- raw API round string, e.g. 'Group Stage - 1'
  home_team       text,
  away_team       text,
  -- Final score after 90' or 120' (excludes penalty shootout goals).
  home_goals      int,
  away_goals      int,
  status          text not null default 'NS',  -- NS, 1H, HT, 2H, ET, P, FT, AET, PEN ...
  penalty_winner  text check (penalty_winner in ('home','away')),
  scored          boolean not null default false,
  updated_at      timestamptz not null default now()
);

create index matches_kickoff_idx on public.matches (kickoff);

-- ------------------------------------------------------------
-- PREDICTIONS (one per user per match)
-- ------------------------------------------------------------
create table public.predictions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  match_id        bigint not null references public.matches (id) on delete cascade,
  home_goals      int not null check (home_goals between 0 and 99),
  away_goals      int not null check (away_goals between 0 and 99),
  penalty_winner  text check (penalty_winner in ('home','away')),
  points          int,                 -- null until the match is scored
  is_bullseye     boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),  -- audit trail (Section 5)
  unique (user_id, match_id)
);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger predictions_touch before update on public.predictions
  for each row execute function public.touch_updated_at();
create trigger matches_touch before update on public.matches
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------
-- TOURNAMENT PICKS (group winners + knockout bracket)
-- ------------------------------------------------------------
create table public.group_winner_picks (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  group_name  text not null check (char_length(group_name) = 1),
  team        text not null references public.teams (name) on delete cascade,
  updated_at  timestamptz not null default now(),
  primary key (user_id, group_name)
);

create table public.bracket_picks (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  round       text not null check (round in ('R16','QF','SF','F','CHAMP')),
  team        text not null references public.teams (name) on delete cascade,
  updated_at  timestamptz not null default now(),
  primary key (user_id, round, team)
);

-- Per-round slot cap: the React UI limits how many teams a player advances each
-- round (R16:16 QF:8 SF:4 F:2 CHAMP:1), but the cap MUST be enforced in the DB —
-- otherwise a player can insert every team into every round via the REST API and
-- guarantee maximum bracket points. Reject inserts past the cap for that round.
create or replace function public.bracket_slot_limit()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  cap int := case new.round
               when 'R16'   then 16
               when 'QF'    then 8
               when 'SF'    then 4
               when 'F'     then 2
               else 1                       -- CHAMP
             end;
begin
  if (select count(*) from public.bracket_picks
      where user_id = new.user_id and round = new.round) >= cap then
    raise exception 'pick limit reached for %', new.round;
  end if;
  return new;
end;
$$;

create trigger bracket_cap before insert on public.bracket_picks
  for each row execute function public.bracket_slot_limit();

create trigger gw_touch before update on public.group_winner_picks
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------
-- ACTUAL TOURNAMENT RESULTS (filled by the sync job / admin)
-- kind: GROUP_WINNER | R16 | QF | SF | F | CHAMP
-- ------------------------------------------------------------
create table public.tournament_results (
  kind        text not null check (kind in ('GROUP_WINNER','R16','QF','SF','F','CHAMP')),
  team        text not null,
  group_name  text,                    -- only for GROUP_WINNER
  primary key (kind, team)
);

-- ------------------------------------------------------------
-- SETTINGS (key/value: lock times, sync bookkeeping)
--   (group winner picks lock automatically per group — see group_pick_open)
--   bracket_picks_open  timestamptz — after last group match
--   bracket_picks_lock  timestamptz — first R32 kickoff minus 2h
--   last_fetch_date     YYYY-MM-DD  — sync bookkeeping
--   group_winners_filled 'true'     — sync bookkeeping
-- ------------------------------------------------------------
create table public.settings (
  key    text primary key,
  value  text
);

create or replace function public.setting_ts(k text)
returns timestamptz
language sql stable security definer set search_path = public
as $$
  select nullif(value, '')::timestamptz from public.settings where key = k;
$$;

-- ------------------------------------------------------------
-- LOCK HELPERS (backend is the source of truth — Section 3)
-- ------------------------------------------------------------

-- A match accepts prediction writes until T-30 minutes.
create or replace function public.match_is_open(p_match_id bigint)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.matches
    where id = p_match_id
      and now() < kickoff - interval '30 minutes'
  );
$$;

-- Group winner picks lock per group, automatically, when that group's first
-- group-stage match kicks off. A group with no scheduled match yet (teams not
-- drawn / fixtures not synced) stays open (min over no rows -> null -> infinity).
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

-- Bracket picks: editable only inside the [open, lock) window set by the admin.
create or replace function public.bracket_picks_open()
returns boolean
language sql stable security definer set search_path = public
as $$
  select now() >= coalesce(public.setting_ts('bracket_picks_open'), 'infinity'::timestamptz)
     and now() <  coalesce(public.setting_ts('bracket_picks_lock'), 'infinity'::timestamptz);
$$;

-- ------------------------------------------------------------
-- SCORING ENGINE (Section 4)
-- ------------------------------------------------------------
-- The exact-score (bulls-eye) reward grows through the knockout rounds; the
-- goal-difference (2) and trend (1) tiers stay flat. p_stage defaults to GROUP
-- so legacy 4-arg calls (e.g. tests) keep working.
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

-- ------------------------------------------------------------
-- LEADERBOARD (Section 7) — aggregates only, never raw hidden picks.
-- Tie-breakers: bullseyes, group-stage points.
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY (Sections 3 & 5)
-- ------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.teams               enable row level security;
alter table public.matches             enable row level security;
alter table public.predictions         enable row level security;
alter table public.group_winner_picks  enable row level security;
alter table public.bracket_picks       enable row level security;
alter table public.tournament_results  enable row level security;
alter table public.settings            enable row level security;

-- Profiles: everyone logged in can read; users may only change their nickname.
create policy "profiles readable" on public.profiles
  for select to authenticated using (true);
create policy "profiles update own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated;
grant update (nickname) on public.profiles to authenticated;

-- Reference data: read-only for users; written only by the service role.
create policy "teams readable" on public.teams
  for select to authenticated using (true);
create policy "matches readable" on public.matches
  for select to authenticated using (true);
create policy "results readable" on public.tournament_results
  for select to authenticated using (true);
create policy "settings readable" on public.settings
  for select to authenticated using (true);

-- Predictions — THE GOLDEN RULE:
--   * you always see your own;
--   * you see others' only once the match is locked (T-30);
--   * writes are rejected by the DB after T-30, whatever the UI says.
create policy "predictions select" on public.predictions
  for select to authenticated
  using (user_id = auth.uid() or not public.match_is_open(match_id));

create policy "predictions insert" on public.predictions
  for insert to authenticated
  with check (user_id = auth.uid() and public.match_is_open(match_id));

create policy "predictions update" on public.predictions
  for update to authenticated
  using (user_id = auth.uid() and public.match_is_open(match_id))
  with check (user_id = auth.uid() and public.match_is_open(match_id));

create policy "predictions delete" on public.predictions
  for delete to authenticated
  using (user_id = auth.uid() and public.match_is_open(match_id));

-- Never let users write points/bullseye — only home/away goals + penalty pick.
-- user_id/match_id stay in the update grant because upsert re-writes them on
-- conflict; RLS still forces them to the caller's own row on an open match.
revoke insert, update on public.predictions from authenticated;
grant insert (user_id, match_id, home_goals, away_goals, penalty_winner)
  on public.predictions to authenticated;
grant update (user_id, match_id, home_goals, away_goals, penalty_winner)
  on public.predictions to authenticated;

-- Group winner picks: same blind + lock rules, but per group — each group's
-- pick locks (and its picks go public) when that group's first match kicks off.
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

-- Bracket picks: editable only in the open window.
create policy "bracket select" on public.bracket_picks
  for select to authenticated
  using (user_id = auth.uid()
         or now() >= coalesce(public.setting_ts('bracket_picks_lock'), 'infinity'::timestamptz));
create policy "bracket insert" on public.bracket_picks
  for insert to authenticated
  with check (user_id = auth.uid() and public.bracket_picks_open());
create policy "bracket delete" on public.bracket_picks
  for delete to authenticated
  using (user_id = auth.uid() and public.bracket_picks_open());
