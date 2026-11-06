"use client";

import {useSyncExternalStore} from "react";
import {Moon,Sun} from "lucide-react";
import {currentTheme,setTheme,subscribeToTheme} from "../lib/theme";

export function ThemeToggle() {
  const theme=useSyncExternalStore(subscribeToTheme,currentTheme,()=>"light");
  const dark=theme==="dark";
  const label=`Switch to ${dark?"light":"dark"} mode`;
  return <button type="button" className="theme-toggle" aria-label={label} title={label}
    onClick={()=>setTheme(currentTheme()==="dark"?"light":"dark")}>
    {dark?<Sun size={20} aria-hidden="true"/>:<Moon size={20} aria-hidden="true"/>}
  </button>;
}
