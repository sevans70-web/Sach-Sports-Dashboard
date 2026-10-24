import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const urls=new Map();
async function moduleUrl(file){
 if(urls.has(file.href))return urls.get(file.href);
 const source=await readFile(file,'utf8');
 let code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
 for(const match of [...code.matchAll(/from ["'](\.\.\/scripts\/[^"']+\.mjs)["']/g)])code=code.replace(match[1],await moduleUrl(new URL(match[1],file)));
 for(const match of [...code.matchAll(/from ["'](@\/[^"']+)["']/g)]){
  const dependency=new URL('../'+match[1].slice(2)+'.ts',import.meta.url);
  code=code.replace(match[1],await moduleUrl(dependency));
 }
 const url='data:text/javascript;base64,'+Buffer.from(code).toString('base64');urls.set(file.href,url);return url;
}
export async function loadTs(file){return import(await moduleUrl(file))}
