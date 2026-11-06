import {PendingForm,SubmitButton} from '@/components/SubmitButton';
import { NotificationModal } from "@/components/NotificationModal";
// src/app/(dashboard)/classes/[classId]/page.tsx
import Link from "next/link";
import { ArrowLeft, Archive, ArchiveRestore } from "lucide-react";
import { getClassDetail } from "@/lib/classes";
import { ClassRoster } from "@/components/ClassRoster";
import { Section } from "@/components/AnalyticsUI";
import { archiveClassAction, enrollStudentAction, removeStudentAction, updateClassAction } from "../actions";
import { Card } from "@/components/Card";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { formatAcademicPeriod } from "@/components/AcademicPeriodFields";
import {ManageClassButton,EnrollStudentButton} from "@/components/ManageClassButton";
import {ClassDetailsFields} from "@/components/ClassDetailsFields";
import {getClassInvite} from "@/lib/classInvitesServer";
import {ClassInviteShare} from "@/components/ClassInviteShare";
import {manageClassInviteAction} from "../actions";

const SUCCESS_MESSAGES: Record<string, string> = {
  created: "Class created.",
  updated: "Class updated.",
  archived: "Class archived. It stays visible, but can't take new enrollments until restored.",
  restored: "Class restored.",
  enrolled: "Student enrolled.",
  removed: "Student removed from this class. Their past results are unaffected.",
};

