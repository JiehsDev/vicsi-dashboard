// Test-loader-only dependency replacement. Never imported by the application.
import type {ResultDetail,InstructorResultRow} from "../../src/lib/results.ts";
export {applyResultFilters,validateDateRange} from "../../src/lib/results.ts";
const fixture=()=> (globalThis as unknown as {__vicsiDetails:ResultDetail[]}).__vicsiDetails;
export async function getMyResultSummaries(){return fixture();}
export async function getResultDetail(id:string){return fixture().find(r=>r.sessionId===id)??null;}
export async function getInstructorResultSummaries():Promise<InstructorResultRow[]>{return fixture().map((r,i)=>({...r,studentDisplayName:`Student ${i+1}`,studentIdCode:`DEMO-${i+1}`,classDisplayName:"Forensic investigation · Section A"}));}
export async function getInstructorStudentSessions(id:string){return (await getInstructorResultSummaries()).filter(r=>r.studentId===id);}
export async function getAnalyticsDetails(rows:ResultDetail[]){return fixture().filter(d=>rows.some(r=>r.sessionId===d.sessionId));}
