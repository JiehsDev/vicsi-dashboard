export const THEME_STORAGE_KEY = "vicsi-theme";
export const THEME_CHANGE_EVENT = "vicsi-theme-change";
export type Theme = "light" | "dark";
export const PALETTE_STORAGE_KEY='vicsi-palette';
export const PALETTE_CHANGE_EVENT='vicsi-palette-change';
export const PALETTES=[
  {id:'default',name:'Default',description:'The current ViCSI palette'},
  {id:'parsu',name:'ParSU Blue',description:'Deep blue with cool blue accents'},
  {id:'green',name:'Green',description:'Forest green with soft mint accents'},
  {id:'pink',name:'Pink',description:'Rich rose with soft pink accents'},
  {id:'monochrome',name:'Monochrome',description:'Black, white and neutral grays'},
] as const;
export type Palette=typeof PALETTES[number]['id'];
export function validPalette(value:unknown):Palette{return PALETTES.some(p=>p.id===value)?value as Palette:'default';}

/** Runs before first paint; no user-provided values are interpolated into this script. */
export const THEME_INIT_SCRIPT = `(()=>{let saved,palette;try{saved=localStorage.getItem("${THEME_STORAGE_KEY}");palette=localStorage.getItem("${PALETTE_STORAGE_KEY}")}catch{}const dark=saved==="dark"||(saved!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=dark?"dark":"light";document.documentElement.dataset.palette=${JSON.stringify(PALETTES.map(p=>p.id))}.includes(palette)?palette:"default"})()`;

export function currentPalette():Palette{return validPalette(document.documentElement.dataset.palette);}
export function setPalette(palette:Palette){
  const value=validPalette(palette);
  document.documentElement.dataset.palette=value;
  try{localStorage.setItem(PALETTE_STORAGE_KEY,value);}catch{/* Changes still apply to this tab. */}
  window.dispatchEvent(new Event(PALETTE_CHANGE_EVENT));
}
export function subscribeToPalette(onChange:()=>void){
  function storageChanged(event:StorageEvent){
    if(event.key!==PALETTE_STORAGE_KEY&&event.key!==null)return;
    let value;try{value=localStorage.getItem(PALETTE_STORAGE_KEY);}catch{/* Default when storage cannot be read. */}
    document.documentElement.dataset.palette=validPalette(value);onChange();
  }
  window.addEventListener('storage',storageChanged);window.addEventListener(PALETTE_CHANGE_EVENT,onChange);
  return()=>{window.removeEventListener('storage',storageChanged);window.removeEventListener(PALETTE_CHANGE_EVENT,onChange);};
}

export function currentTheme():Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}
export function setTheme(theme:Theme) {
  document.documentElement.dataset.theme=theme;
  try { localStorage.setItem(THEME_STORAGE_KEY,theme); } catch { /* The current tab still works if storage is unavailable. */ }
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}
export function subscribeToTheme(onChange:()=>void) {
  const system=window.matchMedia("(prefers-color-scheme: dark)");
  function syncPreference() {
    let saved:string|null=null;
    try { saved=localStorage.getItem(THEME_STORAGE_KEY); } catch { /* Fall back to the system preference. */ }
    document.documentElement.dataset.theme=saved==="dark"||saved!=="light"&&system.matches?"dark":"light";
    onChange();
  }
  function storageChanged(event:StorageEvent) {
    if(event.key===THEME_STORAGE_KEY || event.key===null)syncPreference();
  }
  system.addEventListener("change",syncPreference);
  window.addEventListener("storage",storageChanged);
  window.addEventListener(THEME_CHANGE_EVENT,onChange);
  return ()=>{
    system.removeEventListener("change",syncPreference);
    window.removeEventListener("storage",storageChanged);
    window.removeEventListener(THEME_CHANGE_EVENT,onChange);
  };
}
