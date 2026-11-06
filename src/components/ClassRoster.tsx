import Link from "./LoadingLink";
import type {EnrolledStudent} from "@/lib/classes";
import {studentHistoryPath} from "@/lib/classOverview";
import {EmptyState} from "./AnalyticsUI";

export function ClassRoster({classId,students}:{classId:string;students:EnrolledStudent[]}) {
  if (!students.length) return <EmptyState title="No students enrolled">Open Manage class to enroll a student.</EmptyState>;
  const sorted=[...students].sort((a,b)=>a.fullName.localeCompare(b.fullName)||a.studentId.localeCompare(b.studentId));
  return <ul className="class-roster" aria-label="Enrolled students">
    {sorted.map(student=><li key={student.studentId}>
      <Link href={studentHistoryPath(classId,student.studentId)}>
        <span>{student.fullName}</span><span aria-hidden="true">&rsaquo;</span>
      </Link>
    </li>)}
  </ul>;
}
