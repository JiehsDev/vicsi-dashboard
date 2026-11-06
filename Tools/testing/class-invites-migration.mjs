// Explicit, additive migration for the database configured by this dashboard.
// Pass --apply to write; the default only verifies prerequisites. No credentials are printed.
import {readFile} from 'node:fs/promises';
import dns from 'node:dns/promises';
process.loadEnvFile('.env.local');
const pg=await import(process.env.PG_MODULE_PATH??'pg');
const Client=pg.Client??pg.default.Client;
const connection=process.env.DATABASE_URL;
if(!connection)throw new Error('DATABASE_URL is not configured.');
const endpoint=new URL(connection);
if(process.argv.includes('--direct-database')){
 const ref=new URL(process.env.SUPABASE_URL).hostname.split('.')[0];
 if(decodeURIComponent(endpoint.username)!=='postgres.'+ref)throw new Error('Direct database fallback is unavailable for this database user.');
 endpoint.username='postgres';endpoint.hostname=`db.${ref}.supabase.co`;endpoint.port='5432';
 const records=await dns.resolve6(endpoint.hostname).catch(()=>[]);
 if(records.length)endpoint.hostname=`[${records[0]}]`;
}
if(process.argv.includes('--transaction-pooler')&&endpoint.hostname.endsWith('.pooler.supabase.com'))endpoint.port='6543';
const client=new Client({connectionString:endpoint.href,ssl:{rejectUnauthorized:false},sslNegotiation:process.argv.includes('--direct-tls')?'direct':'postgres',connectionTimeoutMillis:process.argv.includes('--diagnose')?45000:10000});
if(process.argv.includes('--diagnose')){
 for(const event of ['connect','sslconnect','authenticationCleartextPassword','authenticationSASL','authenticationSASLContinue','authenticationSASLFinal','readyForQuery'])
   client.connection.on(event,()=>console.log('PostgreSQL handshake:',event));
}
try{
 await client.connect();
 const {rows}=await client.query(`select to_regclass('public.classes') is not null as classes,
   to_regprocedure('public.check_rate_limit(text,integer,integer)') is not null as rate_limit,
   to_regprocedure('public.is_instructor_of_class(uuid)') is not null as ownership,
   to_regclass('public.class_join_invites') is not null as invitations`);
 if(!rows[0].classes||!rows[0].rate_limit||!rows[0].ownership)throw new Error('Database prerequisites are missing.');
 console.log('Database prerequisites verified. Existing invitation schema:',rows[0].invitations);
 if(process.argv.includes('--apply')){
   if(process.argv.includes('--invitation-email')){
     await client.query(await readFile(new URL('../../supabase/migrations/024_invitation_email_delivery.sql',import.meta.url),'utf8'));
     const result=await client.query(`select
       has_function_privilege('authenticated','public.admin_begin_invitation_email(uuid,text,text)','execute') as send_guard,
       not has_function_privilege('authenticated','public.finish_invitation_email(uuid,text,text,text)','execute') as results_private,
       not has_table_privilege('authenticated','public.invitation_email_deliveries','select') as secrets_private`);
     if(Object.values(result.rows[0]).some(value=>!value))throw new Error('Email permission verification failed.');
     console.log('Migration 024 applied. Email permissions verified. No emails were sent.');
   }else if(process.argv.includes('--admin-users')){
     await client.query(await readFile(new URL('../../supabase/migrations/023_admin_users_and_setup_links.sql',import.meta.url),'utf8'));
     const result=await client.query(`select
       has_function_privilege('authenticated','public.admin_list_users(text,text,text,integer)','execute') as directory_rpc,
       not has_function_privilege('authenticated','public.claim_account_setup(text,uuid)','execute') as redemption_private,
       not has_table_privilege('authenticated','public.account_setup_links','select') as link_secrets_private`);
     if(Object.values(result.rows[0]).some(value=>!value))throw new Error('User management privilege verification failed.');
     console.log('Migration 023 applied. User management and setup-link permissions verified.');
   }else if(process.argv.includes('--admin-foundation')){
     await client.query(await readFile(new URL('../../supabase/migrations/022_admin_foundation.sql',import.meta.url),'utf8'));
     const result=await client.query(`select
       has_function_privilege('authenticated','public.get_system_admin_identity()','execute') as identity_rpc,
       not has_function_privilege('anon','public.get_system_admin_identity()','execute') as anonymous_denied,
       not has_table_privilege('authenticated','public.system_administrators','insert') as self_promotion_denied,
       not has_table_privilege('authenticated','public.system_audit_events','update') as audit_rewrite_denied`);
     if(Object.values(result.rows[0]).some(value=>!value))throw new Error('Administrator privilege verification failed.');
     console.log('Migration 022 applied. Protected access and audit permissions verified. No accounts were promoted.');
   }else{
   await client.query(await readFile(new URL('../../supabase/migrations/021_class_self_enrollment.sql',import.meta.url),'utf8'));
   const result=await client.query(`select
     has_function_privilege('authenticated','public.student_class_invitation(text,text,boolean)','execute') as student_rpc,
     not has_function_privilege('anon','public.student_class_invitation(text,text,boolean)','execute') as anonymous_denied,
     not has_table_privilege('authenticated','public.class_join_invites','insert') as direct_writes_denied`);
   if(Object.values(result.rows[0]).some(value=>!value))throw new Error('Migration privilege verification failed.');
   console.log('Migration 021 applied. Authenticated RPC and restricted table permissions verified. Existing enrollments and sessions unchanged.');
   }
 }
}catch(error){const reason=/timeout|timed out/i.test(error.message??'')?'database connection timed out':error.code??'configuration or prerequisite failure';console.error('Class invitation migration could not complete:',reason);process.exitCode=1;}
finally{await client.end().catch(()=>{});}
