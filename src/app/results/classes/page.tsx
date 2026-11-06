import {redirect} from "next/navigation";
import {getMyProfile} from "@/lib/supabaseClient";
import {createSupabaseServerClient} from "@/lib/supabaseServer";
import {NotificationModal} from "@/components/NotificationModal";
export default async function MyClassesPage({searchParams}:{searchParams:Promise<{joined?:string;already?:string;error?:string}>}){
  const profile=await getMyProfile();if(!profile)redirect("/login");if(profile.role!=="student")redirect("/classes");
  const params=await searchParams;const db=await createSupabaseServerClient();
  const {data,error}=await db.from("classes").select("id,name,section,academic_year,semester,archived_at").order("name");
  return <div><header className="page-heading"><div><p className="eyebrow">Student workspace</p><h1>My Classes</h1><p>Join your instructor&apos;s class using their class code, invite link, or QR code.</p></div></header>
    {(params.joined||params.already)&&<NotificationModal title={params.already?"Already enrolled":"Class joined"} message={params.already?"You are already a member of this class.":"You are enrolled. Your instructor can now find you in the student list."} queryKeys={["joined","already"]}/>}
    {params.error&&<p className="notice" role="alert">{params.error}</p>}
    <form action="/results/classes/join" className="join-class-form"><label htmlFor="class-code">Class code</label><div><input id="class-code" name="code" required maxLength={20} autoComplete="off" placeholder="ABCDE-FG234"/><button className="button button-primary" type="submit">Check class</button></div></form>
    <section className="analysis-section"><div className="section-heading"><h2>Enrolled classes</h2></div>
      {error?<p role="alert">Your classes could not be loaded. Please try again.</p>:!data?.length?<p className="text-ink-muted">You haven&apos;t joined a class yet. Ask your instructor for a code or invite link.</p>:<ul className="student-class-list">{data.map(row=><li key={row.id}><h3>{row.name}</h3><p>{[row.section?`Section ${row.section}`:null,row.academic_year,row.semester,row.archived_at?"Archived":null].filter(Boolean).join(" · ")}</p></li>)}</ul>}
    </section></div>;
}
