// Synthetic records only. Uses the HTTPS database API; no migration or SQL connection required.
// Preview: node --env-file=.env.local --import ./Tools/testing/register-tsx.mjs supabase/seed/seed-dashboard-demo.ts
// Write: append --apply. Re-runs preserve account passwords and existing unrelated data.
import {createClient} from '@supabase/supabase-js';
import {randomBytes} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {DEMO_SOURCE,DEMO_CLASS,DEMO_STUDENTS,demoUuid,buildDemoSession} from './dashboard-demo-data';
import {canonicalPayloadHash} from '../../src/lib/assessmentCrypto';
import {verifySession} from '../../src/lib/scoring/verify';

const apply=process.argv.includes('--apply');
const sessionPlan=[...DEMO_STUDENTS.flatMap(s=>s.levels.map((level,attempt)=>({code:s.code,attempt,level}))),...[1,2,3,4].map((level,attempt)=>({code:'2099-00099',attempt,level}))];
if(!apply){
  console.log(JSON.stringify({mode:'preview',class:DEMO_CLASS,newDemoStudents:DEMO_STUDENTS.length,johnDoeSessions:4,sessions:sessionPlan.map(s=>{const result=buildDemoSession('preview-student','preview-class',s.code,s.attempt,s.level);return {student:s.code,attempt:s.attempt+1,score:Math.round(result.score.overallScore!*10000)/100,documentation:`${result.documentation.points}/24`,testSession:true};})},null,2));
}else{
  const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw Error('Configure the server-only Supabase connection.');
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(15000)})}});
  const requireData=<T extends {data:unknown;error:unknown}>(result:T,label:string):T['data']=>{if(result.error){const code=typeof result.error==='object'&&'code' in result.error?result.error.code:'backend error';throw Error(`${label} failed (${code}).`);}return result.data;};
  const schemaResponse=await fetch(new URL('/rest/v1/',url),{headers:{apikey:key,Authorization:`Bearer ${key}`,Accept:'application/openapi+json'},signal:AbortSignal.timeout(10000)});
  if(!schemaResponse.ok)throw Error('Database schema could not be checked before seeding.');
  const schema=await schemaResponse.json();
  const legacyAssignmentRequired=schema.definitions?.assessment_sessions?.required?.includes('assignment_id')===true;
  const john=requireData(await db.from('profiles').select('id,role,full_name,student_id').eq('student_id','2099-00099').single(),'Find John Doe demo account');
  if(!john||john.full_name!=='John Doe'||john.role!=='student')throw Error('The expected John Doe demo identity no longer matches; refusing to guess.');
  const enrollments=requireData(await db.from('class_enrollments').select('class_id,classes(id,name,instructor_id)').eq('student_id',john.id),'Read demo enrollment');
  const original=(enrollments??[]).map(row=>row.classes as unknown as {id:string;name:string;instructor_id:string}).find(row=>row?.name==='ViCSI Dev Test Class');
  if(!original)throw Error('The expected existing demonstration class was not found.');
  const classId=demoUuid('class');
  const existingClass=requireData(await db.from('classes').select('id,name,instructor_id').eq('id',classId).maybeSingle(),'Check demo class');
  if(existingClass && (existingClass.name!==DEMO_CLASS||existingClass.instructor_id!==original.instructor_id))throw Error('Demo class identity conflict; no existing class will be overwritten.');
  if(!existingClass)requireData(await db.from('classes').insert({id:classId,name:DEMO_CLASS,section:'D',instructor_id:original.instructor_id,academic_year:'2026-2027',semester:'1st'}),'Create demo class');
  const assignments=new Map<string,string>();
  if(legacyAssignmentRequired)for(const scope of [classId,original.id]){
    const id=demoUuid(`legacy-assignment:${scope}`);
    const existing=requireData(await db.from('assessment_assignments').select('id,class_id,scenario_id,title').eq('id',id).maybeSingle(),'Check legacy demo scope');
    if(existing && (existing.class_id!==scope||existing.scenario_id!=='CSI-ENVIRONMENT-001'||existing.title!=='Demo data compatibility record'))throw Error('Legacy demo assignment identity conflict.');
    if(!existing)requireData(await db.from('assessment_assignments').insert({id,class_id:scope,scenario_id:'CSI-ENVIRONMENT-001',title:'Demo data compatibility record',is_active:false,created_by:original.instructor_id}),'Create inactive legacy demo scope');
    assignments.set(scope,id);
  }

  const credentialPath='test-output/dashboard-demo-credentials.json';
  await mkdir('test-output',{recursive:true});
  let credentials:Array<{studentId:string;password:string}>=[];
  try{credentials=JSON.parse(await readFile(credentialPath,'utf8'));}catch{/* Initial seed; credentials remain in ignored local output only. */}
  const users=[];
  for(let page=1;;page++){
    const data=requireData(await db.auth.admin.listUsers({page,perPage:200}),'Read account directory');
    users.push(...data.users);if(data.users.length<200)break;
  }
  const students=new Map<string,string>([['2099-00099',john.id]]);
  for(const definition of DEMO_STUDENTS){
    const email=`${definition.code.toLowerCase()}@students.traceboard.internal`;
    let user=users.find(u=>u.email?.toLowerCase()===email);
    if(user && user.app_metadata.vicsi_demo_seed!==DEMO_SOURCE)throw Error('A requested demo sign-in is already owned by another account; refusing to overwrite it.');
    if(!user){
      const password=randomBytes(24).toString('base64url');
      const created=requireData(await db.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{vicsi_demo_seed:DEMO_SOURCE}}),'Create demo student');
      user=created.user!;
      credentials.push({studentId:definition.code,password});
      // Persist immediately, so a later seed failure never loses a newly created login.
      await writeFile(credentialPath,JSON.stringify(credentials,null,2),{mode:0o600});
    }
    const profile=requireData(await db.from('profiles').select('id,role,student_id').eq('id',user.id).maybeSingle(),'Check demo profile');
    if(profile && (profile.role!=='student'||profile.student_id!==definition.code))throw Error('Demo profile identity mismatch.');
    if(!profile)requireData(await db.rpc('upsert_profile',{p_id:user.id,p_role:'student',p_full_name:definition.name,p_student_id:definition.code,p_section:'D',p_pin:null}),'Create demo profile');
    requireData(await db.from('class_enrollments').upsert({class_id:classId,student_id:user.id},{onConflict:'class_id,student_id'}),'Enroll demo student');
    students.set(definition.code,user.id);
  }
  const report:{source:string;synthetic:true;classId:string;sessions:Array<{student:string;sessionId:string;score:number;documentation:number|null}>;verifiedStudentRead?:boolean}={source:DEMO_SOURCE,synthetic:true,classId,sessions:[]};
  for(const plan of sessionPlan){
    // John remains in his existing demonstration class; no new enrollment or identity changes.
    const studentId=students.get(plan.code)!,scope=plan.code==='2099-00099'?original.id:classId;
    const {payload,score,documentation}=buildDemoSession(studentId,scope,plan.code,plan.attempt,plan.level);
    const hash=canonicalPayloadHash(payload);
    const existing=requireData(await db.from('assessment_sessions').select('student_id,class_id,client_version,is_test_session,payload_hash').eq('session_id',payload.sessionId).maybeSingle(),'Check seeded session');
    if(existing && (existing.student_id!==studentId||existing.class_id!==scope||existing.client_version!==DEMO_SOURCE||existing.is_test_session!==true||existing.payload_hash!==hash))throw Error('Seeded session conflict; refusing to overwrite an existing attempt.');
    if(!existing)requireData(await db.from('assessment_sessions').insert({session_id:payload.sessionId,student_id:studentId,class_id:scope,assignment_id:assignments.get(scope)??null,
      scenario_id:payload.scenarioId,scenario_version:payload.scenarioVersion,scoring_rules_version:payload.scoringRulesVersion,ground_truth_version:payload.groundTruthVersion,
      payload_version:1,payload_hash:hash,client_version:DEMO_SOURCE,is_test_session:true,
      started_at_utc:payload.startedAtUtc,completed_at_utc:payload.completedAtUtc,duration_seconds:payload.durationSeconds,
      selected_conclusion_id:payload.selectedConclusionId,resolved_ending_id:payload.resolvedEndingId,
      server_received_at_utc:new Date(Date.parse(payload.completedAtUtc)+30000).toISOString(),has_client_reported_scores:false}),'Insert synthetic session');
    requireData(await db.from('session_events').upsert(payload.orderedEvents.map(e=>({session_id:payload.sessionId,sequence_number:e.sequenceNumber,timestamp_ms:e.timestampMs,event_type:e.eventType,target_id:e.targetId,payload:e.payload})),{onConflict:'session_id,sequence_number'}),'Save demo timeline and answers');
    requireData(await db.from('session_evidence_results').upsert(payload.evidenceResults.map(e=>({session_id:payload.sessionId,evidence_id:e.evidenceId,final_status:e.finalStatus,swabbing_done:e.swabbingDone,fingerprinting_done:e.fingerprintingDone,is_flipped:e.isFlipped,fingerprint_lab_status:e.fingerprintLabStatus,tent_number:e.tentNumber,tent_letter:e.tentLetter})),{onConflict:'session_id,evidence_id'}),'Save demo evidence');
    requireData(await db.from('session_report_lines').upsert(payload.reportLineResults.map(r=>({session_id:payload.sessionId,evidence_id:r.evidenceId,line_id:r.lineId})),{onConflict:'session_id,evidence_id,line_id'}),'Save demo documentation');
    const verified=await verifySession(payload.sessionId);
    if(verified.status!=='verified'||verified.overallScore===undefined||Math.abs(verified.overallScore-score.overallScore!)>.000001)throw Error('The server did not verify the expected demonstration score.');
    report.sessions.push({student:plan.code,sessionId:payload.sessionId,score:Math.round(verified.overallScore*10000)/100,documentation:documentation.points});
  }
  const sample=credentials.find(c=>c.studentId===DEMO_STUDENTS[0].code);
  if(sample){
    const studentDb=createClient(url,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
    try{
      requireData(await studentDb.auth.signInWithPassword({email:`${sample.studentId.toLowerCase()}@students.traceboard.internal`,password:sample.password}),'Verify demo student sign-in');
      const visible=requireData(await studentDb.from('assessment_sessions').select('student_id,verified_score,is_test_session'),'Verify demo student result visibility');
      if(!visible||visible.length!==3||visible.some(row=>row.student_id!==students.get(sample.studentId)||!row.is_test_session)||!visible.some(row=>Number(row.verified_score)===1))throw Error('Student visibility did not match the seeded own-account sessions.');
      report.verifiedStudentRead=true;
    }finally{await studentDb.auth.signOut({scope:'local'});}
  }
  await writeFile('test-output/dashboard-demo-report.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify({seeded:true,newDemoStudents:DEMO_STUDENTS.length,demoClass:DEMO_CLASS,sessions:report.sessions.length,perfectSessions:report.sessions.filter(s=>s.score===100).length,studentReadVerified:report.verifiedStudentRead===true,credentialsFile:credentialPath,reportFile:'test-output/dashboard-demo-report.json',instructorView:'/class-results?includeTests=true',demoClassView:`/classes/${classId}`},null,2));
}
