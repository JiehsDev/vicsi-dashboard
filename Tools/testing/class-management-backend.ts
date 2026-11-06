// Test-only action adapter. No database or authentication requests.
export interface ClassActionState {user:boolean;error:string|null;data:unknown;calls:Array<{name:string;args:Record<string,unknown>}>;invalidated:string[]}
const globals=globalThis as unknown as {__classActionState:ClassActionState};
export function resetClassActionState():ClassActionState {
  return globals.__classActionState={user:true,error:null,data:null,calls:[],invalidated:[]};
}
export async function createSupabaseServerClient(){return {
  auth:{getUser:async()=>({data:{user:globals.__classActionState.user?{id:"professor"}:null}})},
  rpc:async(name:string,args:Record<string,unknown>)=>{const state=globals.__classActionState;state.calls.push({name,args});return {data:state.data,error:state.error?{message:state.error}:null};},
};}
export function revalidatePath(path:string,type?:string){globals.__classActionState.invalidated.push(`${path}:${type}`);}
