import {retentionCutoff} from '../scripts/retention-policy.mjs';
import {visitCloudArchive,visitCloudSegments} from '@/lib/drive-history-reader';
import {gzipSync,gunzipSync} from 'node:zlib';
import {promises as fs,createReadStream} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {withHistoryLock} from '@/lib/history-lock';
const ROOT=process.env.SACH_HISTORY_DIR||'/data/sach-history';
const safe=(v:string)=>String(v||'').replace(/[^a-z0-9_-]/gi,'_');
export function torontoHistoryDay(v:Date|string=new Date()){
 const d=typeof v==='string'?new Date(v):v;if(Number.isNaN(d.getTime()))return '';
 const p=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
 const g=(t:string)=>p.find(x=>x.type===t)?.value||'';return `${g('year')}-${g('month')}-${g('day')}`;
}
type Snapshot={capturedAt:string;hash:string;payload:any};
const archive=(sport:string)=>path.join(ROOT,safe(sport),'archive');
const stem=(stream:string,day:string)=>`${safe(stream)}_${safe(day)}`;
/** Stream legacy arrays one snapshot at a time; escaped braces/UTF-8 are handled by the decoder. */
export async function visitLegacySnapshots(file:string|AsyncIterable<string>,visit:(snapshot:Snapshot)=>void){
 let text='',depth=0,inString=false,escaped=false,started=false;
 try{
  for await(const chunk of (typeof file==='string'?createReadStream(file,{encoding:'utf8',highWaterMark:64*1024}):file))for(const char of chunk as string){
   if(!started){if(char!=='{')continue;started=true;depth=1;text='{';continue;}
   text+=char;
   if(inString){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char==='"')inString=false;}
   else if(char==='"')inString=true;else if(char==='{')depth++;else if(char==='}')depth--;
   if(depth===0){visit(JSON.parse(text));text='';started=false;}
   if(text.length>32*1024*1024)throw new Error('Archive snapshot exceeds safe read size');
  }
  if(started)throw new Error('Incomplete archive snapshot');
 }catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
}
export async function visitHistorySnapshots(sport:string,stream:string,day:string,visit:(snapshot:Snapshot)=>void){
 const legacy=path.join(archive(sport),stem(stream,day)+'.json');
 if(await fs.stat(legacy).then(()=>true).catch(e=>{if(e.code==='ENOENT')return false;throw e;}))await visitLegacySnapshots(legacy,visit);
 else await visitCloudArchive(`sach-history/${safe(sport)}/archive/${stem(stream,day)}.json`,source=>visitLegacySnapshots(source,visit));
 const dir=path.join(archive(sport),'segments',stem(stream,day));
 let names:string[]=[];try{names=await fs.readdir(dir);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 if(!names.length&&day<retentionCutoff())await visitCloudSegments(`sach-history/${safe(sport)}/archive/segments/${stem(stream,day)}`,source=>visitLegacySnapshots(source,visit));
 for(const name of names.filter(n=>n.endsWith('.json')||n.endsWith('.json.gz')).sort()){const raw=await fs.readFile(path.join(dir,name));visit(JSON.parse(name.endsWith('.gz')?gunzipSync(raw).toString('utf8'):raw.toString('utf8')));}
}
export async function readHistorySnapshots(sport:string,stream:string,day:string):Promise<Snapshot[]>{
 const rows:Snapshot[]=[];await visitHistorySnapshots(sport,stream,day,row=>rows.push(row));return rows;
}
const latestHashes=new Map<string,string>();
export async function appendHistorySnapshot(sport:string,stream:string,payload:any,day=torontoHistoryDay()){
 const id=`${sport}|${stream}|${day}`;
 return withHistoryLock('archive-write|'+id,async()=>{
  const raw=JSON.stringify(payload??null),hash=createHash('sha1').update(raw).digest('hex');
  if(latestHashes.get(id)===hash)return {ok:true,written:false,count:0};
  // Each snapshot is immutable. Never rewrite, trim or delete an older archive to append data.
  const dir=path.join(archive(sport),'segments',stem(stream,day));await fs.mkdir(dir,{recursive:true});
  const file=path.join(dir,`${Date.now()}-${randomUUID()}.json.gz`),temp=file+'.tmp';
  await fs.writeFile(temp,gzipSync(JSON.stringify({capturedAt:new Date().toISOString(),hash,payload}))); await fs.rename(temp,file);
  if(latestHashes.size>2048)latestHashes.delete(latestHashes.keys().next().value!);latestHashes.set(id,hash);
  return {ok:true,written:true,file,count:1};
 });
}
export async function historyArchiveStatus(){try{await fs.mkdir(ROOT,{recursive:true});await fs.access(ROOT,fs.constants.W_OK);return{ok:true,root:ROOT}}catch(e){return{ok:false,root:ROOT,error:e instanceof Error?e.message:String(e)}}}
