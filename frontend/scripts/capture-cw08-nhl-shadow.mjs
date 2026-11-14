/** Standalone file-fed shadow collector. No dashboard routes, production
 * writes, credentials, provider side effects, scheduler changes or deployment. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {captureNhlShadow,saveShadowReceipt,digest,canonical} from './nhl-shadow-evidence.mjs';
const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('Usage: node scripts/capture-cw08-nhl-shadow.mjs INPUT_BUNDLE OUTPUT_DIRECTORY');
const F=resolve(import.meta.dirname,'..'),repo=resolve(F,'..'),D=resolve(F,'model-research/cw08-nhl-v3');
const frozenCommit='007c02b',modelsBytes=await readFile(D+'/models.json'),protocol=await readFile(D+'/shadow-protocol.json','utf8'),policy=JSON.parse(protocol);
const implementationDigest=digest(await readFile(resolve(F,'lib/nhl-shadow-model.ts'),'utf8'));
const committed=execFileSync('git',['show',`${frozenCommit}:frontend/model-research/cw08-nhl-v3/models.json`],{cwd:repo});
if(!modelsBytes.equals(committed))throw Error('Shadow model differs from frozen commit');
const at=execFileSync('git',['show','-s','--format=%cI',frozenCommit],{cwd:repo,encoding:'utf8'}).trim();
const models=JSON.parse(modelsBytes),runtime=JSON.parse(gunzipSync(await readFile(resolve(F,'model-runtime/snapshot.json.gz'))));
const bundle=JSON.parse(await readFile(input,'utf8'));if(!Array.isArray(bundle.entries))throw Error('Input must contain entries; each needs target, quote, history, officialFixture, sourceFetchedAt');
await mkdir(output,{recursive:true});const study={kind:'cw08_nhl_shadow_study',modelCommit:frozenCommit,modelsDigest:digest(models),protocolSha256:digest(protocol),production:false};
try{await writeFile(resolve(output,'study.json'),canonical(study)+'\n',{flag:'wx',mode:0o444});}catch(e){if(e.code!=='EEXIST')throw e;if(canonical(JSON.parse(await readFile(resolve(output,'study.json'),'utf8')))!==canonical(study))throw Error('Existing study has different frozen artifacts');}
const rejected=[],accepted=[];
for(const entry of bundle.entries){
 try{
  const model=models[entry.target?.market],baselineModel=runtime.models.find(m=>m.group==='nhl|'+entry.target?.market);
  if(!model||!baselineModel)throw Error('Unsupported NHL market');
  const kickoff=Date.parse(entry.target?.gameTime);if(kickoff<Date.parse(policy.gameTimeFrom)||kickoff>=Date.parse(policy.gameTimeBefore))throw Error('Outside frozen prospective enrollment window');
  const receipt=captureNhlShadow({...entry,model,baselineModel,modelFreeze:{commit:frozenCommit,at,modelDigest:digest(model),implementationDigest},protocolSha256:study.protocolSha256});
  accepted.push({sha256:receipt.sha256,path:await saveShadowReceipt(resolve(output,'receipts'),receipt)});
 }catch(error){rejected.push({market:entry.target?.market,gameId:entry.target?.gameId,playerId:entry.target?.playerId,reason:error.message});}
}
const attempt={kind:'cw08_nhl_shadow_capture_attempt',createdAt:new Date().toISOString(),bundleSha256:digest(bundle),accepted,rejected,production:false};
await mkdir(resolve(output,'attempts'),{recursive:true});await writeFile(resolve(output,'attempts',digest(attempt)+'.json'),canonical(attempt)+'\n',{flag:'wx',mode:0o444});
console.log(JSON.stringify({accepted:accepted.length,rejected:rejected.length,production:false}));if(!accepted.length)process.exitCode=2;
