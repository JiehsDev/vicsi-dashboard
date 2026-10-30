export const THEME_STORAGE_KEY = "vicsi-theme";
export const THEME_CHANGE_EVENT = "vicsi-theme-change";
export type Theme = "light" | "dark";

/** Runs before first paint; no user-provided values are interpolated into this script. */
export const THEME_INIT_SCRIPT = `(()=>{let saved;try{saved=localStorage.getItem("${THEME_STORAGE_KEY}")}catch{}const dark=saved==="dark"||(saved!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=dark?"dark":"light"})()`;

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
