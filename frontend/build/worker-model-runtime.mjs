import {readFileSync} from 'node:fs';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const hash=value=>createHash('sha256').update(value).digest('hex');
export function partitionModelRuntime(root){
 const manifest=JSON.parse(readFileSync(resolve(root,'manifest.json'),'utf8'));
 const compressed=readFileSync(resolve(root,'snapshot.json.gz'));
 if(hash(compressed)!==manifest.sha256)throw Error('Forecast snapshot checksum mismatch');
 const data=JSON.parse(gunzipSync(compressed));
 if(data.version!==1||!Array.isArray(data.models)||!Array.isArray(data.observations))throw Error('Invalid forecast snapshot');
 const gi=JSON.parse(readFileSync(resolve(root,'gi-calibration.json'),'utf8'));
 const giStatus=JSON.parse(readFileSync(resolve(root,'gi-status.json'),'utf8'));
 const partitions={};
 for(const sport of ['nba','cbb','nfl','nhl']){
  const markets=[...new Set(data.models.filter(m=>m.group.startsWith(sport+'|')).map(m=>m.group.split('|')[1]))];
  const combinations={pts_rebs_asts:['points','rebounds','assists'],pts_rebs:['points','rebounds'],pts_asts:['points','assists'],rebs_asts:['rebounds','assists']};
  for(const market of markets){
   const groups=new Set((combinations[market]||[market]).map(m=>sport+'|'+m));
   const value={models:data.models.filter(m=>groups.has(m.group)),observations:data.observations.filter(g=>g.sport===sport&&groups.has(sport+'|'+g.market)),digest:manifest.sha256,asOf:manifest.asOf,gi,giStatus};
   const bytes=gzipSync(JSON.stringify(value));
   partitions[sport+'|'+market]={bytes:bytes.toString('base64'),sha256:hash(bytes)};
  }
 }
 const quarterManifest=JSON.parse(readFileSync(resolve(root,'quarter-manifest.json'),'utf8'));
 const quarterBytes=readFileSync(resolve(root,'quarter-snapshot.json.gz'));
 if(hash(quarterBytes)!==quarterManifest.sha256)throw Error('Quarter snapshot checksum mismatch');
 const quarter=JSON.parse(gunzipSync(quarterBytes));
 const calibration=JSON.parse(readFileSync(resolve(root,'nba-quarter-calibration.json'),'utf8'));
 if(calibration.sourceSha256!==quarterManifest.sha256)throw Error('NBA quarter calibration source mismatch');
 if(quarter.version!==2||!Array.isArray(quarter.rows)||!Array.isArray(quarter.models))throw Error('Invalid quarter snapshot');
 for(const model of quarter.models){
  const market=quarter.markets.findIndex(([sport,key])=>model.group===sport+'|'+key);
  if(market<0)throw Error('Quarter model is missing its market');
  const value={models:[{...model,residuals:calibration.residuals[model.group]||model.residuals}],rows:quarter.rows.filter(row=>row[2]===market),markets:quarter.markets,fixtures:quarter.fixtures,players:quarter.players,digest:quarterManifest.sha256,asOf:quarterManifest.asOf};
  const bytes=gzipSync(JSON.stringify(value));
  partitions[model.group]={bytes:bytes.toString('base64'),sha256:hash(bytes)};
 }
 return partitions;
}
export function workerModelRuntimePlugin(){return {
 name:'sach-worker-model-runtime',enforce:'pre',
 transform(_source,id){
  if(!id.replaceAll('\\','/').endsWith('/lib/worker-model-runtime.ts'))return;
  const root=resolve(import.meta.dirname,'../model-runtime');
  const partitions=partitionModelRuntime(root);
  const combinations=JSON.parse(readFileSync(resolve(root,'nba-combination-models.json'),'utf8'));
  const manifest=JSON.parse(readFileSync(resolve(root,'manifest.json'),'utf8'));
  if(combinations.sourceSha256!==manifest.sha256)throw Error('NBA combination model source mismatch');
  // Keep compressed strings in the module; retain at most one decoded market.
  return `import {gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';import {Buffer} from 'node:buffer';
const partitions=${JSON.stringify(partitions)};const combinationModels=${JSON.stringify(combinations.models)};const combinations={pts_rebs_asts:['points','rebounds','assists'],pts_rebs:['points','rebounds'],pts_asts:['points','assists'],rebs_asts:['rebounds','assists']};
let cachedKey=null,cachedValue=null;
export function workerModelRuntime(sport,market){const key=sport+'|'+market;if(key===cachedKey)return cachedValue;const part=partitions[key];if(!part){const parts=combinations[market]?.map(key=>workerModelRuntime(sport,key));if(!parts||parts.some(p=>!p))return null;return {...parts[0],models:[...parts.flatMap(p=>p.models),...combinationModels.filter(model=>model.group===key)],observations:parts.flatMap(p=>p.observations)};}const bytes=Buffer.from(part.bytes,'base64');if(createHash('sha256').update(bytes).digest('hex')!==part.sha256)throw Error('Worker model partition checksum mismatch');const decoded=gunzipSync(bytes);const value=JSON.parse(decoded.toString());cachedKey=null;cachedValue=null;if(decoded.byteLength<=8*1024*1024){cachedKey=key;cachedValue=value;}return value;}`;
 }
}}
