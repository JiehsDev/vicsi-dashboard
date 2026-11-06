// Real PostgreSQL policies, functions and triggers in an isolated WASM database. No production access.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE_PATH??'@electric-sql/pglite');
const admin='11111111-1111-4111-8111-111111111111',second='22222222-2222-4222-8222-222222222222',student='33333333-3333-4333-8333-333333333333',teacher='44444444-4444-4444-8444-444444444444',klass='55555555-5555-4555-8555-555555555555';
test('administrator membership and audit boundaries',async t=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
   create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.caller',true),'')::uuid$$;
   create table profiles(id uuid primary key,full_name text,role text);
   create table classes(id uuid primary key,name text,section text,academic_year text,semester text,archived_at timestamptz,instructor_id uuid);
   create table class_enrollments(class_id uuid,student_id uuid);
   create table class_join_invites(class_id uuid,invite_token text,join_code text,enabled boolean);
   insert into auth.users values('${admin}'),('${second}'),('${student}'),('${teacher}');
   insert into profiles values('${student}','Ana Reyes','student'),('${teacher}','Professor Reyes','instructor');
   alter table classes enable row level security;
   create policy own_class on classes for select to authenticated using(instructor_id=auth.uid());
   grant usage on schema public,auth to authenticated,anon;grant select on profiles,classes to authenticated;
  `);
  await db.exec(await readFile(new URL('../../supabase/migrations/022_admin_foundation.sql',import.meta.url),'utf8'));
  const caller=async id=>{await db.exec('reset role');await db.query("select set_config('test.caller',$1,false)",[id]);await db.exec('set role authenticated');};
  const setAccess=(id,active,reason='Staff access changed for departmental support')=>db.query('select set_system_admin_access($1,$2,$3)',[id,active,reason]);
  await t.test('migration promotes nobody; protected setup creates an auditable first administrator',async()=>{
   assert.equal((await db.query('select * from system_administrators')).rows.length,0);
   await db.query('insert into system_administrators(user_id,full_name) values($1,$2)',[admin,'System Administrator']);
   const rows=(await db.query('select * from system_audit_events')).rows;assert.equal(rows.length,1);assert.equal(rows[0].action,'admin.access.granted');assert.equal(rows[0].actor_name,'System setup');
  });
  await t.test('students, instructors and anonymous callers cannot read admin records or grant access',async()=>{
   for(const id of [student,teacher]){
    await caller(id);assert.equal((await db.query('select * from get_system_admin_identity()')).rows.length,0);
    assert.equal((await db.query('select * from system_administrators')).rows.length,0);assert.equal((await db.query('select * from system_audit_events')).rows.length,0);
    await assert.rejects(setAccess(admin,false),/UNAUTHORIZED/);await assert.rejects(db.query('insert into system_administrators(user_id,full_name) values($1,$2)',[student,'Injected administrator']),/permission denied/);
   }
   await db.exec('set role anon');await assert.rejects(db.query('select * from get_system_admin_identity()'),/permission denied/);
  });
  await t.test('active administrators can read audit/access records but receive no academic access expansion',async()=>{
   await caller(admin);assert.equal((await db.query('select * from get_system_admin_identity()')).rows[0].full_name,'System Administrator');
   assert.equal((await db.query('select * from system_administrators')).rows.length,1);assert.equal((await db.query('select * from system_audit_events')).rows.length,1);
   await assert.rejects(db.exec("update system_audit_events set actor_name='Forged';"),/permission denied/);
   await assert.rejects(db.exec('delete from system_audit_events;'),/permission denied/);
   await assert.rejects(db.exec('update system_administrators set active=false;'),/permission denied/);
  });
  await t.test('last administrator is protected through RPC, direct maintenance updates and deletion',async()=>{
   await caller(admin);await assert.rejects(setAccess(admin,false),/LAST_ADMIN/);
   await db.exec('reset role');await assert.rejects(db.exec('update system_administrators set active=false;'),/LAST_ADMIN/);await assert.rejects(db.exec('delete from system_administrators;'),/LAST_ADMIN/);
   assert.equal((await db.query('select count(*)::int n from system_audit_events')).rows[0].n,1);
  });
  await t.test('suspension is reasoned, audited, and revokes the next request without deleting records',async()=>{
   await db.query('insert into system_administrators(user_id,full_name) values($1,$2)',[second,'Second Administrator']);
   await caller(admin);await assert.rejects(setAccess(second,false,'short'),/VALIDATION_ERROR/);await setAccess(second,false);
   const changed=(await db.query("select * from system_audit_events where action='admin.access.disabled'")).rows[0];assert.equal(changed.actor_name,'System Administrator');assert.match(changed.reason,/departmental/);assert.equal(changed.changes.after.active,false);
   await caller(second);assert.equal((await db.query('select * from get_system_admin_identity()')).rows.length,0);await assert.rejects(setAccess(admin,false),/UNAUTHORIZED/);
   await caller(admin);await setAccess(second,true);assert.equal((await db.query('select * from system_administrators where active')).rows.length,2);
  });
  await t.test('class, enrollment and invitation changes are recorded atomically without credentials',async()=>{
   await db.exec('reset role');await db.query("select set_config('test.caller',$1,false)",[teacher]);
   await db.query('insert into classes values($1,$2,$3,$4,$5,null,$6)',[klass,'Forensic investigation','A','2026-2027','1st',teacher]);
   await db.query('insert into class_enrollments values($1,$2)',[klass,student]);
   await db.query('insert into class_join_invites values($1,$2,$3,true)',[klass,'secret-invite-token','SECRET_CODE']);
   await db.exec("update class_join_invites set invite_token='replacement-secret';");
   await db.exec("update classes set section='B';delete from class_enrollments;");
   await caller(admin);const records=(await db.query('select * from system_audit_events')).rows;
   for(const action of ['class.created','class.updated','class.enrolled','class.unenrolled','class.invitation.created','class.invitation.replaced'])assert.ok(records.some(row=>row.action===action),action);
   assert.doesNotMatch(JSON.stringify(records),/secret-invite-token|replacement-secret|SECRET_CODE/);
   assert.equal((await db.query('select * from classes')).rows.length,0);
   await caller(teacher);assert.equal((await db.query('select * from classes')).rows.length,1);assert.equal((await db.query('select * from system_audit_events')).rows.length,0);
  });
 }finally{await db.close();}
});
