'use client';
import {useFormStatus} from 'react-dom';
import {useEffect,useSyncExternalStore} from 'react';
import {Spinner} from './LoadingFeedback';

// Bridges React form status to the existing dialog footer's form-associated button.
// No timers or interception of server actions; IDs contain no account credentials.
const pendingForms=new Set<string>();const listeners=new Set<()=>void>();
function subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
function publish(id:string,value:boolean){if(pendingForms.has(id)===value)return;if(value)pendingForms.add(id);else pendingForms.delete(id);listeners.forEach(listener=>listener());}
export function useAssociatedFormPending(id:string|undefined){return useSyncExternalStore(subscribe,()=>!!id&&pendingForms.has(id),()=>false);}
function FormStatusBridge({id}:{id?:string}){
  const {pending}=useFormStatus();
  useEffect(()=>{if(!id)return;publish(id,pending);return()=>publish(id,false);},[id,pending]);
  return pending?<span className="sr-only" role="status">Submitting form…</span>:null;
}
export function PendingForm({children,...props}:React.ComponentProps<'form'>){
  return <form {...props}>{children}<FormStatusBridge id={props.id}/></form>;
}
export function SubmitButton({children,pendingLabel='Saving…',disabled,form,...props}:Omit<React.ComponentProps<'button'>,'type'>&{pendingLabel?:string}){
  const status=useFormStatus();const associated=useAssociatedFormPending(form);const pending=status.pending||associated;
  return <button {...props} form={form} type="submit" disabled={disabled||pending} aria-busy={pending}>
    {pending?<><Spinner/><span role="status">{pendingLabel}</span></>:children}
  </button>;
}
