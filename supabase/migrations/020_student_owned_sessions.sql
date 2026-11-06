-- Retire assignment requirements while preserving legacy rows and token compatibility.
-- Apply after 019. Existing RLS still limits instructors to their own classes.
begin;
alter table public.assessment_tokens alter column assignment_id drop not null;
alter table public.assessment_sessions alter column assignment_id drop not null;

create or replace function public.issue_vr_upload_token(
  p_student_id            uuid,
  p_session_id            text,
  p_scenario_id           text,
  p_class_id_hint         uuid,
  p_is_test_session       boolean,
  p_session_started_at    timestamptz,
  p_token_hash            text,
  p_ttl_seconds           integer
)
returns table (
  expires_at     timestamptz,
  class_id       uuid,
  assignment_id  uuid,
  scenario_id    text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code public.student_vr_access_codes%rowtype;
  v_existing_owner uuid;
  v_class uuid;
  v_assignment uuid;
  v_expires timestamptz;
begin
  if p_student_id is null then
    raise exception 'VALIDATION_ERROR: studentId is required';
  end if;
  if p_session_id is null or p_session_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'VALIDATION_ERROR: sessionId must be a UUID';
  end if;
  if p_token_hash is null or length(p_token_hash) <> 64 then
    raise exception 'VALIDATION_ERROR: malformed token hash';
  end if;
  if p_ttl_seconds is null or p_ttl_seconds < 60 or p_ttl_seconds > 3600 then
    raise exception 'VALIDATION_ERROR: ttl must be between 60 and 3600 seconds';
  end if;
  if not exists (select 1 from public.scenarios s where s.scenario_id = p_scenario_id) then
    raise exception 'VALIDATION_ERROR: unknown scenario';
  end if;

  if not exists (select 1 from public.profiles p where p.id = p_student_id and p.role = 'student') then
    raise exception 'STUDENT_NOT_FOUND: no student with that id';
  end if;

  select * into v_code from public.student_vr_access_codes c where c.student_id = p_student_id;
  if not found then
    raise exception 'STUDENT_NOT_PERMITTED: student has no VR access code';
  end if;
  if v_code.disabled_at is not null
     and (p_session_started_at is null or p_session_started_at >= v_code.disabled_at) then
    raise exception 'STUDENT_DISABLED: VR access is disabled for this student';
  end if;

  select s.student_id into v_existing_owner
  from public.assessment_sessions s
  where s.session_id = p_session_id;
  if found and v_existing_owner <> p_student_id then
    raise exception 'SESSION_OWNER_MISMATCH: session already belongs to another student';
  end if;

  -- The class scopes professor access; an assignment is never required.
  -- Reuse a previously stored session's class on retries, even after unenrollment.
  select s.class_id into v_class from public.assessment_sessions s
    where s.session_id = p_session_id and s.student_id = p_student_id;
  if not found then
    select ce.class_id into v_class
    from public.class_enrollments ce
    join public.classes c on c.id = ce.class_id
    where ce.student_id = p_student_id
    order by (ce.class_id = p_class_id_hint) desc nulls last,
      (c.archived_at is null) desc, ce.enrolled_at desc, ce.class_id
    limit 1;
  end if;
  if v_class is null then
    raise exception 'NO_CLASS_ENROLLMENT: enroll the student in a professor-owned class before uploading';
  end if;
  v_assignment := null;

  v_expires := now() + make_interval(secs => p_ttl_seconds);

  insert into public.assessment_tokens (
    token_hash, student_id, class_id, assignment_id, scenario_id, expires_at,
    purpose, bound_session_id, is_test_session
  ) values (
    p_token_hash, p_student_id, v_class, v_assignment, p_scenario_id, v_expires,
    'vr_session_upload', p_session_id, coalesce(p_is_test_session, false)
  );

  return query select v_expires, v_class, v_assignment, p_scenario_id;
end;
$$;

revoke all on function public.issue_vr_upload_token(uuid, text, text, uuid, boolean, timestamptz, text, integer)
  from public, anon, authenticated;
grant execute on function public.issue_vr_upload_token(uuid, text, text, uuid, boolean, timestamptz, text, integer)
  to service_role;


commit;
