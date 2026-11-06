"use client";

import {useRef,useState} from "react";
import {useFormStatus} from "react-dom";
import {Modal} from "./Modal";
import {Spinner} from './LoadingFeedback';

export function ConfirmSubmitButton({confirmMessage,className,children,confirmLabel="Confirm",title="Confirm action",pendingLabel}: {
  confirmMessage:string;className?:string;children:React.ReactNode;confirmLabel?:string;title?:string;pendingLabel?:string;
}) {
  const [open,setOpen]=useState(false);
  const button=useRef<HTMLButtonElement>(null);
  const {pending}=useFormStatus();
  return <>
    <button ref={button} type="submit" className={className} disabled={pending} aria-busy={pending} aria-haspopup="dialog"
      onClick={event=>{
        event.preventDefault();
        const form=event.currentTarget.form;
        if (!pending && form?.reportValidity()) {
          event.currentTarget.focus();
          setOpen(true);
        }
      }}>{pending?<><Spinner/><span role="status">{pendingLabel??(confirmLabel==='Sign out'?'Signing out…':'Saving…')}</span></>:children}</button>
    <Modal open={open} title={title} message={confirmMessage} onDismiss={()=>setOpen(false)}>
      <button type="button" className="button" autoFocus onClick={()=>setOpen(false)}>Cancel</button>
      <button type="button" className="button button-primary" disabled={pending} onClick={()=>{
        if (!open || pending) return;
        setOpen(false);
        const trigger=button.current;
        // Preserve validation and the original Server Action without clicking again.
        if (trigger?.isConnected) trigger.form?.requestSubmit(trigger);
      }}>{confirmLabel}</button>
    </Modal>
  </>;
}
