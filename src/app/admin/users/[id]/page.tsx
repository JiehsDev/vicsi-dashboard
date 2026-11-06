import Link from 'next/link';
import {notFound} from 'next/navigation';
import {getManagedUser,getSetupLinks} from '@/lib/adminUsers';
import {adminDate} from '@/lib/adminPresentation';
import {AdminUserAction} from '@/components/AdminUserControls';
import {AdminSetupLinks,SetupLinkPages} from '@/components/AdminSetupLinks';
export default async function AdminUserPage({params,searchParams=Promise.resolve({})}:{params:Promise<{id:string}>;searchParams?:Promise<{page?:string}>}){
 const {id}=await params;const {user,unavailable}=await getManagedUser(id);
 if(unavailable)return <p className="admin-data-notice">Account details could not be loaded. Refresh to try again.</p>;if(!user)notFound();
 const query=await searchParams;
 const recovery=user.role==='administrator'?null:await getSetupLinks('password_recovery',id,Number(query.page??1));
 return <div className="admin-workspace"><Link className="admin-text-link" href="/admin/users">← Users</Link><header className="page-heading"><div><p className="eyebrow">Account details</p><h1>{user.full_name}</h1><p className="admin-intro admin-role-label">{user.role}{user.role!=='administrator'&&` · ${user.suspended_at?'Suspended':'Active'}`}</p></div><div className="admin-user-actions">{user.role==='administrator'?<Link href="/admin/access" className="button">Manage administrator access</Link>:<><AdminUserAction mode="edit" user={user}/><AdminUserAction mode={user.suspended_at?'restore':'suspend'} user={user}/></>}</div></header>
 <div className="admin-user-detail-layout"><section><h2>Account record</h2><dl className="admin-user-record"><div><dt>{user.role==='student'?'Student ID':'Email'}</dt><dd>{user.student_id||user.email||'Unavailable'}</dd></div>{user.role==='student'&&<div><dt>Section</dt><dd>{user.section??'Not set'}</dd></div>}<div><dt>Created</dt><dd>{adminDate(user.created_at)}</dd></div><div><dt>Last sign-in</dt><dd>{user.last_sign_in_at?adminDate(user.last_sign_in_at):'Not signed in yet'}</dd></div></dl></section><section><h2>{user.role==='instructor'?'Teaching classes':'Enrolled classes'}</h2>{user.classes?.length?<ul className="admin-membership-list">{user.classes.map(item=><li key={item.id}><strong>{item.name}</strong>{item.section&&<span>Section {item.section}</span>}</li>)}</ul>:<p className="admin-intro">No classes linked to this account.</p>}</section></div>
 {recovery&&<section className="analysis-section"><div className="admin-section-heading"><div><h2>Password recovery</h2><p className="admin-intro">Verify the account holder’s identity, then share a one-use link privately. Creating a link does not change the password.</p></div><AdminUserAction mode="recover" user={user}/></div>{recovery.unavailable?<p className="admin-data-notice">Recovery links could not be loaded.</p>:recovery.links.length?<><AdminSetupLinks links={recovery.links}/><SetupLinkPages page={recovery.page} total={recovery.total} href={`/admin/users/${id}`}/></>:<p className="admin-plain-empty">No recovery links created.</p>}</section>}
 </div>;
}
