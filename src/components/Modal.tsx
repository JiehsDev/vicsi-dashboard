"use client";

import {useEffect,useId,useRef} from "react";
let scrollLocks=0;
let originalOverflow="";

/** A styled in-app dialog; showModal traps focus and makes the background inert. */
export function Modal({open,title,message,onDismiss,children,body,className="",dismissDisabled=false}: {
  open:boolean;title:string;message:string;onDismiss:()=>void;children:React.ReactNode;body?:React.ReactNode;className?:string;dismissDisabled?:boolean;
}) {
  const ref=useRef<HTMLDialogElement>(null);
  const id=useId();
  useEffect(()=>{
    if (!open || !ref.current) return;
    const dialog=ref.current;
    const previousFocus=document.activeElement;
    dialog.showModal();
    if(scrollLocks===0)originalOverflow=document.body.style.overflow;
    scrollLocks++;
    document.body.style.overflow="hidden";
    return ()=>{
      dialog.close();
      scrollLocks=Math.max(0,scrollLocks-1);
      document.body.style.overflow=scrollLocks?"hidden":originalOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  },[open]);
  return <dialog ref={ref} className={`app-modal ${className}`} aria-labelledby={`${id}-title`} aria-describedby={`${id}-message`}
    onCancel={event=>{event.preventDefault();if(!dismissDisabled)onDismiss();}}>
    <h2 id={`${id}-title`}>{title}</h2>
    <p id={`${id}-message`}>{message}</p>
    {body&&<div className="app-modal-body">{body}</div>}
    <div className="app-modal-actions">{children}</div>
  </dialog>;
}
