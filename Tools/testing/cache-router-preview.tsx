import {useSyncExternalStore} from 'react';
export {useLinkStatus,default} from './router-preview';
const subscribe=(fn:()=>void)=>{window.addEventListener('cache-preview-navigation',fn);return()=>window.removeEventListener('cache-preview-navigation',fn);};
export const usePathname=()=>useSyncExternalStore(subscribe,()=>location.pathname,()=>'/results');
export const useSearchParams=()=>new URLSearchParams(location.search);
const router={refresh:()=>{
 document.documentElement.dataset.refreshCalls=String(Number(document.documentElement.dataset.refreshCalls??0)+1);
 return new Promise<void>(resolve=>{(window as unknown as {finishRefresh:()=>void}).finishRefresh=resolve;});
},replace:(url:string)=>{history.replaceState(null,'',url);window.dispatchEvent(new Event('cache-preview-navigation'));}};
export const useRouter=()=>router;
