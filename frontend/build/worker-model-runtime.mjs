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
 return partitions;
}
export function workerModelRuntimePlugin(){return {
 name:'sach-worker-model-runtime',enforce:'pre',
 transform(_source,id){
  if(!id.replaceAll('\\','/').endsWith('/lib/worker-model-runtime.ts'))return;
  const partitions=partitionModelRuntime(resolve(import.meta.dirname,'../model-runtime'));
  // Keep compressed strings in the module; retain at most one decoded market.
  return `import {gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';import {Buffer} from 'node:buffer';
const partitions=${JSON.stringify(partitions)};const combinations={pts_rebs_asts:['points','rebounds','assists'],pts_rebs:['points','rebounds'],pts_asts:['points','assists'],rebs_asts:['rebounds','assists']};
let cachedKey=null,cachedValue=null;
export function workerModelRuntime(sport,market){const key=sport+'|'+market;if(key===cachedKey)return cachedValue;const part=partitions[key];if(!part){const parts=combinations[market]?.map(key=>workerModelRuntime(sport,key));if(!parts||parts.some(p=>!p))return null;return {...parts[0],models:parts.flatMap(p=>p.models),observations:parts.flatMap(p=>p.observations)};}const bytes=Buffer.from(part.bytes,'base64');if(createHash('sha256').update(bytes).digest('hex')!==part.sha256)throw Error('Worker model partition checksum mismatch');const decoded=gunzipSync(bytes);const value=JSON.parse(decoded.toString());cachedKey=null;cachedValue=null;if(decoded.byteLength<=8*1024*1024){cachedKey=key;cachedValue=value;}return value;}`;
 }
}}
