/** Offline one-module overlay on the ALREADY deployed diagnostic, not R1. */
import{readFileSync,writeFileSync,readdirSync}from'node:fs';
import{resolve,join,relative}from'node:path';
import{fileURLToPath}from'node:url';
import{execFileSync}from'node:child_process';
import{createHash}from'node:crypto';
import{rolldown}from'rolldown';
import{prepareFrozenNbaDiagnostic}from'./prepare-nba-odds-diagnostic.mjs';
const app=resolve(import.meta.dirname,'..'),release=join(app,'releases/nba-population-diagnostic-2026-11-23'),modulePath='bundle/nba-odds-diagnostic.js';
const sha=b=>createHash('sha256').update(b).digest('hex');
function inspect(output){const base=join(output,'workers/default'),config=JSON.parse(readFileSync(join(base,'worker.config.json'))),files=[];function walk(path){for(const e of readdirSync(path,{withFileTypes:true})){const p=join(path,e.name);if(e.isSymbolicLink())throw Error('census_symlink');if(e.isDirectory())walk(p);else{const b=readFileSync(p);files.push({path:relative(base,p).replaceAll('\\','/'),bytes:b.length,sha256:sha(b)});}}}for(const n of ['bundle','assets'])walk(join(base,n));files.sort((a,b)=>a.path.localeCompare(b.path));return{config,files,digest:sha(JSON.stringify({config,files}))};}
export async function prepareNbaPopulationDiagnostic(output){
 output=resolve(output);const prior=prepareFrozenNbaDiagnostic(output),before=inspect(output),base=join(output,'workers/default');
 if(before.digest!==prior.artifactSha256)throw Error('census_wrong_active_base');
 const build=await rolldown({input:join(app,'scripts/nba-odds-diagnostic-entry.mjs'),platform:'neutral',external:['cloudflare:workers',/^node:/],plugins:[{name:'census-aliases',resolveId(id){if(id.startsWith('@/'))return join(app,id.slice(2)+'.ts');}}]});await build.write({file:join(base,modulePath),format:'esm'});await build.close();
 const after=inspect(output),old=new Map(before.files.map(f=>[f.path,f.sha256])),changed=after.files.filter(f=>old.get(f.path)!==f.sha256);
 if(changed.length!==1||changed[0].path!==modulePath||after.files.length!==before.files.length||JSON.stringify(after.config)!==JSON.stringify(before.config))throw Error('census_unexpected_change');
 const patch=join(output,'population-patch.tar.gz');execFileSync('tar',['--sort=name','--mtime=@0','--owner=0','--group=0','--numeric-owner','-czf',patch,'-C',base,modulePath]);
 const manifest={artifact:'NBA-POP-CENSUS-2026-11-23-'+after.digest.slice(0,12),artifactSha256:after.digest,worker:prior.worker,baseArtifact:prior.artifact,baseArtifactSha256:prior.artifactSha256,baseDeployment:'5f930400-3285-4177-b1d8-ed5307374566',rollbackVersion:'48e8858a-7326-41ea-9457-532c74ec3337',emergencyFallbackVersion:prior.rollbackVersion,authorizationRequired:true,configurationUnchanged:true,unchangedFiles:before.files.length-1,changed:[{path:modulePath,beforeSha256:old.get(modulePath),afterSha256:changed[0].sha256}],patch:{file:'population-patch.tar.gz',sha256:sha(readFileSync(patch)),bytes:readFileSync(patch).length},scope:'Only diagnostic module: preserve feed-sample, add all-seven-offer streamed feed-census and bounded single-resource source-census. No R1/model/queue/namespace/schema/binding/schedule/data changes.'};
 writeFileSync(join(output,'population-manifest.json'),JSON.stringify(manifest,null,2)+'\n');return manifest;
}
export function prepareFrozenNbaPopulationDiagnostic(output,folder=release){
 const m=JSON.parse(readFileSync(join(folder,'manifest.json'))),patch=join(folder,m.patch.file);
 if(m.worker!=='sach-sports-cloudflare-test'||m.changed.length!==1||m.changed[0].path!==modulePath||sha(readFileSync(patch))!==m.patch.sha256)throw Error('census_patch_rejected');
 const names=execFileSync('tar',['-tzf',patch],{encoding:'utf8'}).trim().split('\n');if(JSON.stringify(names)!==JSON.stringify([modulePath]))throw Error('census_patch_paths');
 prepareFrozenNbaDiagnostic(output);const before=inspect(output);if(before.digest!==m.baseArtifactSha256)throw Error('census_base_rejected');
 execFileSync('tar',['-xzf',patch,'-C',join(output,'workers/default')]);if(inspect(output).digest!==m.artifactSha256)throw Error('census_frozen_digest');return m;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const[mode,out,...extra]=process.argv.slice(2);if(extra.length||!out||!['--prepare','--prepare-frozen'].includes(mode))throw Error('Offline only: --prepare OUTPUT or --prepare-frozen NEW_OUTPUT; no deployment mode');
 console.log(JSON.stringify(mode==='--prepare'?await prepareNbaPopulationDiagnostic(out):prepareFrozenNbaPopulationDiagnostic(resolve(out))));
}
