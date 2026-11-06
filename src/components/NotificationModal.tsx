"use client";

import {useState} from "react";
import {useRouter} from "next/navigation";
import {Modal} from "./Modal";

export function NotificationModal({title,message,queryKeys=[]}: {title:string;message:string;queryKeys?:string[]}) {
  const [open,setOpen]=useState(true);
  const router=useRouter();
  function dismiss() {
    setOpen(false);
    const url=new URL(window.location.href);
    for (const key of queryKeys) url.searchParams.delete(key);
    if(queryKeys.length) router.replace(`${url.pathname}${url.search}${url.hash}`,{scroll:false});
  }
  return <Modal open={open} title={title} message={message} onDismiss={dismiss}>
    <button type="button" className="button button-primary" autoFocus onClick={dismiss}>Done</button>
  </Modal>;
}
