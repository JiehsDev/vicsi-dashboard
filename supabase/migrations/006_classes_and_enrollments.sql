-- 006_classes_and_enrollments.sql
--
-- Foundational tables the assessment-assignment/pairing-code system needs and that
-- do not exist anywhere yet (verified: no "classes" or "class_enrollments" table in
-- any prior migration or the live schema captured in 004 - the only existing
-- class-like grouping is the free-text profiles.section column). Kept deliberately
-- minimal: just enough to (a) give assessment_assignments a real class to belong to
-- and (b) let the pairing-code endpoint verify "does this student actually belong
-- to this class" without guessing at a richer model nobody has asked for yet.
--
-- Run in the Supabase SQL editor AFTER 005. Safe to re-run (CREATE TABLE IF NOT
-- EXISTS, DROP CONSTRAINT/POLICY IF EXISTS then ADD, matching every prior migration
-- in this repo). Purely additive - touches no existing table.

begin;

create table if not exists public.classes (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  section       text,
  instructor_id uuid not null references public.profiles (id) on delete restrict,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.classes is
  'A class/section an instructor teaches. Minimal by design - extend when a real need appears, not speculatively.';

alter table public.classes
  drop constraint if exists classes_instructor_must_be_instructor;
-- Enforced by a trigger, not a CHECK (a CHECK cannot reference another table).
create or replace function public.classes_instructor_is_instructor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = new.instructor_id and role = 'instructor'
  ) then
    raise exception 'classes.instructor_id must reference a profile with role = instructor';
  end if;
  return new;
end;
$$;

drop trigger if exists classes_instructor_is_instructor_trigger on public.classes;
create trigger classes_instructor_is_instructor_trigger
  before insert or update of instructor_id on public.classes
  for each row execute function public.classes_instructor_is_instructor();

create table if not exists public.class_enrollments (
  class_id    uuid not null references public.classes (id) on delete cascade,
  student_id  uuid not null references public.profiles (id) on delete cascade,
  enrolled_at timestamptz not null default now(),
  primary key (class_id, student_id)
);

comment on table public.class_enrollments is
  'Which students are enrolled in which class - the join table assessment-assignment authorization checks against.';

alter table public.class_enrollments
  drop constraint if exists class_enrollments_student_is_student;
create or replace function public.class_enrollments_student_is_student()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = new.student_id and role = 'student'
  ) then
    raise exception 'class_enrollments.student_id must reference a profile with role = student';
  end if;
  return new;
end;
$$;

drop trigger if exists class_enrollments_student_is_student_trigger on public.class_enrollments;
create trigger class_enrollments_student_is_student_trigger
  before insert or update of student_id on public.class_enrollments
  for each row execute function public.class_enrollments_student_is_student();

create index if not exists class_enrollments_student_id_idx on public.class_enrollments (student_id);
create index if not exists classes_instructor_id_idx on public.classes (instructor_id);

-- RLS: instructors manage/read their own classes and rosters; students read only
-- their own enrollment rows (never the whole roster) and the classes they're
-- enrolled in. No client-side insert/update/delete anywhere - enrollment changes
-- are a service-role/instructor-tooling concern, not exposed here yet (same
-- "narrower than it might eventually need to be" posture as 005).

alter table public.classes enable row level security;
alter table public.class_enrollments enable row level security;

drop policy if exists instructors_read_own_classes on public.classes;
create policy instructors_read_own_classes
  on public.classes for select
  to authenticated
  using (instructor_id = auth.uid());

drop policy if exists students_read_enrolled_classes on public.classes;
create policy students_read_enrolled_classes
  on public.classes for select
  to authenticated
  using (
    exists (
      select 1 from public.class_enrollments ce
      where ce.class_id = classes.id and ce.student_id = auth.uid()
    )
  );

drop policy if exists students_read_own_enrollments on public.class_enrollments;
create policy students_read_own_enrollments
  on public.class_enrollments for select
  to authenticated
  using (student_id = auth.uid());

drop policy if exists instructors_read_own_class_enrollments on public.class_enrollments;
create policy instructors_read_own_class_enrollments
  on public.class_enrollments for select
  to authenticated
  using (
    exists (
      select 1 from public.classes c
      where c.id = class_enrollments.class_id and c.instructor_id = auth.uid()
    )
  );

commit;
