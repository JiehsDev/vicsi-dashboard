-- 007_scenarios_and_assignments.sql
--
-- scenarios: the server-side mirror of Unity's ScenarioDefinition asset
-- (Assets/_Project/Scripts/Assessment/ScenarioDefinition.cs) - scenario_id is the
-- SAME natural-key text used throughout the wire contract ("CSI-ENVIRONMENT-001"),
-- not a synthetic uuid, matching this repo's existing convention of text natural
-- keys for cross-system ids (student_session_summary.session_id is 'SES-231' text,
-- not uuid - see 004's own reasoning). Every assessment_* table below references
-- scenarios(scenario_id) directly for the same reason: one join key, always the
-- same string Unity/Node/Postgres all already agree on, no translation layer.
--
-- assessment_assignments: one instance of "this class does this scenario, during
-- this window" - what a pairing code is actually issued against.
--
-- Run in the Supabase SQL editor AFTER 006. Safe to re-run. Purely additive.

begin;

create table if not exists public.scenarios (
  scenario_id          text primary key,
  display_name         text not null,
  scenario_version     text not null,
  scoring_rules_version text not null,
  ground_truth_version text not null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on table public.scenarios is
  'Server-side mirror of one Unity ScenarioDefinition asset. scenario_id is the same stable string Unity/the dashboard/Postgres all use.';

create table if not exists public.assessment_assignments (
  id             uuid primary key default gen_random_uuid(),
  class_id       uuid not null references public.classes (id) on delete cascade,
  scenario_id    text not null references public.scenarios (scenario_id) on delete restrict,
  title          text,
  is_active      boolean not null default true,
  opens_at       timestamptz,
  closes_at      timestamptz,
  created_by     uuid not null references public.profiles (id) on delete restrict,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.assessment_assignments is
  'One "this class does this scenario" assignment - what a pairing code and, later, an assessment_session are issued against.';

create index if not exists assessment_assignments_class_id_idx on public.assessment_assignments (class_id);
create index if not exists assessment_assignments_scenario_id_idx on public.assessment_assignments (scenario_id);

alter table public.assessment_assignments
  drop constraint if exists assessment_assignments_creator_is_instructor;
create or replace function public.assignments_creator_is_instructor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles where id = new.created_by and role = 'instructor'
  ) then
    raise exception 'assessment_assignments.created_by must reference a profile with role = instructor';
  end if;
  return new;
end;
$$;

drop trigger if exists assignments_creator_is_instructor_trigger on public.assessment_assignments;
create trigger assignments_creator_is_instructor_trigger
  before insert or update of created_by on public.assessment_assignments
  for each row execute function public.assignments_creator_is_instructor();

-- RLS: instructors manage assignments for their own classes; students read only
-- active assignments for classes they're enrolled in (never another class's, and
-- never an inactive/closed one - "is this assignment currently offered to me" is
-- exactly what the pairing-code creation endpoint needs to check, and exposing it
-- this way lets the dashboard pairing page's own "select an assignment" list use
-- the same authoritative read path rather than a separate server-only query).

alter table public.scenarios enable row level security;
alter table public.assessment_assignments enable row level security;

drop policy if exists authenticated_read_scenarios on public.scenarios;
create policy authenticated_read_scenarios
  on public.scenarios for select
  to authenticated
  using (true); -- scenario metadata (id/version/display name) is not sensitive

drop policy if exists instructors_read_own_assignments on public.assessment_assignments;
create policy instructors_read_own_assignments
  on public.assessment_assignments for select
  to authenticated
  using (
    exists (
      select 1 from public.classes c
      where c.id = assessment_assignments.class_id and c.instructor_id = auth.uid()
    )
  );

drop policy if exists students_read_active_enrolled_assignments on public.assessment_assignments;
create policy students_read_active_enrolled_assignments
  on public.assessment_assignments for select
  to authenticated
  using (
    is_active
    and (opens_at is null or opens_at <= now())
    and (closes_at is null or closes_at >= now())
    and exists (
      select 1 from public.class_enrollments ce
      where ce.class_id = assessment_assignments.class_id and ce.student_id = auth.uid()
    )
  );

commit;
