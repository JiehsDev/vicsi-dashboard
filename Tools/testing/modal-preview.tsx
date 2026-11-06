// Local interaction fixture. No database or production writes.
import {useEffect,useState} from "react";
import {createRoot} from "react-dom/client";
import {ConfirmSubmitButton} from "../../src/components/ConfirmSubmitButton";
import {NotificationModal} from "../../src/components/NotificationModal";
import {SessionPages} from "../../src/components/SessionPages";
import {AppShell} from "../../src/components/AppShell";
import {ManageClassButton,EnrollStudentButton} from "../../src/components/ManageClassButton";
import {ClassDetailsFields} from "../../src/components/ClassDetailsFields";
import {ClassInviteShare} from "../../src/components/ClassInviteShare";
import {AdminAccessButton} from '../../src/components/AdminAccessButton';
import {AdminUserAction,CopySetupLink} from '../../src/components/AdminUserControls';
import {SendInvitationEmailButton} from '../../src/components/SendInvitationEmailButton';
import AccountSetupPage from '../../src/app/account/setup/page';
const adminUserRoot=document.getElementById('admin-user-test-root');
if(adminUserRoot)createRoot(adminUserRoot).render(<><AdminUserAction mode="invite"/><AdminUserAction mode="edit" user={{user_id:'33333333-3333-4333-8333-333333333333',full_name:'Ana Reyes',role:'student',student_id:'2026-001',section:'A',email:null,suspended_at:null,created_at:'2026-10-01',last_sign_in_at:null}}/><CopySetupLink id="invite-1"/><div id="email-send-preview"><SendInvitationEmailButton id="11111111-1111-4111-8111-111111111111" email="teacher@example.edu"/></div></>);
const setupRoot=document.getElementById('account-setup-test-root');
if(setupRoot)createRoot(setupRoot).render(<AccountSetupPage/>);
function Preview() {
  const [count,setCount]=useState(0);
  const [notice,setNotice]=useState(false);
  const [received,setReceived]=useState("");
  return <><form action={async data=>{
    await new Promise(resolve=>setTimeout(resolve,100));
    setReceived(String(data.get("studentId")));setCount(c=>c+1);setNotice(true);
  }}>
    <label>Student <input required name="studentId" defaultValue="student-42"/></label>
    <ConfirmSubmitButton title="Remove student?" confirmLabel="Remove student" confirmMessage="Remove this student from the class? Their past session results are kept." className="button">Remove</ConfirmSubmitButton>
  </form><p id="submission-count">Submissions: {count}</p><p id="received">{received}</p>
  {notice&&<NotificationModal title="Student removed" message="The student was removed from this class. Their past results are kept." queryKeys={["removed"]}/>}
  </>;
}
const root=document.getElementById("modal-test-root");
if(root){createRoot(root).render(<Preview/>);root.dataset.ready="true";}
const pagination=document.getElementById("pagination-test-root");
if(pagination){
  const pages=Array.from({length:3},(_,page)=><table key={page} className="product-table"><tbody>{Array.from({length:page===2?2:5},(_,row)=><tr key={row}><td style={{height:100}}>Session {page*5+row+1}</td></tr>)}</tbody></table>);
  createRoot(pagination).render(<><div style={{height:800}}>Investigation history</div><SessionPages pages={pages} totalRows={12} pageSize={5} basePath="/results" query={{dateFrom:"2026-10-01",includeTests:"true"}}/></>);
}

function InstructorSidebarPreview() {
  const [signOutCount,setSignOutCount]=useState(0);
  const previewRole=new URLSearchParams(window.location.search).get('role');
  const role=previewRole==='student'||previewRole==='admin'?previewRole:'instructor';
  useEffect(()=>{const control=document.querySelector<HTMLElement>(".theme-control");if(control)control.dataset.themeReady="true";},[]);
  const classes=Array.from({length:18},(_,i)=>({id:`class-${i+1}`,name:i===3?"Crime scene documentation, investigation and evidence handling":`Class ${String(i+1).padStart(2,"0")}`,section:`Section ${i+1}`,archivedAt:i>=16?"2026-10-01":null}));
  return <AppShell role={role} name="Dev Instructor (Test)" classes={classes} onSignOut={async()=>{setSignOutCount(count=>count+1);}}><h1>Class sidebar navigation</h1><p>Local interaction fixture; no database or authentication writes.</p><p id="signout-count">{signOutCount}</p></AppShell>;
}
const sidebar=document.getElementById("instructor-shell-root");
if(sidebar)createRoot(sidebar).render(<InstructorSidebarPreview/>);

function ManageClassPreview(){
  const [saved,setSaved]=useState(0);
  const [received,setReceived]=useState("");
  const [enrolled,setEnrolled]=useState(0);
  const [studentNumber,setStudentNumber]=useState("");
  return <><p id="class-save-count">{saved}</p><p id="class-saved-name">{received}</p>
    <ManageClassButton key={saved} formId="class-preview-edit">
      <form id="class-preview-edit" action={async data=>{setReceived(String(data.get("name")));setSaved(n=>n+1);}}>
        <ClassDetailsFields name="Forensic investigation" section="A" academicYear="2026-2027" semester="1st"/>
      </form>
      <details className="class-management-more"><summary>Enrollment and class status</summary>
        <form action={async()=>setSaved(n=>n+1)}><ConfirmSubmitButton title="Archive class?" confirmLabel="Archive class" confirmMessage="Keep past sessions available." className="button">Archive</ConfirmSubmitButton></form>
      </details>
    </ManageClassButton>
    <p id="enrollment-count">{enrolled}</p><p id="enrolled-number">{studentNumber}</p>
    <EnrollStudentButton key={`enrollment:${enrolled}`} formId="class-preview-enroll">
      <form id="class-preview-enroll" className="class-details-fields" action={async data=>{setStudentNumber(String(data.get("studentNumber")));setEnrolled(n=>n+1);}}>
        <div><label htmlFor="studentNumber">Student number</label><input id="studentNumber" name="studentNumber" required maxLength={100}/></div>
      </form>
    </EnrollStudentButton></>;
}
const management=document.getElementById("manage-class-test-root");
if(management)createRoot(management).render(<ManageClassPreview/>);
const invitation=document.getElementById("class-invite-test-root");
if(invitation)createRoot(invitation).render(<EnrollStudentButton formId="invitation-manual"><h3 className="enrollment-section-title">Add by student number</h3><form id="invitation-manual" className="class-details-fields"><label htmlFor="studentNumber">Student number</label><input name="studentNumber" id="studentNumber" required/></form><section className="enrollment-share-section"><h3>Share class invite</h3><ClassInviteShare code="ABCDE23456" token={"a".repeat(64)} enabled/></section></EnrollStudentButton>);
function AdminAccessPreview(){
 const [count,setCount]=useState(0),[received,setReceived]=useState('');
 return <><h1>Administrator access</h1><p id="admin-access-count">{count}</p><p id="admin-access-reason">{received}</p><AdminAccessButton key={count} userId="22222222-2222-4222-8222-222222222222" name="Department Administrator" active action={async form=>{await new Promise(resolve=>setTimeout(resolve,100));setReceived(String(form.get('reason')));setCount(value=>value+1);}}/></>;
}
const adminAccess=document.getElementById('admin-access-test-root');
if(adminAccess)createRoot(adminAccess).render(<AdminAccessPreview/>);
