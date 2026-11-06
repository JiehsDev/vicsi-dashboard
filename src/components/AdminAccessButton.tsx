"use client";
import {useId,useRef,useState} from 'react';
import {Modal} from './Modal';
import {useFormStatus} from 'react-dom';
function Submit({active}:{active:boolean}){const {pending}=useFormStatus();return <button type="submit" className={`button ${active?'admin-danger-button':'button-primary'}`} disabled={pending}>{pending?'Saving…':active?'Suspend access':'Restore access'}</button>;}
export function AdminAccessButton({userId,name,active,action}:{userId:string;name:string;active:boolean;action:(form:FormData)=>Promise<void>}){
 const [open,setOpen]=useState(false);const id=useId();
 const formRef=useRef<HTMLFormElement>(null);
 function close(){formRef.current?.reset();setOpen(false);}
 return <><button type="button" className="button" aria-haspopup="dialog" onClick={e=>{e.currentTarget.focus();setOpen(true);}}>{active?'Suspend access':'Restore access'}</button>
 <Modal open={open} title={active?'Suspend administrator access?':'Restore administrator access?'} message={active?`${name} will lose access to the admin workspace. Their student or instructor records will be kept.`:`${name} will be able to administer the system again.`} className="admin-access-dialog" onDismiss={close} body={<form ref={formRef} action={action} className="admin-access-form">
   <input type="hidden" name="userId" value={userId}/><input type="hidden" name="active" value={String(!active)}/>
   <label htmlFor={id}>Reason for this change</label><textarea id={id} name="reason" required minLength={10} maxLength={500} rows={3} placeholder="Explain why this access change is needed."/><p>Your name and reason will be recorded in the activity log.</p>
   <div className="admin-dialog-actions"><button type="button" className="button" onClick={close}>Cancel</button><Submit active={active}/></div>
 </form>}>{null}</Modal></>;
}
