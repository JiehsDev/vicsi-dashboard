import {getAdministratorList,requireSystemAdmin} from '@/lib/admin';
import {adminDate} from '@/lib/adminPresentation';
import {AdminAccessButton} from '@/components/AdminAccessButton';
import {AdminDataNotice} from '@/components/AdminActivity';
import {NotificationModal} from '@/components/NotificationModal';
import {changeAdminAccess} from './actions';
export default async function AdministratorAccessPage({searchParams}:{searchParams:Promise<{error?:string;updated?:string}>}){
 const {identity}=await requireSystemAdmin();const {rows,unavailable}=await getAdministratorList();const params=await searchParams;
 const active=rows.filter(row=>row.active).length;
 return <div className="admin-workspace"><header className="page-heading"><div><p className="eyebrow">Administration</p><h1>Administrator access</h1><p className="admin-intro">Review who can administer ViCSI. Academic accounts and session history are kept separately.</p></div></header>
  {params.error&&<NotificationModal title="Access wasn't changed" message={params.error} queryKeys={['error']}/>}
  {params.updated&&<NotificationModal title="Access updated" message="The access change was saved and recorded in the activity log." queryKeys={['updated']}/>}
  <div className="admin-access-guidance"><strong>{unavailable?'Access records unavailable':`${active} active ${active===1?'administrator':'administrators'}`}</strong><p>The last active administrator cannot be suspended or removed. New administrators are added by the system owner.</p></div>
  {unavailable?<AdminDataNotice>Administrator records could not be loaded.</AdminDataNotice>:<div className="admin-table-wrap"><table className="admin-table admin-access-table"><caption className="sr-only">Administrator access records. Dates are Philippine time.</caption><thead><tr><th scope="col">Administrator</th><th scope="col">Access</th><th scope="col">Granted</th><th scope="col">Action</th></tr></thead><tbody>{rows.map(row=><tr key={row.user_id}><td data-label="Administrator"><strong>{row.full_name}</strong>{row.user_id===identity.user_id&&<span className="admin-cell-detail">Your account</span>}</td><td data-label="Access"><span className={`admin-access-status ${row.active?'is-active':''}`}>{row.active?'Active':'Suspended'}</span></td><td data-label="Granted"><time dateTime={row.created_at}>{adminDate(row.created_at)}</time></td><td data-label="Action">{row.user_id===identity.user_id?<span className="admin-cell-detail">Current administrator</span>:<AdminAccessButton key={crypto.randomUUID()} userId={row.user_id} name={row.full_name} active={row.active} action={changeAdminAccess}/>}</td></tr>)}</tbody></table></div>}
 </div>;
}
