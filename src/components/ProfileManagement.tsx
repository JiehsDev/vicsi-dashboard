'use client';
import {Spinner} from './LoadingFeedback';
import Link from 'next/link';
import {useActionState,useEffect,useRef,useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {manageProfile} from '@/app/profile/actions';
import type {AccountProfile,ProfileOperation,ProfileResult} from '@/lib/profileManagement';
import {Modal} from './Modal';

const initial:ProfileResult={ok:false,message:''};
function Feedback({state}:{state:ProfileResult}){
  return state.message?<p className={`profile-feedback ${state.ok?'is-success':''}`} role={state.ok?'status':'alert'}>{state.message}</p>:null;
}
function PasswordField({name,label,autoComplete='new-password',minLength}:{name:string;label:string;autoComplete?:string;minLength?:number}){
  const [visible,setVisible]=useState(false);
  return <div className="profile-field"><label htmlFor={`profile-${name}`}>{label}</label><div className="profile-secret"><input id={`profile-${name}`} name={name} type={visible?'text':'password'} autoComplete={autoComplete} required minLength={minLength} maxLength={autoComplete==='current-password'?1024:128}/><button type="button" onClick={()=>setVisible(!visible)} aria-label={`${visible?'Hide':'Show'} ${label.toLowerCase()}`} aria-pressed={visible}>{visible?'Hide':'Show'}</button></div></div>;
}
const descriptions={
  password:{title:'Change password',description:'Use 12–128 characters. After saving, you will sign in again with your new password.',button:'Change password'},
  pin:{title:'Change legacy PIN',description:'This changes your stored four-digit PIN. Current headset builds use a separate VR access code, which will stay the same.',button:'Change PIN'},
  sessions:{title:'Sign out other sessions',description:'Your current session stays open. Existing access tokens on other devices may work until they expire. This may also sign out other Supabase-authenticated clients.',button:'Sign out other sessions'},
};
function SecurityDialog({operation,onDismiss}:{operation:Exclude<ProfileOperation,'name'>;onDismiss:()=>void}){
  const [state,action,pending]=useActionState(manageProfile,initial);
  const ref=useRef<HTMLFormElement>(null);
  const info=descriptions[operation];
  useEffect(()=>{if(state.ok)ref.current?.reset();},[state]);
  return <Modal open title={info.title} message={info.description} onDismiss={()=>{if(!pending)onDismiss();}} className="profile-dialog" body={
    <form ref={ref} id="profile-security-form" action={action}>
      <input type="hidden" name="operation" value={operation}/>
      {!state.ok && <fieldset disabled={pending} aria-busy={pending}>
        <PasswordField name="currentPassword" label="Current web password" autoComplete="current-password"/>
        {operation==='password'&&<><PasswordField name="newPassword" label="New password" minLength={12}/><PasswordField name="confirmPassword" label="Confirm new password" minLength={12}/></>}
        {operation==='pin'&&<><div className="profile-field"><label htmlFor="profile-newPin">New four-digit PIN</label><input id="profile-newPin" name="newPin" type="password" inputMode="numeric" pattern="[0-9]{4}" minLength={4} maxLength={4} autoComplete="off" required/></div><div className="profile-field"><label htmlFor="profile-confirmPin">Confirm PIN</label><input id="profile-confirmPin" name="confirmPin" type="password" inputMode="numeric" pattern="[0-9]{4}" minLength={4} maxLength={4} autoComplete="off" required/></div><p className="profile-help">Avoid repeated digits and simple sequences.</p></>}
      </fieldset>}
      <Feedback state={state}/>
    </form>
  }>
    {state.signedOut?<Link href="/login" className="button button-primary">Sign in</Link>:<button type="button" className="button" autoFocus disabled={pending} aria-busy={pending} onClick={onDismiss}>{state.ok?'Close':'Cancel'}</button>}
    {!state.ok&&<button type="submit" form="profile-security-form" className="button button-primary" disabled={pending} aria-busy={pending}>{pending&&<Spinner/>}{pending?'Saving…':info.button}</button>}
  </Modal>;
}
export function ProfileManagement({profile}:{profile:AccountProfile}){
  const tab=useSearchParams().get('tab')==='security'?'security':'profile';
  const [dialog,setDialog]=useState<Exclude<ProfileOperation,'name'>|null>(null);
  const [state,action,pending]=useActionState(manageProfile,initial);
  const role=profile.role==='admin'?'Administrator':profile.role==='student'?'Student':'Instructor';
  return <div className="profile-page">
    <header className="profile-heading"><p className="eyebrow">YOUR ACCOUNT</p><h1>My Profile</h1><p>Manage your details and keep your account secure.</p></header>
    <div className="profile-workspace"><nav className="profile-nav" aria-label="Profile settings">
      <Link href="/profile" scroll={false} aria-current={tab==='profile'?'page':undefined}>Profile</Link>
      <Link href="/profile?tab=security" scroll={false} aria-current={tab==='security'?'page':undefined}>Security</Link>
    </nav><div className="profile-content">
      {tab==='profile'?<><section className="profile-section"><h2>Personal details</h2><p className="profile-help">Your name appears alongside your account and investigation records.</p>
        <form action={action} className="profile-name-form"><input type="hidden" name="operation" value="name"/><div className="profile-field"><label htmlFor="profile-name">Full name</label><input id="profile-name" name="fullName" defaultValue={profile.fullName} autoComplete="name" required maxLength={200} disabled={pending} aria-busy={pending}/></div><Feedback state={state}/><button type="submit" className="button button-primary" disabled={pending} aria-busy={pending}>{pending&&<Spinner/>}{pending?'Saving…':'Save name'}</button></form>
      </section><section className="profile-section"><h2>Institution details</h2><p className="profile-help">Contact your administrator if these details need correcting.</p><dl className="profile-details"><div><dt>Account type</dt><dd>{role}</dd></div>{profile.role==='student'?<><div><dt>Student ID</dt><dd>{profile.studentId??'Not assigned'}</dd></div><div><dt>Section</dt><dd>{profile.section??'Not assigned'}</dd></div></>:<div><dt>Sign-in email</dt><dd>{profile.email??'Not available'}</dd></div>}</dl></section></>
      :<><section className="profile-section"><h2>Sign-in & security</h2><p className="profile-help">Changes require your current web password.</p><div className="profile-security-row"><div><h3>Password</h3><p>Use a unique password for the dashboard.</p></div><button className="button" onClick={()=>setDialog('password')} aria-haspopup="dialog">Change password</button></div>
        {profile.role==='student'&&<div className="profile-security-row"><div><h3>Legacy four-digit PIN</h3><p>Stored for older builds. Current headset access codes are managed separately.</p></div><button className="button" onClick={()=>setDialog('pin')} aria-haspopup="dialog">Change PIN</button></div>}
        <div className="profile-security-row"><div><h3>Other signed-in sessions</h3><p>Sign out sessions on other browsers or devices.</p></div><button className="button" onClick={()=>setDialog('sessions')} aria-haspopup="dialog">Sign out other sessions</button></div>
      </section><section className="profile-section"><h2>Need help accessing your account?</h2><p className="profile-recovery">{profile.role==='student'?'Your Student ID is your sign-in name; it is not an email inbox. Ask your administrator to verify your identity and provide a private password-recovery link.':'Ask an authorized administrator to verify your identity and provide a private password-recovery link. Administrator accounts require the separate administrator recovery process.'} Recovery links expire and can only be used once. Never share your password, PIN or recovery link.</p><p className="profile-help">Dashboard sessions expire after 30 minutes of inactivity, with an eight-hour maximum.</p></section></>}
    </div></div>
    {dialog&&<SecurityDialog key={dialog} operation={dialog} onDismiss={()=>setDialog(null)}/>}
  </div>;
}
