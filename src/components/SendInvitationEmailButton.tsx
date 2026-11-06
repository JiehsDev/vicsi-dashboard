'use client';
import {Spinner} from './LoadingFeedback';
import {useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {sendInstructorInvitation} from '@/app/admin/invitations/actions';
import {Modal} from './Modal';
export function RefreshEmailStatus(){const router=useRouter();const [pending,start]=useTransition();return <button className="button" type="button" disabled={pending} aria-busy={pending} onClick={()=>start(()=>router.refresh())}>{pending&&<Spinner/>}{pending?'Refreshing…':'Refresh status'}</button>;}
export function SendInvitationEmailButton({id,email,retry=false,sent=false}:{id:string;email:string;retry?:boolean;sent?:boolean}){
 const [open,setOpen]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[pending,start]=useTransition();const router=useRouter();
 const label=retry?'Retry email request':sent?'Send again':'Send email';
 function send(){setError('');start(async()=>{try{const result=await sendInstructorInvitation(id);if(result.error)setError(result.error);else{setOpen(false);setNotice(result.state==='sent'?'Email sent through Resend.':result.state==='failed'?'Email failed. Check its status or use Copy link.':'The email result is unconfirmed. Refresh before trying again.');router.refresh();}}catch{setError('The result could not be confirmed. Refresh before trying again.');}});}
 return <><button className="button" type="button" onClick={()=>{setError('');setOpen(true);}}>{label}</button><Modal open={open} title={label} message={`Send the current instructor setup link to ${email}? Copy link remains available after sending.`} onDismiss={()=>{if(!pending)setOpen(false);}} body={error?<p role="alert" className="admin-data-notice">{error}</p>:undefined}><button className="button" disabled={pending} aria-busy={pending} onClick={()=>setOpen(false)}>Cancel</button><button className="button button-primary" disabled={pending} aria-busy={pending} onClick={send}>{pending&&<Spinner/>}{pending?'Sending…':label}</button></Modal>{notice&&<p className="admin-copy-status" role="status">{notice}</p>}</>;
}
