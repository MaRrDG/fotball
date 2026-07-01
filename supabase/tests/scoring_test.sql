-- ============================================================
-- Scoring engine tests — the source of truth lives in SQL, so this exercises
-- the REAL functions (calc_match_points, score_match) and the leaderboard view.
--
-- HOW TO RUN: paste into the Supabase SQL Editor (or `psql` against the DB)
-- and execute the whole file. It runs inside a transaction that ROLLS BACK at
-- the end — it inserts test rows, checks them, then undoes everything, so it
-- leaves the database exactly as it found it.
--
-- A passing run prints several "... passed" NOTICEs and ends with ROLLBACK.
-- A failing assertion aborts immediately with a message naming the bad case.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. calc_match_points — the per-match formula (pure, no setup)
--    exact score = GROUP 3 · elimination 4 (flat across every knockout round)
--    2 = same goal difference but not exact (same decisive margin, OR a draw
--        called as a draw) · 1 = right winner, wrong margin · 0 = wrong outcome
-- ------------------------------------------------------------
do $$
begin
  -- bulls-eye (exact score) — defaults to GROUP when no stage is passed
  assert public.calc_match_points(2,1, 2,1) = 3, 'exact 2-1 (group) -> 3';
  assert public.calc_match_points(0,0, 0,0) = 3, 'exact 0-0 (group) -> 3';

  -- bulls-eye: 3 in the group stage, a flat 4 through every elimination round
  assert public.calc_match_points(2,1, 2,1, 'GROUP') = 3, 'exact, group -> 3';
  assert public.calc_match_points(2,1, 2,1, 'R32')   = 4, 'exact, R32 -> 4';
  assert public.calc_match_points(2,1, 2,1, 'R16')   = 4, 'exact, R16 -> 4';
  assert public.calc_match_points(2,1, 2,1, 'QF')    = 4, 'exact, QF -> 4';
  assert public.calc_match_points(2,1, 2,1, 'SF')    = 4, 'exact, SF -> 4';
  assert public.calc_match_points(2,1, 2,1, '3RD')   = 4, 'exact, 3rd place -> 4';
  assert public.calc_match_points(2,1, 2,1, 'F')     = 4, 'exact, final -> 4';

  -- goal-difference and trend stay flat regardless of stage
  assert public.calc_match_points(3,1, 2,0) = 2, 'home win by 2 vs by 2 -> 2';
  assert public.calc_match_points(0,2, 1,3) = 2, 'away win by 2 vs by 2 -> 2';
  assert public.calc_match_points(3,1, 2,0, 'F') = 2, 'GD tier unchanged in the final -> 2';

  -- a draw is a 0-goal margin: a draw called as a draw matches the GD tier (+2)
  assert public.calc_match_points(1,1, 2,2) = 2, 'draw vs draw (same 0 margin) -> 2';
  assert public.calc_match_points(0,0, 2,2) = 2, 'goalless draw vs other draw -> 2';

  -- trend = right winner, wrong margin (a draw can never land here)
  assert public.calc_match_points(3,0, 1,0) = 1, 'home win by 3 vs by 1 -> 1';
  assert public.calc_match_points(0,3, 0,1) = 1, 'away win by 3 vs by 1 -> 1';
  assert public.calc_match_points(3,0, 1,0, 'F') = 1, 'trend tier unchanged in the final -> 1';

  -- misses (wrong outcome)
  assert public.calc_match_points(2,0, 0,1) = 0, 'predicted home win, was away win -> 0';
  assert public.calc_match_points(1,1, 2,1) = 0, 'predicted draw, was home win -> 0';
  assert public.calc_match_points(2,1, 1,1) = 0, 'predicted home win, was draw -> 0';
  assert public.calc_match_points(2,0, 0,1, 'F') = 0, 'wrong outcome scores 0 even in the final';

  raise notice '1. calc_match_points: all cases passed';
end $$;

