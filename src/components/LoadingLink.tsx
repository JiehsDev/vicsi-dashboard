'use client';
import Link,{useLinkStatus} from 'next/link';
import {createPortal} from 'react-dom';
import {Spinner} from './LoadingFeedback';
function NavigationStatus(){
  const {pending}=useLinkStatus();
  if(!pending)return null;
  return createPortal(<div className="route-loading" role="status" aria-live="polite"><div className="route-loading-bar" aria-hidden="true"/><span className="route-loading-message"><Spinner/>Opening page…</span></div>,document.body);
}
/** Next owns the pending lifecycle, including canceled, cached and superseded navigations. */
export default function LoadingLink({children,...props}:React.ComponentProps<typeof Link>){
  return <Link {...props}>{children}<NavigationStatus/></Link>;
}
