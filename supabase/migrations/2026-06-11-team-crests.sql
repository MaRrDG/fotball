-- Team crest URLs straight from football-data.org (e.g.
-- https://crests.football-data.org/769.svg). Stored per match because the
-- crest id is not derivable from anything else we keep.
alter table matches add column if not exists home_crest text;
alter table matches add column if not exists away_crest text;
