import {hashSetupToken,validSetupToken} from '@/lib/accountSetupCrypto';
import {readSetupRequest,setupResponse} from '@/lib/accountSetupRequest';
export async function POST(request:Request){
 const input=await readSetupRequest(request);if(input.response)return input.response;
 const token=input.body.token;if(!validSetupToken(token))return setupResponse({error:'This setup link is invalid.'},400);
 const {data,error}=await input.db.from('account_setup_links').select('full_name,purpose,accepted_at,revoked_at,expires_at,target_user_id').eq('token_hash',hashSetupToken(token)).maybeSingle();
 if(error)return setupResponse({error:'Account setup is temporarily unavailable.'},503);
 if(!data||data.accepted_at||data.revoked_at||Date.parse(data.expires_at)<=Date.now())return setupResponse({error:'This link has expired, was revoked, or has already been used. Ask your administrator for a new link.'},410);
 let suspended=false;
 if(data.target_user_id){const result=await input.db.from('profiles').select('suspended_at').eq('id',data.target_user_id).maybeSingle();if(result.error)return setupResponse({error:'Account details could not be checked. Try again.'},503);suspended=!!result.data?.suspended_at;}
 return setupResponse({name:data.full_name,purpose:data.purpose,expiresAt:data.expires_at,suspended});
}
