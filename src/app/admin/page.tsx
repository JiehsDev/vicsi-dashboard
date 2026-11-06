import Link from 'next/link';
import {getAdministratorList,getAuditEvents} from '@/lib/admin';
import {AdminActivity,AdminDataNotice} from '@/components/AdminActivity';
export default async function AdminOverviewPage(){
 const [access,audit]=await Promise.all([getAdministratorList(),getAuditEvents({},8)]);
 const active=access.rows.filter(row=>row.active).length;
 return <div className="admin-workspace"><header className="page-heading"><div><p className="eyebrow">Administration</p><h1>System overview</h1><p className="admin-intro">Review recorded changes and manage who can administer ViCSI.</p></div><Link href="/admin/activity" className="button">Open activity log</Link></header>
   <div className="admin-context-strip"><p>Active administrators <strong>{access.unavailable?'Unavailable':active}</strong></p><p>Recorded changes <strong>{audit.unavailable?'Unavailable':audit.total}</strong></p></div>
   <div className="admin-overview-layout"><section aria-labelledby="recent-admin-activity"><div className="admin-section-heading"><h2 id="recent-admin-activity">Recent activity</h2><span>Philippine time · Latest first</span></div>
    {audit.unavailable?<AdminDataNotice>Activity could not be loaded. Refresh the page to try again.</AdminDataNotice>:audit.rows.length?<AdminActivity events={audit.rows} compact/>:<div className="admin-plain-empty"><h3>No recorded changes yet</h3><p>New changes to administrator access, classes, enrollments and class invitations will appear here.</p></div>}
    {audit.total>8&&<Link className="admin-text-link" href="/admin/activity">View all {audit.total} changes</Link>}
   </section><aside className="admin-control-column" aria-label="Administrative controls"><h2>Access &amp; accountability</h2>
     <Link className="admin-control-link" href="/admin/users"><strong>Manage users <span aria-hidden="true">→</span></strong><span>Find accounts, update details, manage access and create recovery links.</span></Link>
     <Link className="admin-control-link" href="/admin/invitations"><strong>Invite instructors <span aria-hidden="true">→</span></strong><span>Create a setup link to share with a new instructor.</span></Link>
     <Link className="admin-control-link" href="/admin/access"><strong>Administrator access <span aria-hidden="true">→</span></strong><span>Review active administrators and suspend or restore existing access.</span></Link>
     <Link className="admin-control-link" href="/admin/activity"><strong>Trace a change <span aria-hidden="true">→</span></strong><span>Filter the activity log by record type and date. Open a change to see its details.</span></Link>
     <p className="admin-scope-note">This log covers saved administrative changes. Authentication events and headset upload monitoring are separate.</p>
   </aside></div>
 </div>;
}