export default async function ClassDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string }>;
  searchParams: Promise<{ error?: string } & Record<string, string | undefined>>;
}) {
  const { classId } = await params;
  const { error, manage, enroll, ...rest } = await searchParams;
  const successKey = Object.keys(SUCCESS_MESSAGES).find((k) => rest[k] === "1");

  const detail = await getClassDetail(classId);

  if (!detail) {
    return (
      <div>
        <BackLink />
        <Card tint className="mt-6">
          <p className="text-[13.5px] text-ink-muted">That class doesn&apos;t exist, or isn&apos;t one of yours.</p>
        </Card>
      </div>
    );
  }


  const editFormId=`edit-class-${classId}`;
  const enrollmentFormId=`enroll-student-${classId}`;
  const {invite,unavailable:inviteUnavailable}=detail.archivedAt?{invite:null,unavailable:false}:await getClassInvite(classId);
  const editingValues=manage==="1"&&error?{
    name:rest.name??detail.name,section:rest.section??detail.section,
    academicYear:rest.academicYear??detail.academicYear,semester:rest.semester??detail.semester,
  }:detail;
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <BackLink />

      </div>

      <div className="class-detail-heading">
        <div className="class-detail-heading-copy">
          <div className="text-[11px] font-bold uppercase tracking-wide text-primary">Classes</div>
          <h1 className="mt-1 text-[24px] font-bold tracking-tight text-ink">{detail.name}</h1>
          <p className="mt-1 text-[13px] text-ink-muted">
            {detail.section ? `Section ${detail.section}` : "No section set"}
            {formatAcademicPeriod(detail.academicYear, detail.semester) && (
              <>
                {" · "}
                {formatAcademicPeriod(detail.academicYear, detail.semester)}
              </>
            )}
          </p>
        {detail.archivedAt && (
          <span className="inline-flex items-center rounded-full bg-ink-subtle/10 px-3 py-1.5 text-[12px] font-semibold text-ink-subtle">
            Archived {new Date(detail.archivedAt).toLocaleDateString()}
          </span>
        )}
        </div>

      <div className="class-detail-actions">
      {!detail.archivedAt && <EnrollStudentButton key={`enroll:${crypto.randomUUID()}`} formId={enrollmentFormId} initialOpen={enroll==="1"} closeHref={enroll==="1"?`/classes/${encodeURIComponent(classId)}`:undefined}>
        {error&&enroll==="1"&&<p className="notice" role="alert">{error}</p>}
        {rest.inviteChanged==="1"&&<p className="notice" role="status">Class invitation updated.</p>}
        <h3 className="enrollment-section-title">Add by student number</h3>
        <PendingForm id={enrollmentFormId} action={enrollStudentAction} className="class-details-fields">
          <input type="hidden" name="classId" value={classId}/>
          <input type="hidden" name="returnTo" value="enroll-student"/>
          <div>
            <label htmlFor="studentNumber">Student number</label>
            <input id="studentNumber" name="studentNumber" type="text" required maxLength={100} placeholder="e.g. 2099-00001" defaultValue={enroll==="1"?rest.studentNumber??"":""} autoComplete="off"/>
          </div>
        </PendingForm>
        <section className="enrollment-share-section" aria-label="Share class invite">
          <h3 className="enrollment-section-title">Share class invite</h3>
          {inviteUnavailable?<p>Class invites are temporarily unavailable. You can still enroll students by student number.</p>:invite?<>
            <ClassInviteShare code={invite.join_code} token={invite.invite_token} enabled={invite.enabled}/>
            <div className="invite-management-actions">
              <form action={manageClassInviteAction}><input type="hidden" name="classId" value={classId}/><input type="hidden" name="inviteAction" value={invite.enabled?"disable":"enable"}/><SubmitButton className="button" pendingLabel="Updating invitation…">{invite.enabled?"Turn invites off":"Turn invites on"}</SubmitButton></form>
              <form action={manageClassInviteAction}><input type="hidden" name="classId" value={classId}/><input type="hidden" name="inviteAction" value="reset"/><ConfirmSubmitButton className="button" title="Replace class invitation?" confirmLabel="Replace invitation" confirmMessage="The old code, link and QR code will stop working. Enrolled students will stay in the class.">Replace code &amp; link</ConfirmSubmitButton></form>
            </div>
          </>:<><p>Let students enroll themselves with a class code, invite link, or QR code.</p><form action={manageClassInviteAction}><input type="hidden" name="classId" value={classId}/><input type="hidden" name="inviteAction" value="create"/><SubmitButton className="button" pendingLabel="Creating invitation…">Create class invite</SubmitButton></form></>}
        </section>
      </EnrollStudentButton>}
      {/* Reset dialog state on every server response, including repeated saves. */}
      <ManageClassButton key={crypto.randomUUID()} formId={editFormId} initialOpen={manage==="1"} closeHref={manage==="1"?`/classes/${encodeURIComponent(classId)}`:undefined}>
        {error&&manage==="1"&&<p className="notice" role="alert">{error}</p>}
        <PendingForm id={editFormId} action={updateClassAction} className="class-settings-form">
          <input type="hidden" name="classId" value={classId}/>
          <input type="hidden" name="returnTo" value="manage-class"/>
          <ClassDetailsFields {...editingValues}/>
        </PendingForm>
        <details className="class-management-more">
          <summary>Enrollment and class status</summary>
        <div className="flex items-center gap-2">
          <form action={archiveClassAction}>
            <input type="hidden" name="classId" value={classId} />
            <input type="hidden" name="returnTo" value="manage-class"/>
            <input type="hidden" name="archive" value={detail.archivedAt ? "false" : "true"} />
            <ConfirmSubmitButton
              title={detail.archivedAt ? "Restore class?" : "Archive class?"}
              confirmLabel={detail.archivedAt ? "Restore class" : "Archive class"}
              confirmMessage={
                detail.archivedAt
                  ? "Restore this class? It will be able to receive new enrollments again."
                  : "Archive this class? It stays visible and its history is kept, but it can't receive new enrollments until restored."
              }
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-[12.5px] font-semibold text-ink-muted transition-colors hover:border-critical/40 hover:text-critical"
            >
              {detail.archivedAt ? (
                <>
                  <ArchiveRestore size={14} /> Restore
                </>
              ) : (
                <>
                  <Archive size={14} /> Archive
                </>
              )}
            </ConfirmSubmitButton>
          </form>
        </div>
        {detail.students.length > 0 && <div className="class-enrollment-management">
          <h2>Manage enrollment</h2>
          <ul>{detail.students.map(student=><li key={student.studentId}>
            <span>{student.fullName}</span>
            <form action={removeStudentAction}>
              <input type="hidden" name="classId" value={classId}/>
              <input type="hidden" name="studentId" value={student.studentId}/>
              <input type="hidden" name="returnTo" value="manage-class"/>
              <ConfirmSubmitButton title="Remove student?" confirmLabel="Remove student" confirmMessage={`Remove ${student.fullName} from this class? Their past session results and scores are kept and remain visible to you - only the enrollment itself is removed.`} className="roster-remove">Remove</ConfirmSubmitButton>
            </form>
          </li>)}</ul>
        </div>}
        </details>
      </ManageClassButton>
      </div>
      </div>
      {error && manage!=="1" && (enroll!=="1"||detail.archivedAt) && <NotificationModal key={error} title="Action could not be completed" message={error} queryKeys={["error","enroll","studentNumber"]}/>}
      {!error && successKey && <NotificationModal key={successKey} title="Class updated" message={SUCCESS_MESSAGES[successKey]} queryKeys={Object.keys(SUCCESS_MESSAGES)}/>}
      <Section title="Students">
        <ClassRoster classId={classId} students={detail.students}/>
      </Section>
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/classes" className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-muted hover:text-ink">
      <ArrowLeft size={14} /> Back to classes
    </Link>
  );
}
