import Form from 'next/form';
import {SubmitButton} from '@/components/SubmitButton';
import Link from "next/link";
import {notFound} from "next/navigation";
import {getClassDetail} from "@/lib/classes";
import {getInstructorStudentSessions} from "@/lib/results";
import {studentHistoryPath} from "@/lib/classOverview";
import {PageHeading,Section,EmptyState,MetricStrip} from "@/components/AnalyticsUI";
import {PaginatedSessions} from "@/components/PaginatedSessions";

export default async function ClassStudentPage({params,searchParams}: {
  params:Promise<{classId:string;studentId:string}>;
  searchParams:Promise<{page?:string;includeTests?:string}>;
}) {
  const {classId,studentId}=await params;
  const query=await searchParams;
  const detail=await getClassDetail(classId);
  const student=detail?.students.find(s=>s.studentId===studentId);
  if (!detail||!student) notFound();
  const all=await getInstructorStudentSessions(studentId);
  const sessions=all.filter(s=>query.includeTests==="1"||!s.isTestSession);
  const base=studentHistoryPath(classId,studentId);
  return <div>
    <Link className="text-primary" href={`/classes/${encodeURIComponent(classId)}`}>← Back to class overview</Link>
    <PageHeading eyebrow={`${detail.name}${detail.section?` · ${detail.section}`:""}`} title={student.fullName} description={student.studentNumber??"Student investigation history"}/>
    <MetricStrip metrics={[
      {label:"Received sessions",value:sessions.length},
      {label:"Completed",value:sessions.filter(s=>s.completedAtUtc).length},
      {label:"Incomplete",value:sessions.filter(s=>!s.completedAtUtc).length},
    ]}/>
    <Section title="Student sessions">
      <Form action={base} className="student-history-filter">
        <label><input type="checkbox" name="includeTests" value="1" defaultChecked={query.includeTests==="1"}/> Include test sessions</label>
        <SubmitButton className="button" pendingLabel="Applying filters…">Apply</SubmitButton>
      </Form>
      {!sessions.length?<EmptyState title="No session received">{all.length?"Only test sessions have been received. Select Include test sessions to view them.":"No uploaded investigation is available for this student yet. A session will appear here after the headset uploads it."}</EmptyState>:
        <PaginatedSessions rows={sessions} query={query} basePath={base} sessionBasePath={`${base}/sessions`}/>}
    </Section>
  </div>;
}
