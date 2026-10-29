import ts from 'typescript';
import {readFile} from 'node:fs/promises';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(fileURLToPath(new URL('../..',import.meta.url)));
export async function resolve(specifier,context,next) {
  if(process.env.VICSI_SESSION_TESTS==='1' && ['@/lib/supabaseAdmin','@/lib/rateLimit','./supabaseServer','./supabaseAdmin','@/lib/supabaseClient'].includes(specifier))
    return {url:new URL('./session-api-fixture.ts',import.meta.url).href,shortCircuit:true};
  if(process.env.VICSI_DASHBOARD_FIXTURES==='1' && specifier==='@/lib/results')return {url:new URL('./dashboard-fixture-backend.ts',import.meta.url).href,shortCircuit:true};
  if(process.env.VICSI_DASHBOARD_FIXTURES==='1' && specifier==='@/lib/supabaseClient')return {url:'data:text/javascript,export async function getMyProfile(){return globalThis.__vicsiProfile}',shortCircuit:true};
  if(['next/link','next/navigation','next/headers','next/server'].includes(specifier))return next(specifier+'.js',context);
  if(specifier==='server-only')return {url:'data:text/javascript,export{}',shortCircuit:true};
  if(specifier.startsWith('@/'))specifier=pathToFileURL(path.join(root,'src',specifier.slice(2))).href;
  if(specifier.startsWith('.') || specifier.startsWith('file:')) {
    const url=new URL(specifier,context.parentURL);
    if(!path.extname(url.pathname)) {
      for(const extension of ['.ts','.tsx','.js'])try {return await next(url.href+extension,context);}catch { /* Try the next supported source extension. */ }
    }
  }
  return next(specifier,context);
}
export async function load(url,context,next) {
  if(url.startsWith('file:') && /\.tsx?$/.test(url)) {
    const source=await readFile(new URL(url),'utf8');
    return {format:'module',shortCircuit:true,source:ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText};
  }
  return next(url,context);
}
