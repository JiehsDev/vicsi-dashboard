// Read-only HTTPS schema check. Never prints account data, URLs or credentials.
process.loadEnvFile('.env.local');
for(const [label,table,columns] of [
 ['018 VR access','student_vr_access_codes','student_id'],
 ['021 class invitations','class_join_invites','class_id'],
 ['022 administrator foundation','system_administrators','user_id'],
 ['023 account setup','account_setup_links','id'],
 ['023 suspension','profiles','suspended_at'],
 ['024 invitation emails','invitation_email_deliveries','id'],
]){
 try{
  const endpoint=new URL(`/rest/v1/${table}`,process.env.SUPABASE_URL);endpoint.searchParams.set('select',columns);endpoint.searchParams.set('limit','0');
  const response=await fetch(endpoint,{headers:{apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`},signal:AbortSignal.timeout(8000)});
  console.log(label+': '+(response.ok?'available':response.status===404||response.status===400?'not available':'check failed'));
 }catch{console.log(label+': connection unavailable');}
}
