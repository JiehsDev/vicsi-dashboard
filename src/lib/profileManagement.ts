import 'server-only';

export type AccountProfile = {
  id: string; fullName: string; role: 'student'|'instructor'|'admin';
  studentId: string|null; section: string|null; email: string|null;
};
export type ProfileResult = {ok:boolean; message:string; signedOut?:boolean};
export type ProfileOperation = 'name'|'password'|'pin'|'sessions';
export interface ProfileBackend {
  identity(): Promise<AccountProfile|null>;
  allow(id:string): Promise<boolean>;
  verifyPassword(email:string,password:string,id:string): Promise<boolean>;
  changeName(name:string): Promise<boolean>;
  changePassword(password:string,currentPassword:string): Promise<boolean>;
  changePin(id:string,pin:string): Promise<boolean>;
  revoke(scope:'global'|'others'): Promise<boolean>;
  audit(id:string,event:'password'|'pin'|'sessions'): Promise<boolean>;
  clearBrowserSession(): Promise<void>;
}
const failed = (message:string):ProfileResult => ({ok:false,message});
const field = (form:FormData,key:string) => typeof form.get(key)==='string' ? String(form.get(key)) : '';

/** This boundary accepts no target account, role, section, or identity email from the form. */
export async function performProfileAction(form:FormData,backend:ProfileBackend):Promise<ProfileResult> {
  const operation=field(form,'operation');
  if(!['name','password','pin','sessions'].includes(operation))return failed('Choose a valid account action.');
  const user=await backend.identity();
  if(!user)return failed('Your session is no longer available. Sign in again.');
  if(operation==='pin' && user.role!=='student')return failed('Only student accounts have a legacy PIN.');
  const name=field(form,'fullName').trim();
  const current=field(form,'currentPassword');
  const password=field(form,'newPassword');
  const pin=field(form,'newPin');
  if(operation==='name' && (name.length<1 || name.length>200 || /[\u0000-\u001f\u007f]/.test(name)))return failed('Enter a name of 1–200 characters.');
  if(operation!=='name' && (!current || current.length>1024))return failed('Enter your current web password.');
  if(operation==='password'){
    if(password.length<12 || password.length>128)return failed('Use a password of 12–128 characters. A unique passphrase works well.');
    if(password!==field(form,'confirmPassword'))return failed('The new passwords do not match.');
    if(password===current)return failed('Choose a password different from your current password.');
  }
  if(operation==='pin' && (!/^\d{4}$/.test(pin) || pin!==field(form,'confirmPin')))return failed('Enter and confirm the same four-digit PIN.');
  if(operation==='pin' && (/^(\d)\1{3}$/.test(pin) || ['1234','4321','0123','9876'].includes(pin)))return failed('Choose a PIN without repeated digits or a simple sequence.');
  if(!await backend.allow(user.id))return failed('Too many attempts, or account security is temporarily unavailable. Wait ten minutes before trying again.');
  if(operation==='name')return await backend.changeName(name)
    ? {ok:true,message:'Your name has been updated.'}
    : failed('Your name could not be saved. Refresh the page and try again.');
  if(!user.email || !await backend.verifyPassword(user.email,current,user.id))return failed('Your current password could not be verified. Check it and try again.');
  if(operation==='password'){
    if(!await backend.changePassword(password,current))return failed('Your password could not be changed. Check the password requirements and try again.');
    // Auth and SQL cannot share a transaction. Once changed, never report that it failed or suggest resubmitting.
    const revoked=await backend.revoke('global').catch(()=>false);
    const logged=await backend.audit(user.id,'password').catch(()=>false);
    await backend.clearBrowserSession();
    return {ok:true,signedOut:true,message:`Your password changed. Sign in with your new password.${!revoked?' Other sessions could not be confirmed as signed out; contact your administrator.':''}${!logged?' The activity record could not be confirmed; contact your administrator.':''}`};
  }
  if(operation==='pin'){
    // The database hashes and audits the change atomically; assessment identity and VR access codes stay intact.
    return await backend.changePin(user.id,pin)
      ? {ok:true,message:'Your legacy PIN changed. Your current VR access code and investigation records are unchanged.'}
      : failed('Your PIN could not be changed. Try again later.');
  }
  if(!await backend.revoke('others'))return failed('Other sessions could not be signed out. Try again later.');
  const logged=await backend.audit(user.id,'sessions').catch(()=>false);
  return {ok:true,message:`Other sessions have been signed out. Existing access tokens can remain valid until they expire.${!logged?' The activity record could not be confirmed; contact your administrator.':''}`};
}
