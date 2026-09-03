-- 002_class_error_log.sql
--
-- FIXES A LIVE BUG: `src/lib/supabaseClient.ts` → getClassErrorLog() queries
-- a `class_error_log` relation that does not exist in the database (verified:
-- REST returns 404). The query therefore always errors and silently falls
-- back to mock data, so the "Common error log — classwide" panel on the
-- overview page can never show real numbers.
--
-- Columns match `mapErrorLogRow()` exactly: label, occurrences.

create table if not exists public.class_error_log (
  id          bigint generated always as identity primary key,
  label       text not null unique,
  occurrences integer not null default 0 check (occurrences >= 0),
  updated_at  timestamptz not null default now()
);

comment on table public.class_error_log is
  'Named procedural failure modes aggregated across the whole class.';

alter table public.class_error_log enable row level security;

drop policy if exists "authenticated read class error log" on public.class_error_log;
create policy "authenticated read class error log"
  on public.class_error_log for select
  to authenticated
  using (true);

-- Starter rows so the panel renders real data instead of the mock fallback.
-- Replace with values derived from real sessions once the VR game is
-- reporting errors; these mirror the current mock set.
insert into public.class_error_log (label, occurrences) values
  ('Incomplete scene photography', 23),
  ('Sequence violation',           23),
  ('Premature conclusion',         22),
  ('Chain-of-custody gap',         22),
  ('Cross-contamination',          22),
  ('Misidentified trace evidence', 22)
on conflict (label) do nothing;
