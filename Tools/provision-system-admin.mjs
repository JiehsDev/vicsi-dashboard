// Protected operator setup. Can create the requested account; never sends email or resets existing passwords.
import {createClient} from '@supabase/supabase-js';
const args=process.argv.slice(2),arg=name=>args[args.indexOf(name)+1];
const email=args.includes('--email')?arg('--email')?.trim().toLowerCase():null;
const name=args.includes('--name')?arg('--name')?.trim():null;
if(!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!name||name.length>200){console.error('Usage: node --env-file=.env.local Tools/provision-system-admin.mjs --email <email> --name <display-name> [--apply] [--create-account]');process.exit(1);}
if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY){console.error('Server database credentials are missing.');process.exit(1);}
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(10000)})}});
try{
 const schema=await db.from('system_administrators').select('user_id').limit(0);
 if(schema.error)throw new Error('Apply migration 022 before provisioning administrator access. No account was created.');
 let match;
 for(let page=1;page<=100;page++){
  const {data,error}=await db.auth.admin.listUsers({page,perPage:200});if(error)throw new Error('Auth account lookup failed.');
  match=data.users.find(user=>user.email?.toLowerCase()===email);if(match||data.users.length<200)break;
 }
 let created=false;
 if(!match){
  if(!args.includes('--create-account'))throw new Error('No matching sign-in account. Use --create-account to provision the requested administrator account.');
  if(!args.includes('--apply')){console.log('Ready to create the selected administrator account. Pass --apply; the password will be requested privately.');process.exit(0);}
  const password=await readPrivatePassword();
  if(password.length<12)throw new Error('Use a password with at least 12 characters.');
  const {data,error}=await db.auth.admin.createUser({email,password,email_confirm:true});
  if(error||!data.user)throw new Error('The sign-in account could not be created.');
  match=data.user;created=true;
 }
 if(!match.email_confirmed_at)throw new Error('An existing, verified sign-in account is required.');
 console.log(created?'Requested sign-in account created.':'Existing verified account found.');
 const existing=await db.from('system_administrators').select('active').eq('user_id',match.id).maybeSingle();
 if(existing.error)throw new Error('Apply migration 022 before provisioning administrator access.');
 if(existing.data?.active){console.log('This account already has administrator access. No changes made.');process.exit(0);}
 if(!args.includes('--apply')){console.log('Ready. Pass --apply to grant administrator access to the selected account.');process.exit(0);}
 const {error}=await db.from('system_administrators').upsert({user_id:match.id,full_name:name,active:true},{onConflict:'user_id'});
 if(error){
  if(created){const rollback=await db.auth.admin.deleteUser(match.id);if(rollback.error)throw new Error('Access grant failed. The newly created sign-in account remains without administrator privileges.');throw new Error('Access grant failed. The newly created sign-in account was rolled back.');}
  throw new Error('Administrator access could not be granted. Existing account unchanged.');
 }
 console.log('Administrator access granted and audited. Sign in normally, then open /admin.');
}catch(error){console.error(error.message==='The operation was aborted due to timeout'?'Database connection timed out.':error.message);process.exitCode=1;}

async function readPrivatePassword(){
 if(!process.stdin.isTTY)throw new Error('Use an interactive terminal to enter the password privately.');
 process.stdout.write('Administrator password (hidden): ');
 process.stdin.setRawMode(true);process.stdin.resume();process.stdin.setEncoding('utf8');
 return new Promise((resolve,reject)=>{
  let password='';
  const cleanup=()=>{process.stdin.off('data',receive);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');};
  function receive(text){for(const c of text){if(c==='\u0003'){cleanup();reject(new Error('Setup cancelled.'));return;}if(c==='\r'||c==='\n'){cleanup();resolve(password);return;}if(c==='\u007f'||c==='\b')password=password.slice(0,-1);else password+=c;}}
  process.stdin.on('data',receive);
 });
}
