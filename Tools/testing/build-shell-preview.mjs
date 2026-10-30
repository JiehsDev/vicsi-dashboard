import {createRequire} from 'node:module';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const require=createRequire(import.meta.url),{webpack}=require('next/dist/compiled/webpack/webpack');
export async function buildShellPreview(entry='Tools/testing/shell-preview.tsx'){
 const output=await mkdtemp(path.join(tmpdir(),'vicsi-shell-bundle-'));
 await new Promise((resolve,reject)=>webpack({mode:'development',devtool:false,optimization:{minimize:false},entry:path.resolve(entry),output:{path:output,filename:'shell.js'},resolve:{extensions:['.tsx','.ts','.js'],alias:{'next/link$':path.resolve('Tools/testing/router-preview.tsx'),'next/navigation$':path.resolve('Tools/testing/router-preview.tsx')}},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:path.resolve('Tools/testing/typescript-webpack-loader.cjs')}]},performance:{hints:false}},(err,stats)=>err?reject(err):stats.hasErrors()?reject(new Error(stats.toString({all:false,errors:true}))):resolve()));
 return readFile(path.join(output,'shell.js'));
}
