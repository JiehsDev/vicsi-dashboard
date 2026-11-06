// Preserve the dashboard artwork verbatim inside a self-contained SVG favicon.
import {readFile,writeFile} from 'node:fs/promises';
const artwork=await readFile(new URL('../public/brand/vicsi-logo.png',import.meta.url));
const palettes={default:['#0d47a1','#ffffff'],parsu:['#003c71','#b5d9ff'],green:['#14532d','#bbf7d0'],pink:['#831843','#fbcfe8'],monochrome:['#171717','#ffffff']};
for(const [palette,[background,foreground]] of Object.entries(palettes)){
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <defs><filter id="ink" color-interpolation-filters="sRGB"><feFlood flood-color="${foreground}"/><feComposite in2="SourceAlpha" operator="in"/></filter></defs>
  <rect width="64" height="64" rx="12" fill="${background}"/>
  <svg x="4" y="13.7" width="56" height="36.6" viewBox="85 132 239 156">
    <image href="data:image/png;base64,${artwork.toString('base64')}" width="412" height="412" filter="url(#ink)"/>
  </svg>
</svg>
`;
await writeFile(new URL(`../public/brand/favicon${palette==='default'?'':`-${palette}`}.svg`,import.meta.url),svg);
}
await writeFile(new URL('../public/brand/logo-mask.svg',import.meta.url),`<svg xmlns="http://www.w3.org/2000/svg" viewBox="85 132 239 156"><image href="data:image/png;base64,${artwork.toString('base64')}" width="412" height="412"/></svg>\n`);
console.log('Generated palette favicons and a logo mask from the unchanged dashboard artwork.');