-- ------------------------------------------------------------
-- 2. score_match — end to end: a group exact score (+3), an elimination exact
--    score (+4), and is_bullseye. A penalty final scores off its 1-1 result
--    like any other match (no shootout bonus).
--    Detach the auth.users FK so we can use synthetic profile ids; the whole
--    transaction is rolled back, so the constraint is restored.
-- ------------------------------------------------------------
do $$
declare c text;
begin
  select conname into c from pg_constraint
   where conrelid = 'public.profiles'::regclass and contype = 'f';
  if c is not null then
    execute format('alter table public.profiles drop constraint %I', c);
  end if;
end $$;

insert into public.profiles (id, nickname) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Alice'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Bob'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Cara');

-- High ids that won't collide with real football-data match ids.
insert into public.matches (id, kickoff, stage, status, home_goals, away_goals, penalty_winner) values
  (9000001, now(), 'GROUP', 'FT',  2, 1, null),   -- regular-time result, 2-1
  (9000002, now(), 'F',     'PEN', 1, 1, 'home'); -- final, 1-1, home win on pens

-- Predictions on the regular match (actual 2-1).
insert into public.predictions (user_id, match_id, home_goals, away_goals) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 9000001, 2, 1),  -- exact      -> 3 (+ bullseye)
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 9000001, 3, 0),  -- trend only -> 1
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 9000001, 0, 2);  -- wrong side -> 0

-- Predictions on the penalty final (actual 1-1; the shootout result no longer
-- affects scoring — only the 1-1 does).
insert into public.predictions (user_id, match_id, home_goals, away_goals) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 9000002, 1, 1),  -- final exact -> 4 (+ bullseye)
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 9000002, 1, 1),  -- final exact -> 4 (+ bullseye)
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 9000002, 0, 0);  -- draw-for-draw GD -> 2

select public.score_match(9000001);
select public.score_match(9000002);

do $$
declare p int; b boolean; s boolean;
begin
  select points, is_bullseye into p, b from public.predictions
   where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and match_id = 9000001;
  assert p = 3 and b, format('Alice/regular expected 3+bullseye, got %s/%s', p, b);

  select points into p from public.predictions
   where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' and match_id = 9000001;
  assert p = 1, format('Bob/regular expected 1, got %s', p);

  select points into p from public.predictions
   where user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' and match_id = 9000001;
  assert p = 0, format('Cara/regular expected 0, got %s', p);

  select points, is_bullseye into p, b from public.predictions
   where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and match_id = 9000002;
  assert p = 4 and b, format('Alice/penalty expected 4+bullseye (final exact), got %s/%s', p, b);

  select points, is_bullseye into p, b from public.predictions
   where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' and match_id = 9000002;
  assert p = 4 and b, format('Bob/penalty expected 4+bullseye (final exact), got %s/%s', p, b);

  select points into p from public.predictions
   where user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' and match_id = 9000002;
  assert p = 2, format('Cara/penalty expected 2 (draw-for-draw GD), got %s', p);

  -- both matches should now be flagged scored
  select scored into s from public.matches where id = 9000001;
  assert s, 'match 9000001 should be marked scored';

  raise notice '2. score_match: all cases passed';
end $$;

-- ------------------------------------------------------------
-- 3. leaderboard view — aggregation and tie-breaker columns
-- ------------------------------------------------------------
do $$
declare r public.leaderboard%rowtype;
begin
  select * into r from public.leaderboard
   where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  -- match_points = 3 (group regular) + 4 (elimination final) = 7
  assert r.match_points = 7, format('Alice match_points expected 7, got %s', r.match_points);
  -- two bulls-eyes (both predictions exact)
  assert r.bullseyes = 2, format('Alice bullseyes expected 2, got %s', r.bullseyes);
  -- only the GROUP match counts toward group_stage_points
  assert r.group_stage_points = 3, format('Alice group_stage_points expected 3, got %s', r.group_stage_points);

  raise notice '3. leaderboard: aggregation passed';
end $$;

rollback;

-- If you see the three "passed" notices above and no error, the scoring
-- engine is behaving correctly. ROLLBACK has reverted every test row.
