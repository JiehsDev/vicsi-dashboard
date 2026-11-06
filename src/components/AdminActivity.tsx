import Link from './LoadingLink';
import {adminDate,auditActionLabel,type AuditEvent} from '@/lib/adminPresentation';
const fieldLabels:Record<string,string>={name:'Name',active:'Administrator access',suspended:'Account suspended',section:'Section',academic_year:'Academic year',semester:'Semester',archived:'Archived',enabled:'Invites enabled'};
function valueText(value:unknown){return typeof value==='boolean'?(value?'Yes':'No'):typeof value==='string'?value:'Not set';}
function ChangeDetails({event}:{event:AuditEvent}){
 const before=event.changes.before as Record<string,unknown>|undefined,after=event.changes.after as Record<string,unknown>|undefined;
 const fields=Object.keys(fieldLabels).filter(key=>before?.[key]!==after?.[key]&&(key in (before??{})||key in (after??{})));
 if(!event.reason&&!fields.length)return null;
 return <details className="admin-event-details"><summary>View change</summary>{event.reason&&<p><strong>Reason:</strong> {event.reason}</p>}{fields.length>0&&<dl>{fields.map(key=><div key={key}><dt>{fieldLabels[key]}</dt><dd><span>{valueText(before?.[key])}</span><span aria-hidden="true"> → </span><span className="sr-only"> changed to </span><strong>{valueText(after?.[key])}</strong></dd></div>)}</dl>}</details>;
}
export function AdminActivity({events,compact=false}:{events:AuditEvent[];compact?:boolean}){
 return <div className="admin-table-wrap"><table className="admin-table"><caption className="sr-only">Saved system changes. Times are Philippine time.</caption><thead><tr><th scope="col">When</th><th scope="col">Activity</th><th scope="col">Changed by</th>{!compact&&<th scope="col">Details</th>}</tr></thead><tbody>{events.map(event=><tr key={event.id}>
   <td data-label="When"><time dateTime={event.occurred_at}>{adminDate(event.occurred_at)}</time></td>
   <td data-label="Activity"><strong>{auditActionLabel(event.action)}</strong><span className="admin-cell-detail">{event.resource_name}</span></td>
   <td data-label="Changed by">{event.actor_name}</td>
   {!compact&&<td data-label="Details"><ChangeDetails event={event}/></td>}
 </tr>)}</tbody></table></div>;
}
export function AdminDataNotice({children}:{children:React.ReactNode}){return <p className="admin-data-notice" role="alert">{children} <Link href="/admin">Return to overview</Link></p>;}
