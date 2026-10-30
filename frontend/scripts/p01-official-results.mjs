// Read-only research evidence. Offline replay requires an intact capture receipt.
import {readFile,writeFile} from 'node:fs/promises';
import {gunzipSync,gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const hash=b=>createHash('sha256').update(b).digest('hex');
export async function researchOfficialResults(directory){
 if(!directory)return null;
 const bytes=await readFile(directory+'/official-results.json.gz');
 const receipt=JSON.parse(await readFile(directory+'/receipt.json','utf8'));
 if(hash(bytes)!==receipt.files?.['official-results.json.gz'])throw Error('Official results archive checksum mismatch');
 const records=JSON.parse(gunzipSync(bytes)),byId=new Map();
 for(const r of records){
  if(byId.has(r.id))throw Error('Ambiguous archived official fixture');
  if(r.data&&(hash(JSON.stringify(r.data))!==r.sha256||String(r.data.header?.id)!==r.id||r.data.header?.competitions?.[0]?.status?.type?.completed!==true))throw Error('Official fixture payload checksum/identity mismatch');
  byId.set(r.id,r);
 }
 return byId;
}
export async function officialResult(id,url,archive){
 if(archive){
  const r=archive.get(id);
  if(!r||r.url!==url)throw Error('Exact archived official response unavailable');
  return r;
 }
 try{
  const r=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('HTTP '+r.status);
  const data=await r.json();
  if(String(data.header?.id)!==id||data.header?.competitions?.[0]?.status?.type?.completed!==true)return {id,url,status:'pending_official_final'};
  return {id,url,retrievedAt:new Date().toISOString(),sha256:hash(JSON.stringify(data)),data};
 }catch(e){return {id,url,error:e.message};}
}

export async function writeResearchReport(directory,report){
 const bytes=gzipSync(JSON.stringify(report.requests)+'\n',{level:9,mtime:0});
 const saved={...report,requests:report.requests.map(({data,...metadata})=>metadata),officialResultsSha256:hash(bytes)};
 const text=JSON.stringify(saved,null,2)+'\n';
 await writeFile(directory+'/official-results.json.gz',bytes);
 await writeFile(directory+'/report.json',text);
 await writeFile(directory+'/receipt.json',JSON.stringify({cohortSha256:report.cohortSha256,files:{'official-results.json.gz':hash(bytes),'report.json':hash(text)}},null,2)+'\n');
}

export async function readResearchCohort(directory){
 try{return await readFile(directory+'/cohort.json');}catch(e){if(e.code!=='ENOENT')throw e;}
 return gunzipSync(await readFile(directory+'/cohort.json.gz'));
}
