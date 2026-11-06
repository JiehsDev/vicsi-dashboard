export type InvitationEmailStatus={state:'sending'|'unknown'|'failed'|'sent'|'delivered'|'delayed'|'bounced'|'complained'|'suppressed';error_code:string|null;updated_at:string};
export const emailStatusLabel:Record<InvitationEmailStatus['state'],string>={sending:'Sending',unknown:'Status unconfirmed',failed:'Failed',sent:'Sent',delivered:'Delivered',delayed:'Delivery delayed',bounced:'Bounced',complained:'Marked as spam',suppressed:'Suppressed'};
export function emailStatusDetail(value?:InvitationEmailStatus){
 if(!value)return 'No email has been requested for this link.';
 if(value.state==='sent')return 'Resend accepted the email. Delivery has not been confirmed.';
 if(value.state==='delivered')return 'The recipient’s mail server accepted the email.';
 if(value.state==='sending')return 'A send request is in progress. Refresh to check its result.';
 if(value.state==='unknown')return 'The result is uncertain. Retry uses the same request to avoid duplicate emails.';
 if(value.state==='bounced')return 'The recipient’s mail server rejected the email. Check the address or share the link privately.';
 if(value.state==='complained')return 'The recipient marked this email as spam. Use another sharing method.';
 if(value.state==='suppressed')return 'Resend suppressed delivery. Check the recipient in Resend before sending again.';
 if(value.state==='delayed')return 'Resend is still attempting delivery. You can share the setup link directly.';
 return value.error_code==='restricted_sender'?'Resend rejected the sender or recipient. Check the sender domain and account permissions.':value.error_code==='rate_limit'?'Resend’s send limit was reached. Wait before trying again.':value.error_code==='stale_link'?'The invitation changed before sending. Copy or send the current link.':'The email could not be sent. Copy link remains available.';
}
