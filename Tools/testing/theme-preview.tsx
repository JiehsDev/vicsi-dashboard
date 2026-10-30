// Hydrate the real toggle inside an otherwise read-only local page preview.
import {useEffect} from "react";
import {hydrateRoot} from "react-dom/client";
import {ThemeToggle} from "../../src/components/ThemeToggle";
const root=document.querySelector<HTMLElement>(".theme-control");
function Preview() {
 useEffect(()=>{if(root)root.dataset.themeReady="true";},[]);
 return <ThemeToggle/>;
}
if(root)hydrateRoot(root,<Preview/>);
