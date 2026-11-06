// Isolated PostgreSQL/WASM integration checks. No production credentials or reads.
// PGLITE_MODULE_PATH may point to an external installation; no application dependency.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE_PATH??'@electric-sql/pglite');
const student='11111111-1111-4111-8111-111111111111';
const professor='22222222-2222-4222-8222-222222222222';
const otherProfessor='33333333-3333-4333-8333-333333333333';
const klass='44444444-4444-4444-8444-444444444444';
const otherClass='55555555-5555-4555-8555-555555555555';
const session='66666666-6666-4666-8666-666666666666';
const hash='a'.repeat(64);

test('assignment-free token, ingest, retry and instructor isolation',async t=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
   create schema auth;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.caller',true),'')::uuid$$;
   create table profiles(id uuid primary key, role text);
   create table classes(id uuid primary key,instructor_id uuid,archived_at timestamptz);
   create table class_enrollments(class_id uuid references classes(id),student_id uuid references profiles(id),enrolled_at timestamptz default now());
   create table scenarios(scenario_id text primary key);
   create table assessment_assignments(id uuid primary key);
   create table student_vr_access_codes(student_id uuid primary key,disabled_at timestamptz);
   insert into profiles values ('${student}','student'),('${professor}','instructor'),('${otherProfessor}','instructor');
   insert into classes values ('${klass}','${professor}',null),('${otherClass}','${otherProfessor}',null);
   insert into class_enrollments(class_id,student_id) values ('${klass}','${student}');
   insert into scenarios values ('CSI-ENVIRONMENT-001');
   insert into student_vr_access_codes values ('${student}',null);`);
  for(const file of ['008_assessment_pairing_and_tokens.sql','009_assessment_sessions.sql','010_assessment_sessions_rls.sql','017_session_findings_insights.sql','019_vr_session_upload_tokens.sql','020_student_owned_sessions.sql'])
   await db.exec(await readFile(new URL(`../../supabase/migrations/${file}`,import.meta.url),'utf8'));
  const issue=(sessionId=session,classHint=otherClass,tokenHash=hash)=>db.query('select * from issue_vr_upload_token($1,$2,$3,$4,false,now(),$5,600)',[student,sessionId,'CSI-ENVIRONMENT-001',classHint,tokenHash]);
  await t.test('no assignment exists and an unowned class hint cannot override enrollment',async()=>{
   const {rows}=await issue();assert.equal(rows[0].class_id,klass);assert.equal(rows[0].assignment_id,null);
   assert.equal((await db.query('select count(*)::int as n from assessment_assignments')).rows[0].n,0);
  });
  await t.test('real ingest accepts a null assignment and preserves student ownership',async()=>{
   const payload={sessionId:session,payloadVersion:1,scenarioVersion:'1',scoringRulesVersion:'1.7.0',completedAtUtc:new Date().toISOString()};
   const args=[hash,JSON.stringify(payload),'b'.repeat(64)];
   await db.query('select * from submit_assessment_session($1,$2::jsonb,$3)',args);
   const {rows}=await db.query('select * from assessment_sessions');
   assert.equal(rows[0].student_id,student);assert.equal(rows[0].class_id,klass);assert.equal(rows[0].assignment_id,null);
   assert.equal((await db.query('select * from submit_assessment_session($1,$2::jsonb,$3)',args)).rows[0].duplicate,true);
  });
  await t.test('only the student and class owner can read the session through RLS',async()=>{
   await db.exec('grant usage on schema public,auth to authenticated; grant select on all tables in schema public to authenticated; set role authenticated;');
   for(const [caller,count] of [[student,1],[professor,1],[otherProfessor,0]]){
    await db.query("select set_config('test.caller',$1,false)",[caller]);
    assert.equal((await db.query('select count(*)::int as n from assessment_sessions')).rows[0].n,count);
   }
   await db.exec('reset role;');
  });
  await t.test('browser roles cannot issue upload tokens',async()=>{
   await db.exec('set role authenticated;');
   await assert.rejects(issue(),/permission denied/);await db.exec('reset role;');
  });
  await t.test('retry retains the original class after unenrollment',async()=>{
   await db.exec('delete from class_enrollments;');
   assert.equal((await issue(session,null,'c'.repeat(64))).rows[0].class_id,klass);
  });
  await t.test('new unenrolled attempts get actionable enrollment error',async()=>{
   await assert.rejects(issue('77777777-7777-4777-8777-777777777777'),/NO_CLASS_ENROLLMENT/);
  });
  await t.test('owner mismatch and disabled student checks remain enforced',async()=>{
   await db.query('update assessment_sessions set student_id=$1',[professor]);
   await assert.rejects(issue(),/SESSION_OWNER_MISMATCH/);
   await db.exec("update student_vr_access_codes set disabled_at=now()-interval '1 day';");
   await assert.rejects(issue(),/STUDENT_DISABLED/);
  });
 } finally {await db.close();}
});
