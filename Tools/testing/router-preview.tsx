export const usePathname=()=>new URLSearchParams(window.location.search).get("previewPath")??"/results";
export const useSearchParams=()=>new URLSearchParams(window.location.search);
export const useRouter=()=>({replace:(href:string)=>window.history.replaceState(null,"",href),refresh:()=>{document.documentElement.dataset.routerRefreshed='true';}});
export function PreviewLink(props:React.ComponentProps<"a">){return <a {...props}/>;}
export default PreviewLink;
