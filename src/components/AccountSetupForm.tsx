'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
type Preview={name:string;purpose:string;expiresAt:string;suspended:boolean};
export function AccountSetupForm(){
 const token=useRef('');const [preview,setPreview]=useState<Preview|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[done,setDone]=useState(false),[loaded,setLoaded]=useState(false);
 useEffect(()=>{
  const value=new URLSearchParams(window.location.hash.slice(1)).get('invite')??'';token.current=value;
  let active=true;
  Promise.resolve().then(async()=>{if(!value)throw new Error('MISSING_LINK');return fetch('/api/account/setup/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:value})});}).then(async response=>{const data=await response.json();if(active){if(!response.ok)setError(data.error??'The link could not be checked.');else setPreview(data);}}).catch(cause=>{if(active)setError(cause.message==='MISSING_LINK'?'Open the full setup link shared by your administrator.':'The link could not be checked. Refresh to try again.');}).finally(()=>{if(active)setLoaded(true);});return ()=>{active=false;};
 },[]);
 async function submit(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();const form=new FormData(event.currentTarget);if(form.get('password')!==form.get('confirm')){setError('The passwords do not match.');return;}
  setError('');setBusy(true);
  try{const response=await fetch('/api/account/setup/complete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:token.current,password:form.get('password')})});const result=await response.json();if(!response.ok)setError(result.error??'Setup could not be completed.');else{window.history.replaceState(null,'',window.location.pathname);token.current='';setDone(true);}}catch{setError('The connection was interrupted. Try signing in first; your password may have been saved.');}finally{setBusy(false);}
 }
 return <section className="account-setup-content"><p className="eyebrow">Account access</p><h1>{done?'Your password is ready':preview?.purpose==='password_recovery'?'Reset your password':'Set up your instructor account'}</h1>{!loaded&&<p role="status">Checking your link…</p>}{error&&<p role="alert" className="admin-data-notice">{error}</p>}{done?<><p>Sign in with your email or Student ID and your new password.</p>{preview?.suspended&&<p>Your account remains suspended. Contact your administrator to restore access.</p>}<Link href="/login" className="button button-primary">Go to sign in</Link></>:preview&&<><p>{preview.name}, choose a password to {preview.purpose==='password_recovery'?'recover your account':'start using the instructor workspace'}. This link can be used once.</p>{preview.suspended&&<p className="admin-data-notice">Changing your password will not lift your account suspension.</p>}<form onSubmit={submit} className="admin-user-form"><label>New password<input name="password" type="password" minLength={12} maxLength={128} autoComplete="new-password" required disabled={busy}/></label><p>Use 12–128 characters. A long, unique passphrase works well.</p><label>Confirm password<input name="confirm" type="password" minLength={12} maxLength={128} autoComplete="new-password" required disabled={busy}/></label><button className="button button-primary" type="submit" disabled={busy}>{busy?'Saving password…':'Save password'}</button></form></>}</section>;
}
