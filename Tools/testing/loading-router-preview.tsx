// Browser-only adapter for exercising the real LoadingLink's pending feedback.
import {createContext,useContext,useState} from 'react';
export {usePathname,useSearchParams,useRouter} from './router-preview';
const PendingContext=createContext(false);
export const useLinkStatus=()=>({pending:useContext(PendingContext)});
export default function PreviewLink({children,onClick,...props}:React.ComponentProps<'a'>){
  const [pending,setPending]=useState(false);
  return <PendingContext.Provider value={pending}><a {...props} onClick={event=>{
    onClick?.(event);if(event.defaultPrevented)return;event.preventDefault();setPending(true);
    (window as unknown as {finishNavigation:()=>void}).finishNavigation=()=>setPending(false);
  }}>{children}</a></PendingContext.Provider>;
}
