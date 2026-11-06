// Read-only connectivity diagnostics; no credentials, hosts, invite values or student data printed.
import dns from 'node:dns/promises';
import net from 'node:net';
process.loadEnvFile('.env.local');
const db=new URL(process.env.DATABASE_URL),api=new URL(process.env.SUPABASE_URL);
const ref=api.hostname.split('.')[0];
console.log('Database and app project match:',decodeURIComponent(db.username).endsWith('.'+ref)||db.hostname===`db.${ref}.supabase.co`);
const endpoints=[['configured-pooler',db.hostname,5432],['transaction-pooler',db.hostname,6543],['direct',`db.${ref}.supabase.co`,5432]];
await Promise.all(endpoints.map(async([label,host,port])=>{
 try{
  const records=await dns.lookup(host,{all:true});
  const result=await new Promise(resolve=>{
   const socket=net.connect({host,port});socket.setTimeout(4000);
   socket.on('connect',()=>{socket.destroy();resolve('reachable');});socket.on('timeout',()=>{socket.destroy();resolve('timed out');});socket.on('error',e=>resolve(e.code));
  });
  console.log(label,JSON.stringify({families:[...new Set(records.map(r=>r.family))],tcp:result}));
 }catch(error){console.log(label,error.code??'DNS unavailable');}
}));
try{
 const response=await fetch(new URL('/rest/v1/class_join_invites?select=class_id&limit=0',api),{headers:{apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`},signal:AbortSignal.timeout(8000)});
 const body=await response.json();console.log('HTTPS database API',JSON.stringify({status:response.status,code:body?.code??null}));
}catch(error){console.log('HTTPS database API',error.name);}
