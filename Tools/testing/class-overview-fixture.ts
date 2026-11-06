// Loaded only by the synthetic dashboard fixture loader; no database access.
import type {ClassDetail,InstructorClass} from "../../src/lib/classes";
export {friendlyClassRpcError} from "../../src/lib/classes";
export async function getClassDetail(id:string):Promise<ClassDetail|null> {
  const detail=(globalThis as unknown as {__vicsiClassDetail?:ClassDetail}).__vicsiClassDetail;
  return detail?.id===id?detail:null;
}
export async function getInstructorClasses():Promise<InstructorClass[]> {
  return (globalThis as unknown as {__vicsiClasses?:InstructorClass[]}).__vicsiClasses??[];
}
