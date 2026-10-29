// eslint-disable-next-line @typescript-eslint/no-require-imports -- Webpack's isolated test loader uses the CommonJS loader interface.
const ts=require('typescript');
module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;};
