/** Offline inventory only: no network, credentials, import, deployment or model fitting. */
import {readFile,readdir,mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import {gunzipSync,gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {join,resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {rolldown} from 'rolldown';
const app=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const hash=b=>createHash('sha256').update(b).digest('hex');
export async function bootstrapModules(dir){
 const entry=join(dir,'bootstrap-entry.mjs');
 await writeFile(entry,`export * from ${JSON.stringify(join(app,'scripts/nba-bootstrap-plan.ts'))};export {nbaEvidenceStore} from ${JSON.stringify(join(app,'jobs/nba-evidence-store.mjs'))};export {basketballFeatureIndex} from ${JSON.stringify(join(app,'lib/basketball-model-inputs.ts'))};export {nbaCombinationHistory} from ${JSON.stringify(join(app,'lib/nba-combination-history.ts'))};`);
 const b=await rolldown({input:entry,platform:'node',external:[/^node:/],plugins:[{name:'existing-app-aliases',resolveId(id){if(id.startsWith('@/'))return join(app,id.slice(2)+'.ts');}}]});
 const module=join(dir,'bootstrap-functions.mjs');await b.write({file:module,format:'esm'});await b.close();return import(pathToFileURL(module).href);
}
export async function loadRetainedNba(dir){
 const records=[],archives=[],excluded=[];
 const addArchive=async path=>{const bytes=await readFile(path),archive=path.slice(app.length+1);const meta={archive,sha256:hash(bytes),bytes:bytes.length};
  let receipt;try{receipt=JSON.parse(await readFile(join(dirname(path),'receipt.json')));}catch{}
  const expected=receipt?.files?.[path.split('/').at(-1)];if(expected&&expected!==meta.sha256)throw Error('retained_parent_receipt_checksum_mismatch');
  meta.parentReceiptVerified=Boolean(expected);archives.push(meta);return {meta,data:JSON.parse(gunzipSync(bytes))};};
 const tar=resolve(app,'../docs/audits/2026-11-17-r1-durable-release/current-inputs.tar.gz'),bytes=await readFile(tar);
 const evidenceIndex=JSON.parse(await readFile(resolve(dirname(tar),'evidence-files.json')));
 const expected=evidenceIndex.files.find(f=>(f.path||f.file)==='current-inputs.tar.gz').sha256;if(hash(bytes)!==expected)throw Error('retained_archive_checksum_mismatch');
 const archive='../docs/audits/2026-11-17-r1-durable-release/current-inputs.tar.gz',archiveSha256=hash(bytes);
 const names=execFileSync('tar',['-tzf',tar],{encoding:'utf8'}).trim().split('\n');if(names.some(n=>n.startsWith('/')||n.split('/').includes('..')))throw Error('unsafe_retained_archive');
 execFileSync('tar',['-xzf',tar,'-C',dir]);
 const manifest=JSON.parse(await readFile(join(dir,'current-history-manifest.json')));
 for(const r of manifest.receipts){const raw=await readFile(join(dir,'sources',r.file));if(r.status!==200||hash(raw)!==r.sha256)throw Error('retained_http_checksum_mismatch');const payload=JSON.parse(raw);records.push({archive,archiveSha256,source:r.source,payload,observedAt:r.observedAt,payloadSha256:hash(JSON.stringify(payload))});}
 archives.push({archive,sha256:archiveSha256,bytes:bytes.length,records:manifest.receipts.length});
 const old=await addArchive(join(app,'tests/fixtures/nba-official-censuses-2026-11-15.json.gz'));
 for(const r of old.data.accepted)records.push({archive:old.meta.archive,archiveSha256:old.meta.sha256,source:r.source,payload:r.payload,observedAt:null,payloadSha256:r.sha256});
 excluded.push({archive:old.meta.archive,reason:'previously_rejected_census',records:old.data.rejected});
 async function walk(path){for(const e of await readdir(path,{withFileTypes:true})){const full=join(path,e.name);if(e.isDirectory())await walk(full);else if(full.includes('nba')&&/^(official-responses|official-results|official-fixtures)\.json\.gz$/.test(e.name)){
  const {data,meta}=await addArchive(full);if(!Array.isArray(data))throw Error('retained_source_array_required');meta.records=data.length;
  for(const r of data){const payload=r.payload||r.data;if(!payload){excluded.push({archive:meta.archive,reason:'no_source_body',source:r.url||null});continue;}records.push({archive:meta.archive,archiveSha256:meta.sha256,source:r.url,payload,observedAt:r.retrievedAt||null,payloadSha256:r.sha256});}
 }}}
 await walk(join(app,'model-research'));
 const context=await addArchive(join(app,'model-research/2026-10-19/nba-context-population/source-manifest.json.gz'));
 excluded.push({archive:context.meta.archive,reason:'metadata_and_derived_observations_are_not_complete_raw_sources',fixtures:context.data.fixtures,observations:context.data.observations});
 const schedule=await addArchive(join(app,'tests/fixtures/nba-summary-scoreboards-2026-11-15.json.gz'));
 excluded.push({archive:schedule.meta.archive,reason:'ancillary_schedule_only_not_player_discovery_or_complete_census',responses:Object.keys(schedule.data.data).length,originalReceiptTimesKnown:false});
 const boards={};for(const market of ['points','rebounds','assists','threes_made','pts_rebs_asts','pts_rebs','pts_asts'])boards[market]=JSON.parse(await readFile(join(dir,'nba-'+market+'.json')));
 return {records,archives,excluded,boards,snapshotAt:manifest.finishedAt};
}
export function historicalCohortCoverage(module,observations,boards,snapshotAt){
 const now=Date.parse(snapshotAt),out=[];
 for(const [market,board] of Object.entries(boards)){
  const history=market.startsWith('pts_')?module.nbaCombinationHistory(observations,market):observations;
  const index=module.basketballFeatureIndex(history),reasons={};let supported=0;
  for(const row of board.rows){const c=row.pregameContext;if(!c||!['home','away'].includes(c.homeAway)){reasons.missing_target_context=(reasons.missing_target_context||0)+1;continue;}
   const target={sport:'nba',market,season:String(c.season),playerId:String(row.playerId),teamId:String(row.teamId),opponentId:String(c.opponentId),gameTime:row.gameTime,basketballContext:{home:c.homeAway==='home'}};
   const result=index(target,new Date(now).toISOString());if(result.features)supported++;else reasons[result.reason]=(reasons[result.reason]||0)+1;
  }
  out.push({market,capturedRows:board.rows.length,historicalInputsSupported:supported,reasons});
 }
 return {scope:'historical feature coverage of captured public25/player-market cohort at original snapshot clock; not present-day eligible universe, odds or forecasts',snapshotAt,markets:out};
}
async function main(){
 if(process.argv.length!==4||process.argv[2]!=='--inventory')throw Error('Offline only: --inventory NEW_OUTPUT_DIRECTORY; no production/import/deploy mode.');
 const output=resolve(process.argv[3]);await mkdir(output,{recursive:false});const temp=await mkdtemp(join(tmpdir(),'nba-bootstrap-plan-'));
 try{const module=await bootstrapModules(temp),input=await loadRetainedNba(temp),now=Date.now(),result=module.inspectRetainedNbaSources(input.records,now);
  const coverage=historicalCohortCoverage(module,result.observations,input.boards,input.snapshotAt),snapshot=Date.parse(input.snapshotAt);
  const window=result.observations.filter(r=>Date.parse(r.gameTime)>snapshot-21*86400000&&Date.parse(r.gameTime)<snapshot-48*3600000);
  coverage.readerWindowFinals=new Set(window.map(r=>r.gameId)).size;coverage.olderArchiveFinalsOutsideReaderWindow=result.plan.entries.length-coverage.readerWindowFinals;
  coverage.readerWindowOnly=historicalCohortCoverage(module,window,input.boards,input.snapshotAt).markets;
  const planBytes=gzipSync(JSON.stringify(result.plan),{level:9});
  const encoded=result.plan.entries.map(e=>Buffer.byteLength(gzipSync(JSON.stringify(e.evidence)).toString('base64')));
  const report={asOf:new Date(now).toISOString(),summary:result.summary,archives:input.archives,excluded:input.excluded,inventory:result.inventory,coverage,plan:{digest:result.plan.digest,compressedSha256:hash(planBytes),compressedBytes:planBytes.length,decodedBytes:Buffer.byteLength(JSON.stringify(result.plan)),estimatedSqliteEncodedBytes:encoded.reduce((a,b)=>a+b,0),largestEncodedSource:Math.max(...encoded),existingEvidenceCapacityBytes:64*1024*1024},productionImport:false,newDeployment:false};
  await writeFile(join(output,'inventory.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});await writeFile(join(output,'finals-only-plan.json.gz'),planBytes,{flag:'wx'});console.log(JSON.stringify({summary:report.summary,coverage,plan:report.plan}));
 }finally{await rm(temp,{recursive:true,force:true});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
