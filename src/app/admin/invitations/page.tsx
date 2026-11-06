import {getSetupLinks} from '@/lib/adminUsers';
import {AdminUserAction} from '@/components/AdminUserControls';
import {AdminSetupLinks,SetupLinkPages} from '@/components/AdminSetupLinks';
import {invitationEmailConfig} from '@/lib/invitationEmail';
import {RefreshEmailStatus} from '@/components/SendInvitationEmailButton';
export default async function InstructorInvitationsPage({searchParams}:{searchParams:Promise<{page?:string}>}){
 const query=await searchParams;
 const {links,unavailable,total,page,emails,emailUnavailable}=await getSetupLinks('instructor_invitation',undefined,Number(query.page??1));
 const config=invitationEmailConfig();
 return <div className="admin-workspace"><header className="page-heading"><div><p className="eyebrow">Staff access</p><h1>Instructor invitations</h1><p className="admin-intro">Invite an instructor to set up their account. Send a setup email or copy the link to share through your preferred messaging app.</p></div><div className="admin-invite-actions"><AdminUserAction mode="invite"/></div></header><div className="admin-access-guidance"><strong>One link per recipient</strong><p>Links expire after 48 hours. Copy remains available while a link is active. Replacing a link invalidates the previous one. Email delivery and link activation are tracked separately.</p></div><div className="admin-email-configuration"><p>{config.ready?`Email sender: ${config.sender}. ${config.webhooks?"Webhook signing is configured.":"Delivery confirmations need a webhook connection."}`:"Email sending needs configuration. You can create invitations and copy their links now."}</p><RefreshEmailStatus/></div>{unavailable?<p className="admin-data-notice" role="status">Invitations are unavailable. Check that migration 023 has been applied, then refresh.</p>:links.length?<><AdminSetupLinks links={links} emails={emails} emailUnavailable={emailUnavailable}/><SetupLinkPages page={page} total={total} href="/admin/invitations"/></>:<div className="admin-plain-empty"><h2>No instructor invitations yet</h2><p>Create an invitation to give a new instructor access to teaching and assessment.</p></div>}</div>;
}
