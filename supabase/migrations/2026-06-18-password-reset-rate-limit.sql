-- ============================================================
-- Migration: app-side rate limiting for password-reset requests (2026-06-18)
--
-- Supabase already throttles resetPasswordForEmail server-side, but the call
-- used to happen straight from the browser with no app-level choke point. The
-- reset request now goes through /api/auth/reset-password, which calls
-- check_password_reset_rate() before sending the email.
--
-- We record one row per attempt keyed by 'email:<addr>' and 'ip:<addr>' and
-- cap each over a rolling hour. The check + insert run inside one SECURITY
-- DEFINER function so concurrent requests can't slip past the limit.
--
-- Safe to run on a populated DB: only creates a new table/index/function.
-- Paste the whole file into the Supabase SQL editor and run it.
-- ============================================================

create table if not exists public.password_reset_attempts (
  id bigint generated always as identity primary key,
  identifier text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_password_reset_attempts_lookup
  on public.password_reset_attempts (identifier, created_at);

-- Lock the table down: only the service role (which bypasses RLS) and the
-- SECURITY DEFINER function below ever touch it. No policies = no anon access.
alter table public.password_reset_attempts enable row level security;

create or replace function public.check_password_reset_rate(p_email text, p_ip text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  email_count int;
  ip_count int;
begin
  select count(*) into email_count
    from public.password_reset_attempts
    where identifier = 'email:' || lower(p_email)
      and created_at > now() - interval '1 hour';

  select count(*) into ip_count
    from public.password_reset_attempts
    where identifier = 'ip:' || p_ip
      and created_at > now() - interval '1 hour';

  -- 3 resets per email and 20 per IP per rolling hour.
  if email_count >= 3 or ip_count >= 20 then
    return false;
  end if;

  insert into public.password_reset_attempts (identifier)
  values ('email:' || lower(p_email)), ('ip:' || p_ip);

  return true;
end;
$$;
