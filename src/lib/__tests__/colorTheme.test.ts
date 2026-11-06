import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {THEME_INIT_SCRIPT,validPalette,PALETTES} from '../theme';
test('first paint restores only known palettes and preserves light/dark preferences',()=>{
 for(const palette of PALETTES)for(const theme of ['light','dark']){
  const dataset:Record<string,string>={};
  vm.runInNewContext(THEME_INIT_SCRIPT,{document:{documentElement:{dataset}},localStorage:{getItem:(key:string)=>key==='vicsi-palette'?palette.id:theme},window:{matchMedia:()=>({matches:false})}});
  assert.equal(dataset.palette,palette.id);assert.equal(dataset.theme,theme);
 }
});
test('unknown palettes and unavailable storage restore the current default palette safely',()=>{
 for(const value of ['blue','__proto__','<script>',null,{},1])assert.equal(validPalette(value),'default');
 const dataset:Record<string,string>={};vm.runInNewContext(THEME_INIT_SCRIPT,{document:{documentElement:{dataset}},localStorage:{getItem:()=>{throw Error('blocked');}},window:{matchMedia:()=>({matches:true})}});
 assert.deepEqual(dataset,{theme:'dark',palette:'default'});
});
