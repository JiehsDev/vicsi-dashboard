'use client';
import {useEffect} from 'react';
import {currentPalette,subscribeToPalette} from '@/lib/theme';
/** Keep the favicon in sync on every route, including sign-in and registration. */
export function AppearanceSync(){
  useEffect(()=>{
    const sync=()=>{
      const icon=document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if(icon)icon.href=`/brand/favicon${currentPalette()==='default'?'':`-${currentPalette()}`}.svg?v=6`;
    };
    sync();return subscribeToPalette(sync);
  },[]);
  return null;
}
