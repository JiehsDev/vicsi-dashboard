import {createRequire} from 'node:module';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const require=createRequire(import.meta.url),{webpack}=require('next/dist/compiled/webpack/webpack');
export async function buildShellPreview(entry='Tools/testing/shell-preview.tsx',extraAliases={}){
 const output=await mkdtemp(path.join(tmpdir(),'vicsi-shell-bundle-'));
 await new Promise((resolve,reject)=>webpack({mode:'development',devtool:false,optimization:{minimize:false},entry:path.resolve(entry),output:{path:output,filename:'shell.js'},resolve:{extensions:['.tsx','.ts','.js'],alias:{'@/app/admin/invitations/actions$':path.resolve('Tools/testing/admin-users-action-preview.ts'),'@/app/admin/users/actions$':path.resolve('Tools/testing/admin-users-action-preview.ts'),'@':path.resolve('src'),'next/form$':path.resolve('Tools/testing/form-preview.tsx'),'next/link$':path.resolve('Tools/testing/router-preview.tsx'),'next/navigation$':path.resolve('Tools/testing/router-preview.tsx'),...extraAliases}},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:path.resolve('Tools/testing/typescript-webpack-loader.cjs')}]},performance:{hints:false}},(err,stats)=>err?reject(err):stats.hasErrors()?reject(new Error(stats.toString({all:false,errors:true}))):resolve()));
 return readFile(path.join(output,'shell.js'));
}
