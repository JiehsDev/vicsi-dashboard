import Form from 'next/form';
import {SubmitButton} from '@/components/SubmitButton';
import Link from '@/components/LoadingLink';
import {getAuditEvents} from '@/lib/admin';
import {AdminActivity,AdminDataNotice} from '@/components/AdminActivity';
export default async function AdminActivityPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 const query=await searchParams;const {rows,total,unavailable,filters}=await getAuditEvents(query);
 function href(page:number){const p=new URLSearchParams();if(filters.type)p.set('type',filters.type);if(filters.from)p.set('from',filters.from);if(filters.to)p.set('to',filters.to);p.set('page',String(page));return `/admin/activity?${p}`;}
 const pages=Math.max(1,Math.ceil(total/20));
 return <div className="admin-workspace"><header className="page-heading"><div><p className="eyebrow">Administration</p><h1>Activity log</h1><p className="admin-intro">Saved changes to system access, classes and enrollment. Times are Philippine time.</p></div></header>
  <Form className="admin-filter-bar" action="/admin/activity"><label>Record type<select name="type" defaultValue={filters.type??''}><option value="">All records</option><option value="administrator">Administrator access</option><option value="class">Classes</option><option value="enrollment">Enrollment</option><option value="invitation">Class invitations</option><option value="user">Users</option><option value="staff_invitation">Instructor invitations</option><option value="account_recovery">Password recovery</option></select></label><label>From<input name="from" type="date" defaultValue={filters.from}/></label><label>To<input name="to" type="date" defaultValue={filters.to}/></label><SubmitButton className="button button-primary" pendingLabel="Applying filters…">Apply filters</SubmitButton><Link className="button" href="/admin/activity">Clear</Link></Form>
  {filters.error?<p className="admin-data-notice" role="alert">{filters.error}</p>:unavailable?<AdminDataNotice>The activity log could not be loaded. Refresh the page to try again.</AdminDataNotice>:<>
   <div className="admin-section-heading"><h2>{total} recorded {total===1?'change':'changes'}</h2><span>Latest first</span></div>
   {rows.length?<AdminActivity events={rows}/>:<div className="admin-plain-empty"><h2>{total?'This page has no records':'No matching changes'}</h2><p>Try another date range or clear the filters.</p>{total>0&&<Link href={href(1)} className="button">Go to first page</Link>}</div>}
   {pages>1&&<nav className="admin-pagination" aria-label="Activity log pages"><span>Page {filters.page} of {pages}</span><div>{filters.page>1?<Link className="button" scroll={false} href={href(filters.page-1)}>Previous</Link>:<span className="button" aria-disabled="true">Previous</span>}{filters.page<pages?<Link className="button" scroll={false} href={href(filters.page+1)}>Next</Link>:<span className="button" aria-disabled="true">Next</span>}</div></nav>}
  </>}
 </div>;
}
