import {writeFile,mkdir,readFile} from 'node:fs/promises';
import {renderToStaticMarkup} from 'react-dom/server';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import {DeductionResultPanels} from '../../src/components/DeductionResultPanels.tsx';
import {ResultScoreSummary} from '../../src/components/ResultScoreSummary.tsx';
import {resultFor} from '../../src/lib/__tests__/assessmentPresentation.fixture.ts';
const dir='docs/evidence/assessment-phase5';
await mkdir(dir,{recursive:true});
const css=await postcss([tailwind({base:process.cwd()})]).process(await readFile('src/app/globals.css','utf8'),{from:'src/app/globals.css'});
for(const instructor of [false,true]) {
  const r=resultFor();r.trainingCompletion='Completed';
  const html=renderToStaticMarkup(<main style={{maxWidth:860,margin:'auto',padding:16,fontFamily:'Arial,sans-serif'}}><ResultScoreSummary result={r}/><DeductionResultPanels result={r} instructor={instructor}/></main>);
  await writeFile(`${dir}/${instructor?'instructor':'student'}-fixture.html`,`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.css}</style></head><body>${html}</body></html>`);
}
console.log('Rendered real result components and Tailwind CSS to '+dir);
