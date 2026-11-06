import {notFound} from "next/navigation";
import {getClassDetail} from "@/lib/classes";
import {getResultDetail} from "@/lib/results";
import {studentHistoryPath} from "@/lib/classOverview";
import {SessionRecord} from "@/components/SessionRecord";

export default async function ClassStudentSession({params}: {
  params:Promise<{classId:string;studentId:string;sessionId:string}>;
}) {
  const {classId,studentId,sessionId}=await params;
  // Validate class ownership and current membership before reading the session.
  // All database calls retain the signed-in user's RLS restrictions.
  const detail=await getClassDetail(classId);
  const student=detail?.students.find(s=>s.studentId===studentId);
  if (!detail||!student) notFound();
  const result=await getResultDetail(sessionId,{educationalOnly:true});
  if (!result||result.studentId!==studentId) notFound();
  const back=studentHistoryPath(classId,studentId)+(result.isTestSession?"?includeTests=1":"");
  return <SessionRecord result={result} instructor studentName={student.fullName}
    className={`${detail.name}${detail.section?` · ${detail.section}`:""}`}
    backHref={back} backLabel="student sessions"/>;
}
