// Isolated guard/action adapter. No database, account or cookie reads.
type State={userId:string|null;identity:{user_id:string;full_name:string}|null;error:string|null;identityCalls:number;writes:Record<string,unknown>[];invalidated:string[]};
const globals=globalThis as unknown as {__adminGuard:State};
export function resetAdminGuard():State{return globals.__adminGuard={userId:'11111111-1111-4111-8111-111111111111',identity:null,error:null,identityCalls:0,writes:[],invalidated:[]};}
export async function createSupabaseServerClient(){return {
 auth:{getUser:async()=>({data:{user:globals.__adminGuard.userId?{id:globals.__adminGuard.userId}:null}})},
 rpc:async(name:string,args?:Record<string,unknown>)=>{
  const state=globals.__adminGuard;
  if(name==='get_system_admin_identity'){state.identityCalls++;return {data:state.identity?[state.identity]:[],error:null};}
  state.writes.push(args??{});return {data:null,error:state.error?{message:state.error}:null};
 },
};}
export function revalidatePath(path:string){globals.__adminGuard.invalidated.push(path);}
