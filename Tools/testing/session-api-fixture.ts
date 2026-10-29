// Test-loader only. In-memory database; never reads environment credentials or networks.
import {createHash} from "node:crypto";
export interface FixtureState {payload:Record<string,unknown>|null;tokenHash:string;tokenStudent:string;rateAllowed:boolean;bindingSession:string|null;
  sessions:Record<string,unknown>[];events:Record<string,unknown>[];categories:Record<string,unknown>[];reportLines:Record<string,unknown>[];rpcs:string[];caller:string;role:"student"|"instructor";profile:Record<string,string>}
const globals=globalThis as unknown as {__sessionApiFixture:FixtureState};
export const fixture=()=>globals.__sessionApiFixture;
export function resetFixture():FixtureState {
  return globals.__sessionApiFixture={payload:null,tokenHash:createHash("sha256").update("fixture-token").digest("hex"),tokenStudent:"fixture-student",rateAllowed:true,bindingSession:null,
    sessions:[],events:[],categories:[],reportLines:[],rpcs:[],caller:"fixture-student",role:"student",profile:{role:"student",fullName:"Fixture learner"}};
}
export async function checkRateLimit(){return {allowed:fixture().rateAllowed};}
export const RATE_LIMITS={submissionPerToken:{limit:10,windowSeconds:60},submissionPerSession:{limit:10,windowSeconds:60}};
export async function getMyProfile(){return fixture().profile;}
function client(scoped=false) {
  return {
    auth:{async getUser(){return {data:{user:{id:fixture().caller,email:"fixture@invalid"}}};}},
    from(table:string){
      const conditions:Array<[string,unknown]>=[];let single=false;let update:Record<string,unknown>|null=null,from=0,to=999;
      const q={select(){return q;},eq(k:string,v:unknown){conditions.push([k,v]);return q;},in(k:string,v:unknown[]){conditions.push([k,v]);return q;},order(){return q;},range(a:number,b:number){from=a;to=b;return q;},update(v:Record<string,unknown>){update=v;return q;},maybeSingle(){single=true;return q;},
        then(resolve:(v:unknown)=>unknown){
          const state=fixture();const all=table==="assessment_sessions"?state.sessions:table==="session_events"?state.events:table==="session_score_categories"?state.categories:table==="session_report_lines"?state.reportLines:
            table==="assessment_tokens"?[{token_hash:state.tokenHash,purpose:state.bindingSession?"vr_session_upload":"pairing",bound_session_id:state.bindingSession,is_test_session:false}]:[];
          const visible=(r:Record<string,unknown>)=>!scoped||(table==="assessment_sessions"?state.role==="instructor"?r.class_id==="fixture-class":r.student_id===state.caller:
            state.sessions.some(s=>s.session_id===r.session_id&&(state.role==="instructor"?s.class_id==="fixture-class":s.student_id===state.caller)));
          const rows=all.filter(r=>visible(r)&&conditions.every(([k,v])=>Array.isArray(v)?v.includes(r[k]):r[k]===v));
          if(update)rows.forEach(r=>Object.assign(r,update));
          return Promise.resolve({data:single?(rows[0]??null):rows.slice(from,to+1),error:null}).then(resolve);
        }};return q;
    },
    async rpc(name:string,args:Record<string,unknown>) {
      const s=fixture();s.rpcs.push(name);
      if(name==="submit_assessment_session") {
        if(args.p_token_hash!==s.tokenHash)return {data:null,error:{message:"TOKEN_INVALID: test token invalid"}};
        const p=args.p_payload as Record<string,unknown>;s.payload=p;
        const old=s.sessions.find(r=>r.session_id===p.sessionId);
        if(old&&old.payload_hash!==args.p_payload_hash)return {data:null,error:{message:"SESSION_PAYLOAD_CONFLICT: conflict"}};
        const row=old??{session_id:p.sessionId,receipt_id:"fixture-receipt",student_id:s.tokenStudent,class_id:"fixture-class",assignment_id:"fixture-assignment",
          scenario_id:"CSI-ENVIRONMENT-001",scenario_version:p.scenarioVersion,scoring_rules_version:p.scoringRulesVersion,ground_truth_version:p.groundTruthVersion,
          started_at_utc:p.startedAtUtc,completed_at_utc:p.completedAtUtc,duration_seconds:p.durationSeconds,selected_conclusion_id:p.selectedConclusionId,resolved_ending_id:p.resolvedEndingId,
          verification_status:"pending_verification",payload_hash:args.p_payload_hash,server_received_at_utc:"2026-10-18T00:00:00Z"};
        if(!old){s.sessions.push(row);s.events.push(...(p.orderedEvents as Array<Record<string,unknown>>).map(e=>({session_id:p.sessionId,sequence_number:e.sequenceNumber,timestamp_ms:e.timestampMs,event_type:e.eventType,target_id:e.targetId,payload:e.payload})));}
        return {data:[{...row,duplicate:!!old}],error:null};
      }
      if(name==="save_verified_score") {
        const row=s.sessions.find(r=>r.session_id===args.p_session_id)!;row.verified_score=args.p_overall_score;row.verification_status="verified";
        s.categories.push(...Object.entries(args.p_categories as Record<string,number>).filter(([,value])=>value!==undefined).map(([key,value])=>({session_id:args.p_session_id,category_key:key,category_value:value,source:"server"})));
      }
      if(name==="mark_verification_failed"){const row=s.sessions.find(r=>r.session_id===args.p_session_id);if(row){row.verification_status=args.p_status;row.verification_message=args.p_message;}}
      return {data:null,error:null};
    }
  };
}
export const createSupabaseAdminClient=()=>client();
export const createSupabaseServerClient=async()=>client(true);
