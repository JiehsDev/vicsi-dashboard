"use client";
import {LoadingStatus} from "./LoadingFeedback";
import {useEffect,useState} from "react";
import {Copy,Download} from "lucide-react";
import QRCode from "qrcode";

export function ClassInviteShare({code,token,enabled}:{code:string;token:string;enabled:boolean}){
  const [url,setUrl]=useState("");const [qr,setQr]=useState("");const [notice,setNotice]=useState("");
  useEffect(()=>{
    let active=true;const link=new URL(`/results/classes/join?invite=${token}`,window.location.origin).href;
    QRCode.toDataURL(link,{width:384,margin:4,errorCorrectionLevel:"M",color:{dark:"#142e49",light:"#ffffff"}})
      .then(data=>{if(active){setUrl(link);setQr(data);}}).catch(()=>{if(active){setUrl(link);setNotice("QR code unavailable. You can still copy the link.");}});
    return()=>{active=false;};
  },[token]);
  async function copy(text:string){
    try{await navigator.clipboard.writeText(text);setNotice("Copied to clipboard.");}
    catch{setNotice("Copy isn't available here. Select the code or link and copy it manually.");}
  }
  return <div className="class-invite-share">
    <p className="invite-status">{enabled?"Students can join using this code or link.":"Invites are off. Students cannot join until you turn them on."}</p>
    <div className="class-code-line"><code>{code.slice(0,5)}-{code.slice(5)}</code><button type="button" className="button" onClick={()=>copy(code)}><Copy size={14} aria-hidden="true"/>Copy code</button></div>
    <label htmlFor="class-invite-link">Invite link</label>
    <input id="class-invite-link" type="text" readOnly value={url} onFocus={e=>e.currentTarget.select()}/>
    <button type="button" className="button" disabled={!url} onClick={()=>copy(url)}><Copy size={14} aria-hidden="true"/>Copy link</button>
    {!url&&<LoadingStatus>Preparing class invitation…</LoadingStatus>}{qr&&<div className="invite-qr">{/* Generated PNG data URL; image optimization is unnecessary. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qr} width={192} height={192} alt="Scan to open this class invitation"/><div><h3>Scan to join</h3><p>Students sign in, check the class details, then choose Join class.</p><a className="button" href={qr} download="vicsi-class-invite.png"><Download size={14} aria-hidden="true"/>Download QR code</a></div></div>}
    <p className="invite-feedback" role="status" aria-live="polite">{notice}</p>
  </div>;
}
