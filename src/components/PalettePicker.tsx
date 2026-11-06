'use client';
import {useState,useSyncExternalStore} from 'react';
import {Palette as PaletteIcon} from 'lucide-react';
import {PALETTES,currentPalette,setPalette,subscribeToPalette} from '@/lib/theme';
import {Modal} from './Modal';
export function PalettePicker(){
  const [open,setOpen]=useState(false);
  const selected=useSyncExternalStore(subscribeToPalette,currentPalette,()=>'default');
  const name=PALETTES.find(p=>p.id===selected)!.name;
  return <>
    <button type="button" className="palette-toggle" aria-label="Choose color theme" aria-haspopup="dialog" title={`Color theme: ${name}`} onClick={()=>setOpen(true)}><PaletteIcon size={20} aria-hidden="true"/></button>
    <Modal open={open} title="Color theme" message="Your choice is saved on this browser. Light and dark mode stay separate." className="palette-dialog" onDismiss={()=>setOpen(false)} body={
      <fieldset className="palette-options"><legend className="sr-only">Choose a color theme</legend>{PALETTES.map(p=><label key={p.id} className="palette-option" data-selected={p.id===selected}>
        <span className={`palette-swatch swatch-${p.id}`} aria-hidden="true"/>
        <span className="palette-option-copy"><strong>{p.name}</strong><span>{p.description}</span></span>
        <input type="radio" name="color-palette" value={p.id} checked={selected===p.id} onChange={()=>setPalette(p.id)}/>
      </label>)}</fieldset>
    }><button type="button" className="button button-primary" onClick={()=>setOpen(false)}>Done</button></Modal>
  </>;
}
