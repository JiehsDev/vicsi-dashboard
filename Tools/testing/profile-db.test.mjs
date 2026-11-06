import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const modulePath=process.env.PGLITE_MODULE_PATH;
const {PGlite}=await import(modulePath??'@electric-sql/pglite');
const {pgcrypto}=await import(modulePath?new URL('./contrib/pgcrypto.js',modulePath).href:'@electric-sql/pglite/contrib/pgcrypto');
const admin='11111111-1111-4111-8111-111111111111',student='33333333-3333-4333-8333-333333333333',teacher='44444444-4444-4444-8444-444444444444';
test('profile SQL ownership, hashing, audit and identity preservation',async t=>{
 const db=new PGlite({extensions:{pgcrypto}});
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema extensions;create extension pgcrypto with schema extensions;
   create table auth.users(id uuid primary key,email text,created_at timestamptz default now(),last_sign_in_at timestamptz);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.caller',true),'')::uuid$$;
   create table profiles(id uuid primary key,full_name text,role text,student_id text,section text,pin_hash text,updated_at timestamptz default now());
   create table classes(id uuid primary key,name text,section text,academic_year text,semester text,archived_at timestamptz,instructor_id uuid);
   create table class_enrollments(class_id uuid,student_id uuid);
   create table class_join_invites(class_id uuid,invite_token text,join_code text,enabled boolean);
   create table student_vr_access_codes(student_id uuid primary key,access_code text,disabled_at timestamptz,updated_at timestamptz default now());
   create table assessment_sessions(id uuid,student_id uuid,score integer);
   create function student_class_invitation(p_code text default null,p_token text default null,p_join boolean default false)
   returns table(status text,class_id uuid,class_name text,class_section text,instructor_name text,academic_year text,semester text,already_enrolled boolean) language sql as $$select 'preview'::text,null::uuid,null::text,null::text,null::text,null::text,null::text,false$$;
   insert into auth.users(id,email) values('${admin}','admin@example.edu'),('${student}','internal@student.invalid'),('${teacher}','teacher@example.edu');
   insert into profiles(id,full_name,role,student_id,section) values('${student}','Ana Reyes','student','2026-001','A'),('${teacher}','Professor Reyes','instructor',null,null);
   insert into student_vr_access_codes(student_id,access_code) values('${student}','ABCDEFGH');
   insert into assessment_sessions values(gen_random_uuid(),'${student}',95);
   alter table profiles enable row level security;create policy own_profile on profiles for select to authenticated using(id=auth.uid());
   grant usage on schema public,auth to authenticated,anon,service_role;grant select on profiles to authenticated;
  `);
  for(const file of ['012_rate_limiting.sql','022_admin_foundation.sql','023_admin_users_and_setup_links.sql','025_self_service_profiles.sql'])await db.exec(await readFile(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8'));
  await db.query('insert into system_administrators(user_id,full_name) values($1,$2)',[admin,'Administrator']);
  const caller=async(id,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('test.caller',$1,false)",[id]);await db.exec(`set role ${role}`);};
  await t.test('anonymous and signed-out requests are denied; identity contains no credentials',async()=>{
   await caller('', 'anon');await assert.rejects(db.query('select * from get_my_account_profile()'),/permission denied/);
   await caller('');assert.equal((await db.query('select * from get_my_account_profile()')).rows.length,0);
   await assert.rejects(db.query("select update_my_account_name('Intruder')"),/UNAUTHORIZED/);
   await caller(student);const rows=(await db.query('select * from get_my_account_profile()')).rows;
   assert.equal(rows.length,1);assert.equal(rows[0].id,student);assert.equal(rows[0].role,'student');assert.ok(!('pin_hash' in rows[0]));
  });
  await t.test('own name edit cannot change role, Student ID, section, membership or session results',async()=>{
   await caller(student);assert.equal((await db.query("select update_my_account_name('Ana Santos') ok")).rows[0].ok,true);
   await assert.rejects(db.query("update profiles set role='instructor' where id=$1",[student]),/permission denied/);
   await db.exec('reset role');const p=(await db.query('select * from profiles where id=$1',[student])).rows[0];
   assert.equal(p.role,'student');assert.equal(p.student_id,'2026-001');assert.equal(p.section,'A');assert.equal(p.full_name,'Ana Santos');
   assert.equal((await db.query('select score from assessment_sessions where student_id=$1',[student])).rows[0].score,95);
   assert.equal((await db.query('select full_name from profiles where id=$1',[teacher])).rows[0].full_name,'Professor Reyes');
  });
  await t.test('direct RPC calls are rate limited even when application checks are bypassed',async()=>{
   await caller(student);for(let i=0;i<4;i++)await db.query('select update_my_account_name($1)',['Ana '+i]);
   await assert.rejects(db.query("select update_my_account_name('Too many')"),/RATE_LIMITED/);
  });
  await t.test('admin name changes preserve administrator access and academic identities',async()=>{
   await caller(admin);assert.equal((await db.query("select update_my_account_name('New Administrator') ok")).rows[0].ok,true);
   const row=(await db.query('select * from get_my_account_profile()')).rows[0];assert.equal(row.role,'admin');assert.equal(row.full_name,'New Administrator');
   assert.equal((await db.query('select is_system_administrator() ok')).rows[0].ok,true);
  });
  await t.test('PIN and security audit operations reject browser and anonymous roles',async()=>{
   for(const role of ['authenticated','anon']){
    await caller(student,role);await assert.rejects(db.query("select change_verified_student_pin($1,'5729')",[student]),/permission denied/);
    await assert.rejects(db.query("select record_account_security_event($1,'password')",[student]),/permission denied/);
   }
  });
  await t.test('PIN is bcrypt hashed, audited without secrets, and does not rotate the VR access code',async()=>{
   await caller('', 'service_role');assert.equal((await db.query("select change_verified_student_pin($1,'5729') ok",[student])).rows[0].ok,true);
   await db.exec('reset role');const hash=(await db.query('select pin_hash from profiles where id=$1',[student])).rows[0].pin_hash;
   assert.match(hash,/^\$2[aby]\$10\$/);assert.notEqual(hash,'5729');assert.equal((await db.query("select extensions.crypt('5729',$1)=$1 ok",[hash])).rows[0].ok,true);
   assert.equal((await db.query('select access_code from student_vr_access_codes where student_id=$1',[student])).rows[0].access_code,'ABCDEFGH');
   const logs=(await db.query("select * from system_audit_events where action='account.pin.changed'")).rows;assert.equal(logs.length,1);assert.ok(!JSON.stringify(logs).includes('5729'));assert.ok(!JSON.stringify(logs).includes(hash));
  });
  await t.test('suspended and inactive accounts fail closed; nonstudents cannot receive a PIN',async()=>{
   await caller('', 'service_role');assert.equal((await db.query("select change_verified_student_pin($1,'5729') ok",[teacher])).rows[0].ok,false);
   await db.exec('reset role');await db.query('update profiles set suspended_at=now() where id=$1',[student]);
   await caller(student);assert.equal((await db.query('select * from get_my_account_profile()')).rows.length,0);await assert.rejects(db.query("select update_my_account_name('Hidden')"),/UNAUTHORIZED/);
   await caller('', 'service_role');assert.equal((await db.query("select change_verified_student_pin($1,'5729') ok",[student])).rows[0].ok,false);
  });
  await t.test('invalid PINs and arbitrary audit content are rejected',async()=>{
   await caller('', 'service_role');for(const pin of ['0000','1234','4321','abc','12'])await assert.rejects(db.query('select change_verified_student_pin($1,$2)',[student,pin]),/VALIDATION_ERROR/);
   assert.equal((await db.query("select record_account_security_event($1,'arbitrary secret') ok",[teacher])).rows[0].ok,false);
  });
 }finally{await db.close();}
});
