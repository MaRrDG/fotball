# ⚽ WC2026 Office Predictor

A private World Cup 2026 prediction game for your office. Next.js + Supabase,
with [football-data.org](https://www.football-data.org) (API v4) as the source
of truth for fixtures and scores.

- **Invite-only** — no public sign-up; the admin creates accounts.
- **Blind predictions** — nobody sees colleagues' picks until a match locks
  (30 min before kick-off). Enforced by Postgres Row Level Security, not just the UI.
- **Hard deadlines** — the database rejects any write after T-30, whatever the client says.
- **Automatic scoring** — 5 / 3 / 2 / 0 points per match (+2 penalty-shootout bonus),
  group winners (10), bracket (R16 5 · QF 10 · SF 20 · Final 30 · Champion 50).
- **Free-tier friendly** — the app never calls football-data.org from page loads; a
  rationed sync job stays far under the free tier's 10 requests/minute cap.

## 1. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste the whole of [`supabase/schema.sql`](supabase/schema.sql), run it.
3. In **Authentication → Sign In / Up**, disable **Allow new users to sign up**
   (accounts are created by you only).
4. In **Authentication → URL Configuration**, set the Site URL to your deployed URL and add
   `https://your-app/auth/confirm` to the redirect list (needed if you use email invites).
5. Copy the project URL, anon key and service-role key from **Project Settings → API**.

## 2. Configure & run

```bash
cp .env.example .env.local   # fill in the values
npm install
npm run dev
```

## 3. Make yourself admin

Create your own account first (easiest: Supabase dashboard **Authentication → Users →
Add user**, with "Auto confirm" on). Then in the SQL Editor:

```sql
update public.profiles set is_admin = true
where id = (select id from auth.users where email = 'you@company.com');
```

## 4. Seed the schedule

Open **/admin** in the app and press **Seed full schedule** (1 API request pulls
all fixtures; team/group mappings are derived from them). Then set the three lock times:

| Setting | Per the rules |
|---|---|
| Group winner picks lock | Opening match kick-off − 2 h |
| Bracket picks open | After the last group-stage match |
| Bracket picks lock | First Round-of-32 kick-off − 2 h |

## 5. Create player accounts

From **/admin → Create player account** (email + temp password + nickname), or send
invites from the Supabase dashboard (**Authentication → Users → Invite user** — the
invite link routes through `/auth/confirm` and asks them to set a password).
Players pick their leaderboard nickname on **/profile**.

## 6. Schedule the sync job

`GET /api/cron/sync` (secured by `CRON_SECRET`) is the only thing that talks to
football-data.org. It is safe to call every 10 minutes — it only spends an API
request when:

- today's fixtures haven't been fetched yet (the "03:00 daily fetch"), or
- a match is inside its live window (kick-off − 10 min → +3.5 h, until the API
  reports the match finished).

After every tick it scores finished matches, fills knockout-round results, and — once
the Round-of-32 draw exists — spends one extra request on standings to record the
official group winners. That is at most ~1 request per 10 minutes, far inside the
free tier's 10 requests/minute limit.

**Options for the every-10-minutes trigger:**

- [cron-job.org](https://cron-job.org) (free): call
  `https://your-app/api/cron/sync?secret=YOUR_CRON_SECRET` every 10 minutes.
- GitHub Actions `schedule:` workflow doing a `curl` of the same URL.
- Vercel Pro: change `vercel.json` to `*/10 * * * *`.

The included `vercel.json` registers a daily 03:00 UTC cron (the free Vercel plan
allows daily crons); Vercel automatically sends `Authorization: Bearer $CRON_SECRET`.
Keep it as a backstop even if you add an external 10-minute cron.

## 7. Deploy

Push to GitHub → import in Vercel → set the five env vars from `.env.example` →
deploy. Point your colleagues at the URL, collect the buy-ins, print the trophy. 🏆

## How fairness is enforced (for the office lawyers)

- **T-30 lock**: RLS policies call `match_is_open()`, which compares `now()` against
  `kickoff - 30 minutes` *in the database*. A request at 19:31 for a 20:00 match fails
  with a permission error regardless of what the UI allowed.
- **Blind picks**: the predictions `SELECT` policy only returns other people's rows
  once the match is locked.
- **Audit trail**: `predictions.updated_at` is maintained by a DB trigger — disputes
  are settled with one SQL query.
- **No score tampering**: users can only write `home_goals`/`away_goals`/`penalty_winner`
  (column-level grants); `points` is written exclusively by the `score_match()` function,
  which runs only after football-data.org reports a final status.

## Prize pool (off-platform, per the office rules)

20 × $10 buy-in → 1st: 60% + trophy · 2nd: 25% · 3rd: 15% · last place brings donuts.
