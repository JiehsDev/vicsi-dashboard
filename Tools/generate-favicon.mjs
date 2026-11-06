// Preserve the dashboard artwork verbatim inside a self-contained SVG favicon.
import {readFile,writeFile} from 'node:fs/promises';
const artwork=await readFile(new URL('../public/brand/vicsi-logo.png',import.meta.url));
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="12" fill="#0d47a1"/>
  <svg x="4" y="13.7" width="56" height="36.6" viewBox="85 132 239 156">
    <image href="data:image/png;base64,${artwork.toString('base64')}" width="412" height="412"/>
  </svg>
</svg>
`;
await writeFile(new URL('../public/brand/favicon.svg',import.meta.url),svg);
console.log('Generated the ViCSI favicon from the current dashboard logo.');
