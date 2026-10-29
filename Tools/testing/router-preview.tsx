export const usePathname=()=>"/results";
export const useSearchParams=()=>new URLSearchParams(window.location.search);
export function PreviewLink(props:React.ComponentProps<"a">){return <a {...props}/>;}
export default PreviewLink;
