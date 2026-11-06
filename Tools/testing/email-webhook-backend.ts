let failure=false;export const webhookWrites:Record<string,unknown>[]=[];
export function resetWebhookBackend(fail=false){failure=fail;webhookWrites.length=0;}
export function createSupabaseAdminClient(){return {rpc:async(name:string,args:Record<string,unknown>)=>{webhookWrites.push({name,...args});return {data:!failure,error:failure?{}:null};}};}
