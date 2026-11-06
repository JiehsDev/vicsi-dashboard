// Isolated PostgreSQL integration checks. No production credentials or data.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE_PATH??'@electric-sql/pglite');
const teacher='11111111-1111-4111-8111-111111111111',student='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333',klass='44444444-4444-4444-8444-444444444444';
test('class invitations enforce ownership, authenticated self enrollment, revocation and rate limiting',async t=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema extensions;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.caller',true),'')::uuid$$;
   create table profiles(id uuid primary key,role text,full_name text);
   create table classes(id uuid primary key,instructor_id uuid,name text,section text,academic_year text,semester text,archived_at timestamptz);
   create table class_enrollments(class_id uuid references classes(id),student_id uuid references profiles(id),enrolled_at timestamptz default now(),primary key(class_id,student_id));
   create function is_instructor() returns boolean language sql stable as $$select exists(select 1 from profiles where id=auth.uid() and role='instructor')$$;
   create function is_instructor_of_class(p_class_id uuid) returns boolean language sql stable as $$select exists(select 1 from classes where id=p_class_id and instructor_id=auth.uid())$$;
   -- Test-only entropy adapter: PGlite lacks pgcrypto; production uses the existing pgcrypto extension.
   create function extensions.gen_random_bytes(n integer) returns bytea language sql volatile as $$select substring(decode(replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),'hex') from 1 for n)$$;
   insert into profiles values('${teacher}','instructor','Professor Reyes'),('${student}','student','Ana'),('${other}','instructor','Other professor');
   insert into classes values('${klass}','${teacher}','Forensic investigation','A','2026-2027','1st',null);
   grant usage on schema public,auth to authenticated,anon;grant select on profiles,classes to authenticated;
  `);
  for(const name of ['012_rate_limiting.sql','021_class_self_enrollment.sql'])await db.exec(await readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8'));
  const caller=async id=>{await db.exec('reset role;');await db.query("select set_config('test.caller',$1,false)",[id]);await db.exec('set role authenticated;');};
  const manage=action=>db.query('select manage_class_invitation($1,$2)',[klass,action]);
  let invitation;
  await t.test('owner creates a stable invitation, other instructors and students cannot manage or read it',async()=>{
   await caller(teacher);await manage('create');invitation=(await db.query('select * from class_join_invites')).rows[0];assert.match(invitation.join_code,/^[A-HJ-NP-Z2-9]{10}$/);assert.match(invitation.invite_token,/^[a-f0-9]{64}$/);
   await manage('create');assert.equal((await db.query('select * from class_join_invites')).rows[0].invite_token,invitation.invite_token);
   for(const id of [student,other]){await caller(id);assert.equal((await db.query('select * from class_join_invites')).rows.length,0);await assert.rejects(manage('reset'),/UNAUTHORIZED/);await assert.rejects(db.query('insert into class_join_invites values($1,$2,$3,true,now())',[klass,'ABCDEFGHJK','a'.repeat(64)]),/permission denied/);}
  });
  const attempt=async(code=null,token=null,join=false)=>(await db.query('select * from student_class_invitation($1,$2,$3)',[code,token,join])).rows[0];
  await t.test('preview does not enroll; POST joins only the caller and repeat joins are idempotent',async()=>{
   await caller(student);const preview=await attempt(invitation.join_code.toLowerCase());assert.equal(preview.status,'ready');assert.equal(preview.instructor_name,'Professor Reyes');
   await db.exec('reset role');assert.equal((await db.query('select * from class_enrollments')).rows.length,0);await caller(student);
   assert.equal((await attempt(null,invitation.invite_token,true)).status,'joined');assert.equal((await attempt(invitation.join_code,null,true)).status,'already_enrolled');
   await db.exec('reset role');const rows=(await db.query('select * from class_enrollments')).rows;assert.equal(rows.length,1);assert.equal(rows[0].student_id,student);
  });
  await t.test('anonymous and instructor callers cannot join',async()=>{
   await caller(other);assert.equal((await attempt(invitation.join_code,null,true)).status,'student_only');await db.exec('set role anon');await assert.rejects(attempt(invitation.join_code),/permission denied/);
  });
  await t.test('off, replacement and archived states reject old invitations without removing membership',async()=>{
   await caller(teacher);await manage('disable');await caller(student);assert.equal((await attempt(null,invitation.invite_token)).status,'invalid');
   await caller(teacher);await manage('enable');await manage('reset');const replacement=(await db.query('select * from class_join_invites')).rows[0];assert.notEqual(replacement.invite_token,invitation.invite_token);
   await caller(student);assert.equal((await attempt(invitation.join_code)).status,'invalid');assert.equal((await attempt(null,invitation.invite_token)).status,'invalid');
   await db.exec(`reset role;update classes set archived_at=now();`);await caller(student);assert.equal((await attempt(replacement.join_code,null,true)).status,'invalid');await db.exec('reset role');assert.equal((await db.query('select * from class_enrollments')).rows.length,1);
  });
  await t.test('invalid guesses persist their shared rate limit',async()=>{
   await db.exec('reset role;delete from rate_limit_counters;');await caller(student);
   for(let i=0;i<30;i++)assert.equal((await attempt('BAD')).status,'invalid');assert.equal((await attempt('BAD')).status,'rate_limited');
  });
 }finally{await db.close();}
});
