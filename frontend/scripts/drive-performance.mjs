import {createHash} from 'node:crypto';
import {driveAuth} from './drive-auth.mjs';
import {checksum} from './history-cloud.mjs';
import {gzipSync,gunzipSync} from 'node:zlib';

const FOLDER='application/vnd.google-apps.folder';
const escape=value=>String(value).replaceAll('\\','\\\\').replaceAll("'","\\'");
export function drivePerformanceConfigured(){return ['BACKUP_DRIVE_FOLDER_ID','GOOGLE_OAUTH_CLIENT_ID','GOOGLE_OAUTH_CLIENT_SECRET','GOOGLE_OAUTH_REFRESH_TOKEN'].every(key=>Boolean(process.env[key]));}

/** Read backed-up daily documents, never restore files to the Railway volume.
 * Folder discovery is independent of the Supabase archive catalog. */
export function createDrivePerformanceReader({request,folderId,now=Date.now,budgetMs=45000}){
 const inventories=new Map(),pending=new Map(),results=new Map(),documents=new Map();
 let active=0,cacheBytes=0;const waiting=[];
 const unpack=value=>({errors:value.errors,rows:value.rows.map(row=>({stream:row.stream,game_date:row.game_date,checksum:row.checksum,payload:JSON.parse(gunzipSync(row.zip).toString('utf8'))}))});
 async function slot(work){if(active>=2)await new Promise(resolve=>waiting.push(resolve));else active++;try{return await work();}finally{const next=waiting.shift();if(next)next();else active--;}}
 async function list(parent){
  const files=[];let pageToken;
  do{const url=new URL('https://www.googleapis.com/drive/v3/files');url.searchParams.set('q',`'${escape(parent)}' in parents and trashed = false`);url.searchParams.set('fields','nextPageToken,files(id,name,mimeType,size,md5Checksum,modifiedTime)');url.searchParams.set('pageSize','1000');if(pageToken)url.searchParams.set('pageToken',pageToken);
   const response=await slot(()=>request(url,{signal:AbortSignal.timeout(12000)}));if(!response.ok)throw Error('Drive inventory HTTP '+response.status);const page=await response.json();if(!Array.isArray(page.files))throw Error('Invalid Drive inventory');files.push(...page.files);pageToken=page.nextPageToken;
  }while(pageToken);return files;
 }
 const directory=(files,name)=>files.filter(f=>f.mimeType===FOLDER&&f.name===name).sort((a,b)=>String(b.modifiedTime).localeCompare(String(a.modifiedTime)))[0];
 async function inventory(sport){
  const old=inventories.get(sport);if(old&&now()-old.at<60000)return old.files;
  const backups=(await list(folderId)).filter(f=>f.mimeType===FOLDER&&f.name.startsWith('railway-')).sort((a,b)=>b.name.localeCompare(a.name));if(!backups.length)throw Error('Verified backup folder is unavailable');
  const history=directory(await list(backups[0].id),'sach-history');if(!history)throw Error('History backup folder is unavailable');
  const sportFolder=directory(await list(history.id),sport);if(!sportFolder)throw Error('Sport backup folder is unavailable');
  let files=await list(sportFolder.id);
  if(sport==='mlb'){const performance=directory(files,'performance');if(performance)files=[...files,...await list(performance.id)];}
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
 async function load(sport,firstDay){
  const rows=[],errors=[],started=now();let files;
  try{files=(await inventory(sport)).filter(f=>!firstDay||f.game_date>=firstDay);}catch{return {rows:results.get(sport+'|'+(firstDay||'all'))?.value.rows||[],errors:['unavailable']};}
  for(const file of files){
   const key=sport+'|'+file.stream+'|'+file.game_date,cached=documents.get(key);
   if(cached?.md5===file.md5Checksum){rows.push(cached);continue;}
   if(now()-started>=budgetMs){errors.push(file.stream+'|'+file.game_date+':checking');continue;}
   try{
    if(!/^[a-f0-9]{32}$/i.test(file.md5Checksum||'')||!Number.isFinite(Number(file.size))||Number(file.size)>16*1024*1024)throw Error('Unverified or oversized backup document');
    const response=await slot(()=>request('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(file.id)+'?alt=media',{signal:AbortSignal.timeout(12000)}));if(!response.ok||!response.body)throw Error('Backup read failed');
    const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>16*1024*1024)throw Error('Backup document exceeds limit');chunks.push(Buffer.from(chunk));}
    const bytes=Buffer.concat(chunks);if(bytes.length!==Number(file.size)||createHash('md5').update(bytes).digest('hex')!==file.md5Checksum.toLowerCase())throw Error('Backup checksum mismatch');
    const payload=JSON.parse(bytes.toString('utf8')),zip=gzipSync(bytes),row={stream:file.stream,game_date:file.game_date,md5:file.md5Checksum,checksum:checksum(payload),zip};
    if(cacheBytes-(cached?.zip.length||0)+zip.length>64*1024*1024)throw Error('Backup reader cache capacity exceeded');
    cacheBytes+=zip.length-(cached?.zip.length||0);documents.set(key,row);rows.push(row);
   }catch{errors.push(file.stream+'|'+file.game_date+':unavailable');}
   await new Promise(resolve=>setImmediate(resolve));
  }
  return {rows,errors};
 }
 return async(sport,firstDay)=>{
  if(!['nfl','cfb','nba','nhl','cbb','soccer','wnba','mlb'].includes(sport)||firstDay&&!/^\d{4}-\d{2}-\d{2}$/.test(firstDay))throw Error('Invalid backup history scope');
  const key=sport+'|'+(firstDay||'all'),cached=results.get(key);if(cached&&now()-cached.at<(cached.value.errors.some(e=>e.endsWith(':checking'))?5000:60000))return unpack(cached.value);
  let work=pending.get(key);if(!work){work=load(sport,firstDay).then(value=>{results.set(key,{at:now(),value});return value;}).finally(()=>pending.delete(key));pending.set(key,work);}return unpack(await work);
 };
}
let reader;
export async function listDrivePerformanceDocuments(sport,firstDay){
 if(!drivePerformanceConfigured())return {rows:[],errors:['unavailable']};
 if(!reader){const {request}=driveAuth({clientId:process.env.GOOGLE_OAUTH_CLIENT_ID,clientSecret:process.env.GOOGLE_OAUTH_CLIENT_SECRET,refreshToken:process.env.GOOGLE_OAUTH_REFRESH_TOKEN,fetchImpl:(url,options)=>fetch(url,{...options,signal:options?.signal??AbortSignal.timeout(12000)})});reader=createDrivePerformanceReader({request,folderId:process.env.BACKUP_DRIVE_FOLDER_ID});}
 return reader(sport,firstDay);
}
