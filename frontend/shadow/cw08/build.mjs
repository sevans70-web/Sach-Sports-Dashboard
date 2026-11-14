/** Build only the isolated research Worker. Never imports the dashboard build. */
import {build} from 'rolldown';import {readFile,mkdir,writeFile} from 'node:fs/promises';import {execFileSync} from 'node:child_process';import {resolve} from 'node:path';import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'../..'),repo=resolve(root,'..'),sha=b=>createHash('sha256').update(b).digest('hex');
export async function buildShadow(output,entry=resolve(import.meta.dirname,'entry.mjs')){
 for(const [commit,path] of [['007c02b','frontend/model-research/cw08-nhl-v3/models.json'],['396af74','frontend/lib/nhl-shadow-model.ts'],['396af74','frontend/model-research/cw08-nhl-v3/shadow-protocol.json'],['396af74','frontend/lib/probability-forecast.ts'],['396af74','frontend/lib/opportunity-backtest.ts'],['27324da','frontend/model-research/cw08-nhl-v3/cloudflare-shadow-manifests.json']]){
  const bytes=await readFile(resolve(repo,path)),frozen=execFileSync('git',['show',commit+':'+path],{cwd:repo});if(!bytes.equals(frozen))throw Error('Frozen artifact changed: '+path);
 }
 const implementationDigest=sha(await readFile(resolve(root,'lib/nhl-shadow-model.ts')));
 const result=await build({cwd:root,input:entry,platform:'node',external:id=>id==='cloudflare:workers'||id.startsWith('node:'),resolve:{alias:{'@':root}},plugins:[{name:'pin-implementation',transform(code,id){if(id.endsWith('/domain.mjs'))return code.replace('__CW08_IMPLEMENTATION_DIGEST__',JSON.stringify(implementationDigest));}},{name:'protocol-raw',resolveId(id,importer){if(id.endsWith('?raw'))return resolve(importer.slice(0,importer.lastIndexOf('/')),id.slice(0,-4))+'?raw';},async load(id){if(id.endsWith('?raw'))return 'export default '+JSON.stringify(await readFile(id.slice(0,-4),'utf8'))+';';}}],output:{format:'es',file:output,minify:false}});
 await mkdir(resolve(output,'..'),{recursive:true});await writeFile(output,result.output[0].code);return {bytes:Buffer.byteLength(result.output[0].code),sha256:sha(result.output[0].code)};
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(import.meta.filename)){if(!process.argv[2])throw Error('Pass an isolated output path');console.log(JSON.stringify(await buildShadow(resolve(process.argv[2]))));}
