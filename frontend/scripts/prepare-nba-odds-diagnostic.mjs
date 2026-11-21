/** Offline preparation only. Never uploads, reads credentials or calls a provider. */
import {readFileSync,writeFileSync,readdirSync,existsSync}from'node:fs';
import{resolve,join,relative}from'node:path';import{fileURLToPath}from'node:url';import{execFileSync}from'node:child_process';import{createHash}from'node:crypto';import{rolldown}from'rolldown';import{prepareRelease}from'./deploy-dashboard-release.mjs';
const app=resolve(import.meta.dirname,'..'),release=join(app,'releases/nba-odds-diagnostic-2026-11-21');
const sha=b=>createHash('sha256').update(b).digest('hex');
function inventory(base){const out=[];function visit(path){for(const e of readdirSync(path,{withFileTypes:true})){const f=join(path,e.name);if(e.isSymbolicLink())throw Error('diagnostic_symlink_rejected');if(e.isDirectory())visit(f);else{const b=readFileSync(f);out.push({path:relative(base,f).replaceAll('\\','/'),bytes:b.length,sha256:sha(b)});}}}for(const name of ['bundle','assets'])visit(join(base,name));return out.sort((a,b)=>a.path.localeCompare(b.path));}
function inspect(output){const base=join(output,'workers/default'),config=JSON.parse(readFileSync(join(base,'worker.config.json'))),files=inventory(base);return{config,files,digest:sha(JSON.stringify({config,files}))};}
export function diagnosticWrapper(original){
 const marker='export default{\n ...dashboard,\n';if(original.split(marker).length!==2)throw Error('diagnostic_fallback_entry_changed');
 return "import {isNbaOddsDiagnostic,handleNbaOddsDiagnostic} from './nba-odds-diagnostic.js';\n"+original.replace(marker,marker+" async fetch(request,env,ctx){\n  if(isNbaOddsDiagnostic(request))return handleNbaOddsDiagnostic(request);\n  return dashboard.fetch(request,env,ctx);\n },\n");
}
function baseline(output){if(existsSync(output))throw Error('diagnostic_destination_exists');return prepareRelease('fallback',output);}
export async function prepareNbaDiagnostic(output){
 output=resolve(output);const baseProof=baseline(output),base=join(output,'workers/default'),before=inspect(output),entry=join(base,'bundle/namespace-fallback.js'),original=readFileSync(entry,'utf8');
 const build=await rolldown({input:join(app,'scripts/nba-odds-diagnostic-entry.mjs'),platform:'neutral',external:['cloudflare:workers',/^node:/],plugins:[{name:'diagnostic-aliases',resolveId(id){if(id.startsWith('@/'))return join(app,id.slice(2)+'.ts');}}]});
 await build.write({file:join(base,'bundle/nba-odds-diagnostic.js'),format:'esm'});await build.close();writeFileSync(entry,diagnosticWrapper(original));
 const after=inspect(output),prior=new Map(before.files.map(f=>[f.path,f.sha256])),current=new Map(after.files.map(f=>[f.path,f.sha256])),changed=[...new Set([...prior.keys(),...current.keys()])].filter(k=>prior.get(k)!==current.get(k)).sort();
 if(JSON.stringify(before.config)!==JSON.stringify(after.config)||JSON.stringify(changed)!==JSON.stringify(['bundle/namespace-fallback.js','bundle/nba-odds-diagnostic.js']))throw Error('diagnostic_unexpected_artifact_change');
 const patch=join(output,'diagnostic-patch.tar.gz');execFileSync('tar',['--sort=name','--mtime=@0','--owner=0','--group=0','--numeric-owner','-czf',patch,'-C',base,...changed]);
 const manifest={artifact:'NBA-ODDS-DIAG-2026-11-21-'+after.digest.slice(0,12),artifactSha256:after.digest,worker:'sach-sports-cloudflare-test',baseArtifactDigest:baseProof.digest,baseArchiveSha256:sha(readFileSync(join(app,'releases/dashboard-capture-2026-11-14/fallback.tar.gz'))),rollbackVersion:'a48c431a-5c3e-4491-8529-38cb20dfa898',authorizationRequired:true,scope:'Only GET /api/market-coverage?sport=nba&mode=feed-sample. Unmatched fetches, assets, held schedules, queue class, bindings, models and records retain approved fallback.',changed:changed.map(path=>({path,beforeSha256:prior.get(path)||null,afterSha256:current.get(path)})),unchangedFiles:before.files.length-1,configurationUnchanged:true,patch:{file:'diagnostic-patch.tar.gz',sha256:sha(readFileSync(patch)),bytes:readFileSync(patch).length}};
 writeFileSync(join(output,'diagnostic-manifest.json'),JSON.stringify(manifest,null,2)+'\n');return manifest;
}
export function prepareFrozenNbaDiagnostic(output,folder=release){
 output=resolve(output);const manifest=JSON.parse(readFileSync(join(folder,'manifest.json'))),baseArchive=join(app,'releases/dashboard-capture-2026-11-14/fallback.tar.gz');
 if(sha(readFileSync(baseArchive))!==manifest.baseArchiveSha256||manifest.worker!=='sach-sports-cloudflare-test')throw Error('diagnostic_base_mismatch');
 const patch=join(folder,manifest.patch.file);if(sha(readFileSync(patch))!==manifest.patch.sha256)throw Error('diagnostic_patch_checksum_mismatch');
 const names=execFileSync('tar',['-tzf',patch],{encoding:'utf8'}).trim().split('\n').sort();if(JSON.stringify(names)!==JSON.stringify(['bundle/namespace-fallback.js','bundle/nba-odds-diagnostic.js']))throw Error('diagnostic_patch_paths_rejected');
 baseline(output);const base=join(output,'workers/default');for(const c of manifest.changed)if(c.beforeSha256&&sha(readFileSync(join(base,c.path)))!==c.beforeSha256)throw Error('diagnostic_prior_module_mismatch');
 execFileSync('tar',['-xzf',patch,'-C',base]);const checked=inspect(output);if(checked.digest!==manifest.artifactSha256)throw Error('diagnostic_frozen_digest_mismatch');return manifest;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [mode,output,...rest]=process.argv.slice(2);if(rest.length||!output||!['--prepare','--prepare-frozen'].includes(mode))throw Error('Offline only: --prepare OUTPUT or --prepare-frozen NEW_OUTPUT; no deploy mode');
 console.log(JSON.stringify(mode==='--prepare'?await prepareNbaDiagnostic(output):prepareFrozenNbaDiagnostic(output)));
}
