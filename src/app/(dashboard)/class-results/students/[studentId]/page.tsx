import Link from "next/link";
import {getInstructorStudentSessions} from "@/lib/results";
import {PageHeading,Section,EmptyState} from "@/components/AnalyticsUI";
import {SessionTable} from "@/components/SessionTable";
export default async function StudentDetail({params}:{params:Promise<{studentId:string}>}) {
 const {studentId}=await params,sessions=await getInstructorStudentSessions(studentId);
 if(!sessions.length)return <EmptyState title="Student history unavailable">No accessible sessions were found.</EmptyState>;
 const latest=sessions[0];return <><Link href="/class-results" className="text-primary">← Back to class results</Link><PageHeading eyebrow={latest.classDisplayName} title={latest.studentDisplayName} description={latest.studentIdCode??"Investigation history"}/><Section title="Sessions"><SessionTable rows={sessions} instructor/></Section></>;
}
