import {completeAccountSetup} from '@/lib/completeAccountSetup';
import {readSetupRequest,setupResponse} from '@/lib/accountSetupRequest';
export async function POST(request:Request){
 const input=await readSetupRequest(request);if(input.response)return input.response;
 const result=await completeAccountSetup(input.body.token,input.body.password,input.db);
 return setupResponse(result,result.status);
}
