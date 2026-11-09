import {createHash} from 'node:crypto';
import {driveAuth} from './drive-auth.mjs';
import {checksum} from './history-cloud.mjs';
import {gzipSync,gunzipSync} from 'node:zlib';
import {StringDecoder} from 'node:string_decoder';
import {visitJsonObjects} from './stream-history-json.mjs';

const FOLDER='application/vnd.google-apps.folder';
const escape=value=>String(value).replaceAll('\\','\\\\').replaceAll("'","\\'");
export function drivePerformanceConfigured(){return ['BACKUP_DRIVE_FOLDER_ID','GOOGLE_OAUTH_CLIENT_ID','GOOGLE_OAUTH_CLIENT_SECRET','GOOGLE_OAUTH_REFRESH_TOKEN'].every(key=>Boolean(process.env[key]));}

/** Read backed-up daily documents, never restore files to the Railway volume.
 * Folder discovery is independent of the Supabase archive catalog. */
export function createDrivePerformanceReader({request,makeRequest,folderId,now=Date.now,budgetMs=45000,projectSnapshot=()=>[],schedule,parallelReads=false}){
 const inventories=new Map(),pending=new Map(),results=new Map(),documents=new Map();
 const scheduled=new Set();
 let cacheBytes=0;
 const unpack=value=>({errors:value.errors,rows:value.rows.map(row=>({stream:row.stream,game_date:row.game_date,checksum:row.checksum,payload:JSON.parse(gunzipSync(row.zip).toString('utf8'))}))});
 function transport(request){
  let active=0;const waiting=[];
  async function slot(work){if(active>=2)await new Promise(resolve=>waiting.push(resolve));else active++;try{return await work();}finally{const next=waiting.shift();if(next)next();else active--;}}
  return {request,slot};
 }
 const shared=makeRequest?null:transport(request);
 async function list(parent,send){
  const files=[];let pageToken;
  do{const url=new URL('https://www.googleapis.com/drive/v3/files');url.searchParams.set('q',`'${escape(parent)}' in parents and trashed = false`);url.searchParams.set('fields','nextPageToken,files(id,name,mimeType,size,md5Checksum,modifiedTime)');url.searchParams.set('pageSize','1000');if(pageToken)url.searchParams.set('pageToken',pageToken);
   const response=await send.slot(()=>send.request(url,{signal:AbortSignal.timeout(12000)}));if(!response.ok)throw Error('Drive inventory HTTP '+response.status);const page=await response.json();if(!Array.isArray(page.files))throw Error('Invalid Drive inventory');files.push(...page.files);pageToken=page.nextPageToken;
  }while(pageToken);return files;
 }
 const directory=(files,name)=>files.filter(f=>f.mimeType===FOLDER&&f.name===name).sort((a,b)=>String(b.modifiedTime).localeCompare(String(a.modifiedTime)))[0];
 async function inventory(sport,send){
  const old=inventories.get(sport);if(old&&now()-old.at<300000)return old.files;
  const backups=(await list(folderId,send)).filter(f=>f.mimeType===FOLDER&&f.name.startsWith('railway-')).sort((a,b)=>b.name.localeCompare(a.name));if(!backups.length)throw Error('Verified backup folder is unavailable');
  const history=directory(await list(backups[0].id,send),'sach-history');if(!history)throw Error('History backup folder is unavailable');
  const sportFolder=directory(await list(history.id,send),sport);if(!sportFolder)throw Error('Sport backup folder is unavailable');
  let files=await list(sportFolder.id,send);
  if(sport==='mlb'){const performance=directory(files,'performance');if(performance)files=[...files,...await list(performance.id,send)];}
  // Backup uploads retain versions. Use the newest copy of each exact daily
  // path; the performance reconciler selects original calls from its contents.
  const latest=new Map();
  for(const file of files){
   const match=file.name.match(/^(.*?)(?:_)?(\d{4}-\d{2}-\d{2})\.json$/);if(file.mimeType===FOLDER||!match)continue;
   const stream=match[1]||'performance';if(/^(performance_view_|player_history_|featured_selections|featured_results|capture_manifest)/.test(stream)||/^protected_/.test(stream)&&!/^protected_(pregame_|final_)/.test(stream))continue;
   const key=stream+'|'+match[2],previous=latest.get(key);if(!previous||String(file.modifiedTime)>String(previous.modifiedTime))latest.set(key,{...file,stream,game_date:match[2]});
  }
  const value=[...latest.values()].sort((a,b)=>a.game_date.localeCompare(b.game_date)||a.stream.localeCompare(b.stream));inventories.set(sport,{at:now(),files:value});return value;
 }
 async function load(sport,firstDay,lastDay,key){
  const started=now();let files;
  const send=shared??transport(makeRequest());
  try{files=(await inventory(sport,send)).filter(f=>(!firstDay||f.game_date>=firstDay)&&(!lastDay||f.game_date<=lastDay));}catch{return {rows:results.get(key)?.value.rows||[],errors:['unavailable']};}
  const outcomes=new Array(files.length);
  let next=0;
  const collect=async()=>{while(next<files.length){
   const index=next++,file=files[index];
   const key=sport+'|'+file.stream+'|'+file.game_date,cached=documents.get(key);
   if(cached&&cached.md5===file.md5Checksum){outcomes[index]={row:cached};continue;}
   if(now()-started>=budgetMs){outcomes[index]={error:file.stream+'|'+file.game_date+':checking'};continue;}
   try{
    const streaming=file.stream.startsWith('snapshots_')||Number(file.size)>16*1024*1024;
    if(!/^[a-f0-9]{32}$/i.test(file.md5Checksum||'')||!Number.isFinite(Number(file.size))||Number(file.size)>4*1024*1024*1024)throw Error('Unverified or oversized backup document');
    const row=await send.slot(async()=>{
    const response=await send.request('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(file.id)+'?alt=media',{signal:AbortSignal.timeout(streaming?120000:12000)});if(!response.ok||!response.body)throw Error('Backup read failed');
    let payload,bytes,size=0,stream=file.stream;const hash=createHash('md5');
    if(streaming){
     const decoder=new StringDecoder('utf8'),staged=new Map();let stagedBytes=0;
     async function* chunks(){for await(const raw of response.body){const chunk=Buffer.from(raw);size+=chunk.length;hash.update(chunk);yield decoder.write(chunk);}const tail=decoder.end();if(tail)yield tail;}
     await visitJsonObjects(chunks(),snapshot=>{for(const record of projectSnapshot(sport,file.stream,file.game_date,snapshot)){
      const identity=JSON.stringify([record.key,record.gameId,record.playerId,record.market,record.gameTime,record.savedAt,record.sportsbookLine,record.pickSide,record.archiveFinal?.gameId,record.archiveFinal?.observedAt,record.archiveFinal?.boxscore?.updatedAt]),recordBytes=Buffer.byteLength(JSON.stringify(record));
      stagedBytes+=recordBytes-(staged.get(identity)?.bytes||0);if(stagedBytes>32*1024*1024)throw Error('Archive record byte capacity exceeded');staged.set(identity,{record,bytes:recordBytes});
      if(staged.size>200000)throw Error('Archive record capacity exceeded');
     }});
     payload=[...staged.values()].map(value=>value.record);bytes=Buffer.from(JSON.stringify(payload));stream='archive_records_'+file.stream;
    }else{const chunks=[];for await(const raw of response.body){const chunk=Buffer.from(raw);size+=chunk.length;if(size>16*1024*1024)throw Error('Backup document exceeds limit');hash.update(chunk);chunks.push(chunk);}bytes=Buffer.concat(chunks);payload=JSON.parse(bytes.toString('utf8'));}
    // Staged records are accepted only after the entire original file verifies.
    if(size!==Number(file.size)||hash.digest('hex')!==file.md5Checksum.toLowerCase())throw Error('Backup checksum mismatch');
    const zip=gzipSync(bytes);return {stream,game_date:file.game_date,md5:file.md5Checksum,checksum:checksum(payload),zip};
    });
    const replacedBytes=documents.get(key)?.zip.length||0;
    if(cacheBytes-replacedBytes+row.zip.length>64*1024*1024)throw Error('Backup reader cache capacity exceeded');
    cacheBytes+=row.zip.length-replacedBytes;documents.set(key,row);outcomes[index]={row};
   }catch{outcomes[index]={error:file.stream+'|'+file.game_date+':unavailable'};}
   await new Promise(resolve=>setImmediate(resolve));
  }};
  await Promise.all(parallelReads?[collect(),collect()]:[collect()]);
  return {rows:outcomes.flatMap(x=>x.row?[x.row]:[]),errors:outcomes.flatMap(x=>x.error?[x.error]:[])};
 }
 const read=async(sport,firstDay,lastDay)=>{
  if(!['nfl','cfb','nba','nhl','cbb','soccer','wnba','mlb'].includes(sport)||[firstDay,lastDay].some(day=>day&&!/^\d{4}-\d{2}-\d{2}$/.test(day))||lastDay&&(!firstDay||lastDay<firstDay))throw Error('Invalid backup history scope');
  const key=[sport,firstDay||'all',lastDay||'all'].join('|'),cached=results.get(key);if(cached&&now()-cached.at<(cached.value.errors.some(e=>e.endsWith(':checking'))?5000:60000))return unpack(cached.value);
  if(makeRequest){
   const value=await load(sport,firstDay,lastDay,key);
   if(!results.has(key)&&results.size>=64)results.delete(results.keys().next().value);
   results.set(key,{at:now(),value});return unpack(value);
  }
  let work=pending.get(key);if(!work){work=load(sport,firstDay,lastDay,key).then(value=>{
   results.set(key,{at:now(),value});
   // Continue bounded work on the persistent server without requiring a browser
   // poll. Transport/integrity failures alone never enter this fast retry loop.
   if(schedule&&value.errors.some(error=>error.endsWith(':checking'))&&!scheduled.has(key)){
    scheduled.add(key);schedule(()=>{scheduled.delete(key);return read(sport,firstDay,lastDay).catch(()=>{});});
   }
   return value;
  }).finally(()=>pending.delete(key));pending.set(key,work);}return unpack(await work);
 };
 return read;
}
let reader;
export async function listDrivePerformanceDocuments(sport,firstDay,projectSnapshot,lastDay){
 if(!drivePerformanceConfigured())return {rows:[],errors:['unavailable']};
 if(!reader){
  const makeRequest=()=>driveAuth({clientId:process.env.GOOGLE_OAUTH_CLIENT_ID,clientSecret:process.env.GOOGLE_OAUTH_CLIENT_SECRET,refreshToken:process.env.GOOGLE_OAUTH_REFRESH_TOKEN,fetchImpl:(url,options)=>fetch(url,{...options,signal:options?.signal??AbortSignal.timeout(12000)})}).request;
  const worker=globalThis.navigator?.userAgent==='Cloudflare-Workers';
  // Workers can share verified bytes, but fetches and their queues belong to
  // the request that created them, including the OAuth refresh promise.
  reader=createDrivePerformanceReader({folderId:process.env.BACKUP_DRIVE_FOLDER_ID,projectSnapshot,parallelReads:worker,...(worker?{makeRequest}:{request:makeRequest(),schedule:work=>{const timer=setTimeout(work,5000);timer.unref();}})});
 }
 return reader(sport,firstDay,lastDay);
}
