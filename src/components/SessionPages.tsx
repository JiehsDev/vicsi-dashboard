"use client";

import Link from "next/link";
import {ChevronLeft,ChevronRight} from "lucide-react";
import {useEffect,useRef,useState,useSyncExternalStore} from "react";

const changeEvent="vicsi:session-page";
function subscribe(callback:()=>void) {
  window.addEventListener("popstate",callback);
  window.addEventListener(changeEvent,callback);
  return ()=>{window.removeEventListener("popstate",callback);window.removeEventListener(changeEvent,callback);};
}

/** Tables are prepared on the server so scoring and database modules stay there.
 * Page changes reuse that authorized content, without a navigation request. */
export function SessionPages({pages,totalRows,pageSize,query,basePath}: {
  pages:React.ReactNode[];totalRows:number;pageSize:number;query:Record<string,string|undefined>;basePath:string;
}) {
  const initial=new URLSearchParams(Object.entries(query).filter((entry):entry is [string,string]=>entry[1]!==undefined)).toString();
  const search=useSyncExternalStore(subscribe,()=>window.location.search,()=>initial);
  const requested=Number(new URLSearchParams(search).get("page"));
  const page=Number.isSafeInteger(requested)&&requested>0?Math.min(requested,pages.length):1;
  const start=(page-1)*pageSize;
  const content=useRef<HTMLDivElement>(null);
  const [minimumHeight,setMinimumHeight]=useState<number>();
  useEffect(()=>{
    const resize=()=>setMinimumHeight(undefined);
    window.addEventListener("resize",resize);
    return ()=>window.removeEventListener("resize",resize);
  },[]);
  function href(target:number) {
    const params=new URLSearchParams(initial);
    params.set("page",String(target));
    return `${basePath}?${params}`;
  }
  function change(event:React.MouseEvent<HTMLAnchorElement>,target:number) {
    if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    event.preventDefault();
    // A shorter last page must not shrink the document and clamp its scroll position.
    const height=content.current?.getBoundingClientRect().height;
    if(height)setMinimumHeight(previous=>Math.max(previous??0,height));
    window.history.pushState(null,"",href(target));
    window.dispatchEvent(new Event(changeEvent));
  }
  return <>
    <div ref={content} className="session-page-content" style={{minHeight:minimumHeight}}>{pages[page-1]}</div>
    {pages.length>1&&<nav className="session-pagination" aria-label="Session pages">
      <p role="status" aria-live="polite">Showing {start+1}–{Math.min(start+pageSize,totalRows)} of {totalRows} sessions</p>
      <div className="session-pagination-controls">
        {page>1?<Link className="button pagination-button" href={href(page-1)} scroll={false} onClick={event=>change(event,page-1)}><ChevronLeft size={16} aria-hidden="true"/>Previous</Link>:<span className="button pagination-button" aria-disabled="true"><ChevronLeft size={16} aria-hidden="true"/>Previous</span>}
        <span className="session-page-number">Page <strong>{page}</strong> of {pages.length}</span>
        {page<pages.length?<Link className="button pagination-button" href={href(page+1)} scroll={false} onClick={event=>change(event,page+1)}>Next<ChevronRight size={16} aria-hidden="true"/></Link>:<span className="button pagination-button" aria-disabled="true">Next<ChevronRight size={16} aria-hidden="true"/></span>}
      </div>
    </nav>}
  </>;
}
