import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE_PATH??'@electric-sql/pglite');
const admin='11111111-1111-4111-8111-111111111111',student='33333333-3333-4333-8333-333333333333',teacher='44444444-4444-4444-8444-444444444444',newTeacher='66666666-6666-4666-8666-666666666666',klass='55555555-5555-4555-8555-555555555555';
test('stage 2 SQL permissions, suspension and setup-link lifecycle',async t=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
   create table auth.users(id uuid primary key,email text,created_at timestamptz default now(),last_sign_in_at timestamptz);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.caller',true),'')::uuid$$;
   create table profiles(id uuid primary key,full_name text,role text,student_id text,section text,updated_at timestamptz default now());
   create table classes(id uuid primary key,name text,section text,academic_year text,semester text,archived_at timestamptz,instructor_id uuid);
   create table class_enrollments(class_id uuid,student_id uuid);
   create table class_join_invites(class_id uuid,invite_token text,join_code text,enabled boolean);
   create table student_vr_access_codes(student_id uuid primary key,disabled_at timestamptz,updated_at timestamptz default now());
   create function check_rate_limit(p_bucket_key text,p_limit integer,p_window_seconds integer) returns table(allowed boolean,retry_after_seconds integer) language sql as $$select true,0$$;
   create function student_class_invitation(p_code text default null,p_token text default null,p_join boolean default false)
   returns table(status text,class_id uuid,class_name text,class_section text,instructor_name text,academic_year text,semester text,already_enrolled boolean) language sql as $$select 'preview'::text,null::uuid,null::text,null::text,null::text,null::text,null::text,false$$;
   insert into auth.users(id,email) values('${admin}','admin@example.edu'),('${student}','internal@student.invalid'),('${teacher}','teacher@example.edu');
   insert into profiles(id,full_name,role,student_id,section) values('${student}','Ana Reyes','student','2026-001','A'),('${teacher}','Professor Reyes','instructor',null,null);
   insert into student_vr_access_codes(student_id) values('${student}');
   alter table profiles enable row level security;create policy own_profile on profiles for select to authenticated using(id=auth.uid());
   alter table classes enable row level security;create policy own_class on classes for select to authenticated using(instructor_id=auth.uid());
   grant usage on schema public,auth to authenticated,anon,service_role;grant select on profiles,classes to authenticated;
  `);
  for(const file of ['022_admin_foundation.sql','023_admin_users_and_setup_links.sql','024_invitation_email_delivery.sql'])await db.exec(await readFile(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8'));
  await db.query('insert into system_administrators(user_id,full_name) values($1,$2)',[admin,'Administrator']);
  const caller=async(id,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('test.caller',$1,false)",[id]);await db.exec(`set role ${role}`);};
  const setup=(operation,overrides={})=>{const p={id:null,email:'newteacher@example.edu',name:'New Teacher',target:null,hash:'a'.repeat(64),cipher:'b'.repeat(80),reason:'Account holder requested assistance',...overrides};return db.query('select admin_account_setup($1,$2,$3,$4,$5,$6,$7,$8) id',[operation,p.id,p.email,p.name,p.target,p.hash,p.cipher,p.reason]);};
  let inviteId;
  await t.test('only admins can list/edit users or create links; credentials remain private',async()=>{
   await caller(student);await assert.rejects(db.query('select admin_list_users()'),/UNAUTHORIZED/);await assert.rejects(setup('invite'),/UNAUTHORIZED/);await assert.rejects(db.query('select * from account_setup_links'),/permission denied/);await assert.rejects(db.query('select * from admin_user_directory()'),/permission denied/);
   await caller(admin);const list=(await db.query('select admin_list_users() result')).rows[0].result;assert.equal(list.total,3);assert.equal(list.users.find(u=>u.user_id===student).email,null);
   assert.equal((await db.query("select admin_list_users('Ana','student','active',1) result")).rows[0].result.total,1);
   await assert.rejects(db.query('select admin_set_user_suspended($1,true,$2)',[admin,'Account holder requested assistance']),/PROTECTED_ACCOUNT/);
  });
  await t.test('edits keep identifiers; suspension denies stale tokens and restores prior VR disable state',async()=>{
   await db.query('select admin_update_user_profile($1,$2,$3,$4)',[student,'Ana Santos','B','Corrected official roster details']);
   const before=(await db.query('select admin_get_user($1) result',[student])).rows[0].result;assert.equal(before.student_id,'2026-001');assert.equal(before.full_name,'Ana Santos');
   await db.query('select admin_set_user_suspended($1,true,$2)',[student,'Temporarily suspended for support']);
   await caller(student);assert.equal((await db.query('select is_account_suspended() value')).rows[0].value,true);assert.equal((await db.query('select * from profiles')).rows.length,0);assert.equal((await db.query('select status from student_class_invitation()')).rows[0].status,'student_only');
   await db.exec('reset role');await db.query('update student_vr_access_codes set disabled_at=null where student_id=$1',[student]);assert.ok((await db.query('select disabled_at from student_vr_access_codes')).rows[0].disabled_at);
   await caller(admin);await db.query('select admin_set_user_suspended($1,false,$2)',[student,'Access restored after support review']);
   await db.exec('reset role');assert.equal((await db.query('select disabled_at from student_vr_access_codes')).rows[0].disabled_at,null);
   await db.exec("update student_vr_access_codes set disabled_at='2026-10-01T00:00:00Z'");
   await caller(admin);await db.query('select admin_set_user_suspended($1,true,$2)',[student,'Temporarily suspended for support']);await db.query('select admin_set_user_suspended($1,false,$2)',[student,'Access restored after support review']);await db.exec('reset role');assert.equal((await db.query('select disabled_at from student_vr_access_codes')).rows[0].disabled_at.toISOString(),'2026-10-01T00:00:00.000Z');
  });
  await t.test('invitations reject existing identities and duplicate pending links; replace invalidates old token',async()=>{
   await caller(admin);await assert.rejects(setup('invite',{email:'teacher@example.edu'}),/ACCOUNT_EXISTS/);inviteId=(await setup('invite')).rows[0].id;await assert.rejects(setup('invite'),/DUPLICATE_INVITE/);
   await setup('replace',{id:inviteId,hash:'c'.repeat(64)});
   await caller(admin,'service_role');assert.equal((await db.query('select claim_account_setup($1,$2) result',['a'.repeat(64),newTeacher])).rows[0].result,null);
  });
  await t.test('claim serializes redemption; in-progress links cannot be replaced or revoked',async()=>{
   const first=(await db.query('select claim_account_setup($1,$2) result',['c'.repeat(64),newTeacher])).rows[0].result;assert.equal(first.purpose,'instructor_invitation');assert.equal((await db.query('select claim_account_setup($1,$2) result',['c'.repeat(64),admin])).rows[0].result.busy,true);
   await caller(admin);await assert.rejects(setup('revoke',{id:inviteId}),/SETUP_BUSY/);await assert.rejects(setup('replace',{id:inviteId}),/SETUP_BUSY/);
   await db.exec('reset role');await db.query('insert into auth.users(id,email) values($1,$2)',[newTeacher,'newteacher@example.edu']);
   await caller(admin,'service_role');assert.equal((await db.query('select finish_account_setup($1,$2,$3) result',[inviteId,admin,newTeacher])).rows[0].result,false);assert.equal((await db.query('select finish_account_setup($1,$2,$3) result',[inviteId,newTeacher,newTeacher])).rows[0].result,true);
   assert.equal((await db.query('select claim_account_setup($1,$2) result',['c'.repeat(64),admin])).rows[0].result,null);
   await caller(admin);assert.equal((await db.query('select admin_get_user($1) result',[newTeacher])).rows[0].result.role,'instructor');
  });
  await t.test('recovery is target-bound; revoked/expired links fail, no raw secrets enter audit',async()=>{
   await assert.rejects(setup('recover',{target:admin}),/PROTECTED_ACCOUNT/);
   const recovery=(await setup('recover',{target:student,hash:'d'.repeat(64)})).rows[0].id;
   await setup('revoke',{id:recovery});await caller(admin,'service_role');assert.equal((await db.query('select claim_account_setup($1,$2) result',['d'.repeat(64),admin])).rows[0].result,null);
   await caller(admin);const audit=(await db.query('select * from system_audit_events')).rows;assert.ok(audit.some(row=>row.action==='staff.invitation.accepted'));assert.ok(audit.some(row=>row.action==='user.suspended'));assert.doesNotMatch(JSON.stringify(audit),/aaaaaaaaaaaaaaaa|bbbbbbbbbbbbbbbb|cccccccccccccccc/);
   await assert.rejects(db.query('select claim_account_setup($1,$2)',['d'.repeat(64),admin]),/permission denied/);
  });
  await t.test('expired claims, recovery target mismatch and later administrator promotion are denied',async()=>{
   const recovery=(await setup('recover',{target:student,hash:'e'.repeat(64)})).rows[0].id;
   await db.exec('reset role');await db.query("update account_setup_links set expires_at=now()-interval '1 minute' where id=$1",[recovery]);
   await caller(admin,'service_role');assert.equal((await db.query('select claim_account_setup($1,$2) result',['e'.repeat(64),admin])).rows[0].result,null);
   await caller(admin);await setup('replace',{id:recovery,hash:'f'.repeat(64)});
   await caller(admin,'service_role');await db.query('select claim_account_setup($1,$2)',['f'.repeat(64),admin]);assert.equal((await db.query('select finish_account_setup($1,$2,$3) result',[recovery,admin,teacher])).rows[0].result,false);
   assert.equal((await db.query('select finish_account_setup($1,$2,$3,true) result',[recovery,admin,null])).rows[0].result,true);
   await db.exec('reset role');await db.query('insert into system_administrators(user_id,full_name) values($1,$2)',[student,'Promoted Administrator']);
   await caller(admin,'service_role');assert.equal((await db.query('select claim_account_setup($1,$2) result',['f'.repeat(64),admin])).rows[0].result,null);
  });
  await t.test('email requests require admin access; uncertain retries reuse the same immutable job',async()=>{
   await caller(admin);const link=(await setup('invite',{email:'email-recipient@example.edu',hash:'1'.repeat(64)})).rows[0].id;
   await caller(teacher);await assert.rejects(db.query('select admin_begin_invitation_email($1,$2,$3)',[link,'onboarding@resend.dev','https://dashboard.example']),/UNAUTHORIZED/);await assert.rejects(db.exec('select * from invitation_email_deliveries'),/permission denied/);
   await caller(admin);const begin=()=>db.query('select admin_begin_invitation_email($1,$2,$3) result',[link,'onboarding@resend.dev','https://dashboard.example']);
   const job=(await begin()).rows[0].result.id;assert.equal((await begin()).rows[0].result.busy,true);
   await assert.rejects(db.query("select finish_invitation_email($1,'sent',$2)",[job,newTeacher]),/permission denied/);
   await caller(admin,'service_role');assert.equal((await db.query("select finish_invitation_email($1,'unknown',null,'network') result",[job])).rows[0].result,true);
   await db.exec('reset role');await db.query("update invitation_email_deliveries set attempted_at=now()-interval '2 minutes' where id=$1",[job]);
   await caller(admin);assert.deepEqual((await begin()).rows[0].result,{id:job,retry:true});
   await caller(admin,'service_role');await db.query("select record_invitation_email_event('evt-early',$1,'delivered',now())",[newTeacher]);await db.query("select finish_invitation_email($1,'sent',$2)",[job,newTeacher]);
   await caller(admin);let state=(await db.query('select * from admin_invitation_email_status($1)',[[link]])).rows;assert.equal(state[0].state,'delivered');
   const count=(await db.query('select count(*)::int n from system_audit_events')).rows[0].n;
   await caller(admin,'service_role');await db.query("select record_invitation_email_event('evt-early',$1,'delivered',now())",[newTeacher]);await db.query("select record_invitation_email_event('evt-old-sent',$1,'sent',now()-interval '1 minute')",[newTeacher]);
   await caller(admin);assert.equal((await db.query('select count(*)::int n from system_audit_events')).rows[0].n,count);
   await caller(admin,'service_role');await db.query("select record_invitation_email_event('evt-bounce',$1,'bounced',now())",[newTeacher]);
   await caller(admin);state=(await db.query('select * from admin_invitation_email_status($1)',[[link]])).rows;assert.equal(state[0].state,'bounced');
   await setup('replace',{id:link,hash:'2'.repeat(64)});assert.equal((await db.query('select * from admin_invitation_email_status($1)',[[link]])).rows.length,0);
   const fresh=(await begin()).rows[0].result.id;assert.notEqual(fresh,job);
   await db.exec('reset role');await db.query("update invitation_email_deliveries set created_at=now()-interval '24 hours',attempted_at=now()-interval '2 minutes',state='unknown' where id=$1",[fresh]);
   await caller(admin);await assert.rejects(begin(),/STATUS_UNKNOWN/);
   const audit=(await db.query('select * from system_audit_events')).rows;assert.ok(audit.some(row=>row.action==='staff.email.sent'));assert.doesNotMatch(JSON.stringify(audit),/bbbbbbbbbbbbbbbb|onboarding@resend.dev/);
  });
 }finally{await db.close();}
});
