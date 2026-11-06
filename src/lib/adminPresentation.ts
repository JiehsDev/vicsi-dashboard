export const AUDIT_TYPES=['administrator','class','enrollment','invitation','user','staff_invitation','account_recovery'] as const;
export type AuditType=typeof AUDIT_TYPES[number];
export type AuditEvent={id:string;occurred_at:string;actor_name:string;action:string;resource_type:AuditType;resource_name:string;reason:string|null;changes:Record<string,unknown>};
export type Administrator={user_id:string;full_name:string;active:boolean;created_at:string;updated_at:string};
const labels:Record<string,string>={
 'account.name.updated':'Account name updated','account.password.changed':'Account password changed','account.pin.changed':'Legacy PIN changed','account.sessions.revoked':'Other account sessions signed out',
 'staff.email.requested':'Invitation email requested','staff.email.sent':'Invitation email sent','staff.email.failed':'Invitation email failed','staff.email.unconfirmed':'Invitation email result unconfirmed','staff.email.delivered':'Invitation email delivered','staff.email.delayed':'Invitation email delivery delayed','staff.email.bounced':'Invitation email bounced','staff.email.complained':'Invitation email marked as spam','staff.email.suppressed':'Invitation email suppressed',
 'user.details.updated':'User details updated','user.suspended':'User access suspended','user.restored':'User access restored',
 'staff.invitation.created':'Instructor invitation created','staff.invitation.replaced':'Instructor invitation replaced','staff.invitation.revoked':'Instructor invitation revoked','staff.invitation.accepted':'Instructor invitation accepted',
 'account.recovery.created':'Password recovery link created','account.recovery.replaced':'Password recovery link replaced','account.recovery.revoked':'Password recovery link revoked','account.recovery.completed':'Password recovered',
 'admin.access.granted':'Administrator access granted','admin.access.enabled':'Administrator access restored','admin.access.disabled':'Administrator access suspended','admin.access.removed':'Administrator access removed','admin.details.updated':'Administrator details updated',
 'class.created':'Class created','class.updated':'Class details updated','class.archived':'Class archived','class.restored':'Class restored','class.removed':'Class removed','class.enrolled':'Student enrolled','class.unenrolled':'Student removed from class',
 'class.invitation.created':'Class invitation created','class.invitation.replaced':'Class invitation replaced','class.invitation.enabled':'Class invites enabled','class.invitation.disabled':'Class invites disabled','class.invitation.removed':'Class invitation removed',
};
export function auditActionLabel(action:string){return labels[action]??'System record updated';}
export function adminDate(value:string){const date=new Date(value);return Number.isNaN(date.getTime())?'Date unavailable':new Intl.DateTimeFormat('en-PH',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Manila'}).format(date);}
export function auditFilters(query:Record<string,string|undefined>){
 const type=AUDIT_TYPES.includes(query.type as AuditType)?query.type as AuditType:undefined;
 const valid=(value:string|undefined)=>!!value&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
 const error=(query.from&&!valid(query.from))||(query.to&&!valid(query.to))?'Enter valid dates.':query.from&&query.to&&query.from>query.to?'The end date must be on or after the start date.':undefined;
 const page=Number(query.page);return {type,from:valid(query.from)?query.from:undefined,to:valid(query.to)?query.to:undefined,page:Number.isSafeInteger(page)&&page>0?Math.min(page,100000):1,error};
}
