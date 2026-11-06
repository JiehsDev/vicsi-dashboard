'use client';
import {Spinner} from './LoadingFeedback';
import {useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {Modal} from './Modal';
import {manageSetupLink,updateManagedUser} from '@/app/admin/users/actions';
import type {ManagedUser,SetupLink} from '@/lib/adminUsers';
type Mode='edit'|'suspend'|'restore'|'recover'|'invite'|'replace'|'revoke';
const titles:Record<Mode,string>={edit:'Edit account details',suspend:'Suspend account',restore:'Restore account access',recover:'Create password recovery link',invite:'Invite an instructor',replace:'Replace setup link',revoke:'Revoke setup link'};
export function AdminUserAction({mode,user,link}:{mode:Mode;user?:ManagedUser;link?:SetupLink}){
 const [open,setOpen]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[pending,start]=useTransition();const router=useRouter();
 const needsReason=['edit','suspend','restore','recover'].includes(mode);
 const description=mode==='invite'?'Create a link for the instructor to choose their own password. The link expires after 48 hours.':mode==='recover'?`Verify ${user?.full_name}’s identity before sharing the link. It expires after one hour. A suspended account stays suspended.`:mode==='replace'?'The previous link will stop working. Share the replacement with the intended recipient.':mode==='revoke'?'The shared link will stop working immediately. No account or session history will be removed.':mode==='suspend'?'Web access will stop on the next request. Headset access updates at the next directory sync. Existing sessions and enrollments are kept.':mode==='restore'?'Restore web access and the account’s previous headset access state. Existing class memberships stay the same.':'Update the display name and student section. Sign-in identifiers and session ownership stay the same.';
 async function submit(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();const form=new FormData(event.currentTarget);form.set('operation',mode);if(user)form.set('userId',user.user_id);if(link)form.set('id',link.id);
  setError('');start(async()=>{try{const result=await (['edit','suspend','restore'].includes(mode)?updateManagedUser(form):manageSetupLink(form));if(result.error)setError(result.error);else{if(result.notice)setNotice(result.notice);setOpen(false);router.refresh();}}catch{setError('The change could not be confirmed. Refresh before trying again.');}});
 }
 return <><button type="button" className={`button${mode==='suspend'||mode==='revoke'?' admin-danger-button':mode==='invite'?' button-primary':''}`} onClick={()=>{setError('');setOpen(true);}}>{mode==='edit'?'Edit details':mode==='recover'?'Password recovery':mode==='replace'?'Replace link':mode==='revoke'?'Revoke':titles[mode]}</button><Modal open={open} title={titles[mode]} message={description} onDismiss={()=>{if(!pending)setOpen(false);}} className="admin-access-dialog" body={<form className="admin-user-form" onSubmit={submit}>
  {mode==='invite'&&<><label>Full name<input name="fullName" required maxLength={200} autoComplete="name"/></label><label>Email<input name="email" type="email" required maxLength={254} autoComplete="email"/></label></>}
  {mode==='edit'&&<><label>Full name<input name="fullName" required maxLength={200} defaultValue={user?.full_name}/></label>{user?.role==='student'&&<label>Section<input name="section" required maxLength={1} pattern="[A-Za-z]" defaultValue={user.section??''}/></label>}</>}
  {needsReason&&<label>Reason for this change<textarea name="reason" required minLength={10} maxLength={500} rows={3}/><span>10–500 characters. Recorded in the activity log.</span></label>}
  {(mode==='invite'||(mode==='replace'&&link?.purpose==='instructor_invitation'))&&<label className="admin-email-choice"><input type="checkbox" name="sendEmail" value="true" defaultChecked/><span>Send invitation email<small>You can also copy the setup link after saving.</small></span></label>}
  {error&&<p role="alert" className="admin-data-notice">{error}</p>}
  <div className="admin-dialog-actions"><button type="button" className="button" disabled={pending} aria-busy={pending} onClick={()=>setOpen(false)}>Cancel</button><button type="submit" className={`button ${mode==='suspend'||mode==='revoke'?'admin-danger-button':'button-primary'}`} disabled={pending} aria-busy={pending}>{pending&&<Spinner/>}{pending?'Saving…':mode==='edit'?'Save details':titles[mode]}</button></div>
 </form>}>{null}</Modal>{notice&&<p className="admin-email-notice" role="status">{notice}</p>}</>;
}
export function CopySetupLink({id}:{id:string}){
 const [pending,start]=useTransition(),[message,setMessage]=useState(''),[fallback,setFallback]=useState('');
 function copy(){setMessage('');setFallback('');start(async()=>{try{
  const form=new FormData();form.set('operation','copy');form.set('id',id);const result=await manageSetupLink(form);
  if(result.error||!result.token){setMessage(result.error??'The link could not be opened.');return;}
  const url=`${result.origin||window.location.origin}/account/setup#invite=${result.token}`;
  try{await navigator.clipboard.writeText(url);setMessage('Link copied. Share it privately with the recipient.');}catch{setFallback(url);}
 }catch{setMessage('The link could not be opened. Try again.');}});}
 return <><button type="button" className="button" disabled={pending} aria-busy={pending} onClick={copy}>{pending&&<Spinner/>}{pending?'Opening…':'Copy link'}</button>{message&&<p role="status" className="admin-copy-status">{message}</p>}<Modal open={!!fallback} title="Copy setup link" message="Your browser could not copy automatically. Select the link and copy it. Share it only with the intended recipient." onDismiss={()=>setFallback('')} body={<input className="admin-copy-field" aria-label="Setup link" value={fallback} readOnly onFocus={event=>event.target.select()}/>}><button className="button" onClick={()=>setFallback('')}>Done</button></Modal></>;
}
