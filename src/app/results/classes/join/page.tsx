import Link from "next/link";
import {redirect} from "next/navigation";
import {getMyProfile} from "@/lib/supabaseClient";
import {createSupabaseServerClient} from "@/lib/supabaseServer";
import {classJoinReturnPath,classInviteMessage} from "@/lib/classInvites";
import {joinClassAction} from "./actions";

export default async function JoinClassPage({searchParams}:{searchParams:Promise<{code?:string;invite?:string;error?:string}>}){
  const params=await searchParams;
  const destination=classJoinReturnPath(`/results/classes/join?${new URLSearchParams(params.invite?{invite:params.invite}:{code:params.code??""})}`);
  const profile=await getMyProfile();
  if(!profile)redirect(`/login${destination?`?next=${encodeURIComponent(destination)}`:""}`);
  if(profile.role!=="student")return <div className="join-class-workspace"><h1>Join a class</h1><p>Class invitations are for student accounts. Sign out and sign in with your student account to continue.</p><Link className="button" href="/class-results">Back to dashboard</Link></div>;
  const db=await createSupabaseServerClient();
  const url=destination?new URL(destination,"https://vicsi.invalid"):null;
  const response=url?await db.rpc("student_class_invitation",{p_code:url.searchParams.get("code"),p_token:url.searchParams.get("invite"),p_join:false}):null;
  const row=response?.error?null:Array.isArray(response?.data)?response.data[0]:response?.data;
  const ready=row&&["ready","already_enrolled"].includes(row.status);
  return <div className="join-class-workspace"><Link className="text-primary" href="/results/classes">Back to My Classes</Link>
    <header className="page-heading"><div><p className="eyebrow">Class enrollment</p><h1>{ready?"Check your class":"Join a class"}</h1></div></header>
    {params.error&&<p className="notice" role="alert">{params.error}</p>}
    {ready?<section className="join-class-preview"><h2>{row.class_name}</h2><dl><dt>Instructor</dt><dd>{row.instructor_name}</dd><dt>Section</dt><dd>{row.class_section??"No section set"}</dd><dt>Academic period</dt><dd>{[row.academic_year,row.semester].filter(Boolean).join(" · ")||"Not specified"}</dd></dl>
      {row.status==="already_enrolled"?<><p>You are already enrolled in this class.</p><Link className="button button-primary" href="/results/classes">Go to My Classes</Link></>:<><p>Join as <strong>{profile.fullName}</strong>. Your instructor will be able to review your investigation sessions.</p><form action={joinClassAction}><input type="hidden" name="returnTo" value={destination!}/><button className="button button-primary" type="submit">Join class</button></form></>}
    </section>:<><p className="notice" role="alert">{classInviteMessage(response?.error?"unavailable":row?.status??"invalid")}</p><form action="/results/classes/join" className="join-class-form"><label htmlFor="class-code">Class code</label><div><input id="class-code" name="code" required maxLength={20} autoComplete="off" placeholder="ABCDE-FG234"/><button type="submit" className="button button-primary">Check class</button></div></form></>}
  </div>;
}
