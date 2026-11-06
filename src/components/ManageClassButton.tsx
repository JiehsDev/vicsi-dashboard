"use client";

import {useState} from "react";
import {Pencil,UserPlus} from "lucide-react";
import {useRouter} from "next/navigation";
import {Modal} from "./Modal";
import {SubmitButton,useAssociatedFormPending} from './SubmitButton';

type ClassDialogProps={
  children:React.ReactNode;formId:string;initialOpen?:boolean;closeHref?:string;
};

export function ManageClassButton(props:ClassDialogProps) {
  return <ClassFormDialog {...props} label="Manage class" message="Edit class details or manage enrollment and class status." submitLabel="Save changes" icon={<Pencil size={15} aria-hidden="true"/>}/>;
}

export function EnrollStudentButton(props:ClassDialogProps) {
  return <ClassFormDialog {...props} label="Enroll student" message="Enter the student's exact student number to add them to this class." submitLabel="Enroll student" icon={<UserPlus size={15} aria-hidden="true"/>}/>;
}

function ClassFormDialog({children,formId,initialOpen=false,closeHref,label,message,submitLabel,icon}:ClassDialogProps&{
  label:string;message:string;submitLabel:string;icon:React.ReactNode;
}) {
  const [open,setOpen]=useState(initialOpen);
  const pending=useAssociatedFormPending(formId);
  const router=useRouter();
  function close() {
    if(pending)return;
    const form=document.getElementById(formId);
    if(form instanceof HTMLFormElement)form.reset();
    setOpen(false);
    if(closeHref)router.replace(closeHref,{scroll:false});
  }
  return <>
    <button type="button" className={`button ${label==="Manage class"?"manage-class-button":"enroll-student-button"}`} aria-haspopup="dialog" onClick={event=>{event.currentTarget.focus();setOpen(true);}}>{icon}{label}</button>
    <Modal open={open} title={label} message={message} dismissDisabled={pending} className={`class-management-dialog${label==="Enroll student"?" class-enrollment-dialog":""}`} onDismiss={close} body={children}>
      <button type="button" className="button" onClick={close} disabled={pending}>Cancel</button>
      <SubmitButton className="button button-primary" form={formId} pendingLabel={label==='Enroll student'?'Enrolling student…':'Saving changes…'}>{submitLabel}</SubmitButton>
    </Modal>
  </>;
}
