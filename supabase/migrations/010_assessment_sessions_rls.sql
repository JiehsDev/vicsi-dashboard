-- 010_assessment_sessions_rls.sql
--
-- Read-only access rules for assessment_sessions and its seven child tables.
-- Same posture as 005_rls_policies_conservative_default.sql: SELECT only, scoped
-- to "your own" (student) or "your own class" (instructor); NO insert/update/
-- delete policy anywhere in this file for any client role. The only way any of
-- these nine tables is ever written to is the SECURITY DEFINER
-- submit_assessment_session() RPC in 011_assessment_rpcs.sql, callable only by
-- service_role - a student's device or a compromised anon key cannot write to
-- these tables even in principle, let alone under someone else's identity.
--
-- Run in the Supabase SQL editor AFTER 009. Safe to re-run.

begin;

drop policy if exists students_read_own_sessions on public.assessment_sessions;
create policy students_read_own_sessions
  on public.assessment_sessions for select
  to authenticated
  using (student_id = auth.uid());

drop policy if exists instructors_read_own_class_sessions on public.assessment_sessions;
create policy instructors_read_own_class_sessions
  on public.assessment_sessions for select
  to authenticated
  using (
    exists (
      select 1 from public.classes c
      where c.id = assessment_sessions.class_id and c.instructor_id = auth.uid()
    )
  );

-- Every child table follows the identical shape: readable by the owning student or
-- the owning instructor, joined back through assessment_sessions. Written as one
-- policy pair per table (not a shared view) so each table's grant is independently
-- auditable in the Supabase dashboard's policy list.

do $$
declare
  child text;
begin
  foreach child in array array[
    'session_score_categories', 'session_evidence_results', 'session_report_lines',
    'session_procedure_violations', 'session_relationships', 'session_hypotheses',
    'session_events'
  ]
  loop
    execute format(
      'drop policy if exists students_read_own_%1$s on public.%1$s;
       create policy students_read_own_%1$s
         on public.%1$s for select
         to authenticated
         using (
           exists (
             select 1 from public.assessment_sessions s
             where s.session_id = %1$s.session_id and s.student_id = auth.uid()
           )
         );',
      child
    );

    execute format(
      'drop policy if exists instructors_read_own_class_%1$s on public.%1$s;
       create policy instructors_read_own_class_%1$s
         on public.%1$s for select
         to authenticated
         using (
           exists (
             select 1
             from public.assessment_sessions s
             join public.classes c on c.id = s.class_id
             where s.session_id = %1$s.session_id and c.instructor_id = auth.uid()
           )
         );',
      child
    );
  end loop;
end $$;

commit;
