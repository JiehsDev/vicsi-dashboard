'use client';
import {useEffect,useRef,useState,useTransition} from 'react';
import {usePathname,useRouter,useSearchParams} from 'next/navigation';
import {DASHBOARD_REFRESH_MS,DASHBOARD_AUTH_CHANNEL,DashboardRefreshState,isPublicDashboardPath,shouldDeferDashboardRefresh,validRevisionSnapshot,type RevisionSnapshot} from '@/lib/dashboardRefresh';
import {Spinner} from './LoadingFeedback';

export function DashboardLiveUpdates(){
  const pathname=usePathname(),search=useSearchParams().toString(),router=useRouter();
  const state=useRef(new DashboardRefreshState());
  const channel=useRef<BroadcastChannel|null>(null);
  const target=useRef<{snapshot:RevisionSnapshot;view:string}|null>(null),refreshStarted=useRef(false),refreshing=useRef(false);
  const [unavailable,setUnavailable]=useState(false),[pending,startTransition]=useTransition();
  const retry=useRef<()=>void>(()=>{});
  useEffect(()=>{
    refreshing.current=pending;
    if(pending)refreshStarted.current=true;
    else if(refreshStarted.current){
      if(target.current)state.current.applied(target.current.snapshot,target.current.view);
      target.current=null;refreshStarted.current=false;
    }
  },[pending]);
  useEffect(()=>{
    if(!('BroadcastChannel' in window))return;
    const connection=new BroadcastChannel(DASHBOARD_AUTH_CHANNEL);channel.current=connection;
    connection.onmessage=event=>{
      if(event.data?.type==='signed-out'&&typeof event.data.scope==='string'&&event.data.scope===state.current.scope){
        state.current.clear();window.location.replace('/login?expired=1');
      }
    };
    return()=>{connection.close();channel.current=null;};
  },[]);
  useEffect(()=>{
    if(isPublicDashboardPath(pathname)){
      if(state.current.scope)channel.current?.postMessage({type:'signed-out',scope:state.current.scope});
      state.current.clear();target.current=null;refreshStarted.current=false;refreshing.current=false;return;
    }
    let stopped=false,busy=false;
    let controller:AbortController|null=null;
    async function check(){
      if(stopped||busy||document.hidden)return;
      if(!navigator.onLine){setUnavailable(true);return;}
      busy=true;controller=new AbortController();
      const timeout=window.setTimeout(()=>controller?.abort(),15000);
      try{
        const response=await fetch('/api/dashboard/revision',{cache:'no-store',credentials:'same-origin',signal:controller.signal});
        if(stopped)return;
        if(response.status===401){
          channel.current?.postMessage({type:'signed-out',scope:state.current.scope});
          state.current.clear();window.location.replace('/login?expired=1');return;
        }
        if(!response.ok)throw Error('Updates unavailable');
        const snapshot:unknown=await response.json();if(!validRevisionSnapshot(snapshot))throw Error('Invalid update response');
        setUnavailable(false);
        const view=pathname+(search?`?${search}`:'');
        const action=state.current.accept(snapshot,view);
        if(action==='identity-changed'){
          state.current.clear();window.location.replace('/');return;
        }
        if(action==='changed'&&!refreshing.current&&!shouldDeferDashboardRefresh(document)){
          target.current={snapshot,view};refreshing.current=true;
          startTransition(()=>router.refresh());
        }
      }catch{if(!stopped)setUnavailable(true);}
      finally{busy=false;window.clearTimeout(timeout);}
    }
    const visible=()=>{if(!document.hidden)void check();};
    const offline=()=>setUnavailable(true);
    const authExpired=()=>{if(state.current.scope)channel.current?.postMessage({type:'signed-out',scope:state.current.scope});state.current.clear();};
    retry.current=()=>void check();
    document.addEventListener('visibilitychange',visible);window.addEventListener('pageshow',visible);window.addEventListener('focus',visible);window.addEventListener('online',visible);window.addEventListener('offline',offline);window.addEventListener('vicsi-dashboard-auth-expired',authExpired);
    const interval=window.setInterval(()=>void check(),DASHBOARD_REFRESH_MS);void check();
    return()=>{stopped=true;controller?.abort();window.clearInterval(interval);document.removeEventListener('visibilitychange',visible);window.removeEventListener('pageshow',visible);window.removeEventListener('focus',visible);window.removeEventListener('online',visible);window.removeEventListener('offline',offline);window.removeEventListener('vicsi-dashboard-auth-expired',authExpired);};
  },[pathname,search,router]);
  if(isPublicDashboardPath(pathname))return null;
  return unavailable?<div className="dashboard-sync-status" role="status"><span>Couldn’t check for updates. Showing last loaded data.</span><button className="button" onClick={()=>retry.current()}>Retry</button></div>:pending?<div className="dashboard-sync-status" role="status"><Spinner/>Updating records…</div>:null;
}
