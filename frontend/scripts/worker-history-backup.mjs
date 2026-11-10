import {createHash} from 'node:crypto';
import {checksum,cloudRequest} from './history-cloud.mjs';
import {driveAuth} from './drive-auth.mjs';
import {retentionCutoff,SPORTS} from './retention-policy.mjs';

const driveFiles = 'https://www.googleapis.com/drive/v3/files';
const uploadFiles = 'https://www.googleapis.com/upload/drive/v3/files';
const md5 = bytes => createHash('md5').update(bytes).digest('hex');
const batchBytes = 768 * 1024;
const partBytes = 2 * 1024 * 1024;
const pageSize = 200;

export function workerHistoryBackupScope(scheduledTime, recent=false){
 const now = new Date(scheduledTime);
 // The short-interval staging cron ticks on EVEN minutes. Indexing those
 // minutes directly skips every odd-index sport forever; advance one sport per
 // two-minute tick for recent reconciliation, keeping daily archive scope intact.
 const sport = [...SPORTS][(recent?Math.floor(now.getUTCMinutes()/2):now.getUTCMinutes()) % SPORTS.size];
 const oldest = retentionCutoff(now);
 if(!recent)return {sport,day:oldest};
 const yesterday = new Date(oldest+'T00:00:00Z');
 yesterday.setUTCDate(yesterday.getUTCDate()+5);
 return {sport,day:yesterday.toISOString().slice(0,10)};
}

export function driveArchive(env, authenticate){
 const folder = env.BACKUP_DRIVE_FOLDER_ID;
 if(!/^[a-zA-Z0-9_-]+$/.test(folder??''))throw Error('Drive backup folder is unavailable');
 const {request} = authenticate({
  clientId:env.GOOGLE_OAUTH_CLIENT_ID,
  clientSecret:env.GOOGLE_OAUTH_CLIENT_SECRET,
  refreshToken:env.GOOGLE_OAUTH_REFRESH_TOKEN,
  fetchImpl:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(15000)}),
 });
 const drive = async(url,options)=>{
  const response = await request(url,options);
  if(!response.ok)throw Error('Drive backup returned HTTP '+response.status);
  return response;
 };
 async function readVerified({id,md5:digest,bytes}){
  if(typeof id!=='string'||!id||!/^[a-f0-9]{32}$/.test(digest)||!Number.isInteger(bytes)||bytes<1||bytes>partBytes+1024)throw Error('Invalid Drive archive receipt');
  const response=await drive(driveFiles+'/'+encodeURIComponent(id)+'?alt=media');
  const chunks=[];
  let length=0;
  for await(const chunk of response.body){
   length+=chunk.byteLength;
   if(length>bytes)throw Error('Drive backup readback did not match');
   chunks.push(chunk);
  }
  const restored=Buffer.concat(chunks,length);
  if(length!==bytes||md5(restored)!==digest)throw Error('Drive backup readback did not match');
  return restored.toString('utf8');
 }
 async function storeVerified(prefix, body){
  const digest = md5(body);
  const name = prefix+'-'+digest+'.json';
  const query = new URLSearchParams({q:"'"+folder+"' in parents and name = '"+name+"' and trashed = false",fields:'files(id,md5Checksum)',pageSize:'100'});
  const existing = await (await drive(driveFiles+'?'+query)).json();
  let file = existing.files?.find(item=>item.md5Checksum===digest);
  if(!file){
   const boundary = 'sach-backup-'+crypto.randomUUID();
   const meta = JSON.stringify({name,parents:[folder],mimeType:'application/json'});
   const multipart = '--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+meta+'\r\n--'+boundary+'\r\nContent-Type: application/json\r\n\r\n'+body+'\r\n--'+boundary+'--\r\n';
   file = await (await drive(uploadFiles+'?uploadType=multipart&fields=id,md5Checksum',{
    method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body:multipart,
   })).json();
  }
  if(!file.id||file.md5Checksum!==digest)throw Error('Drive backup checksum did not match');
  const receipt={name,id:file.id,md5:digest,bytes:Buffer.byteLength(body)};
  if(await readVerified(receipt)!==body)throw Error('Drive backup readback did not match');
  return receipt;
 }
 return {storeVerified,readVerified};
}

async function restoreVerifiedDay(readVerified,receipt,sport,day,visit){
 const manifest=JSON.parse(await readVerified(receipt));
 if(manifest.version!==1||manifest.sport!==sport||manifest.day!==day||!Array.isArray(manifest.parts))throw Error('Invalid history archive manifest');
 const seen=new Set();
 for(const part of manifest.parts){
  const data=JSON.parse(await readVerified(part));
  if(data.version!==1||data.sport!==sport||data.day!==day||!Array.isArray(data.documents)||data.documents.length!==part.documents)throw Error('History archive part does not match the manifest');
  for(const row of data.documents){
   if(row.game_date!==day||!row.stream||seen.has(row.stream)||checksum(row.payload)!==row.checksum)throw Error('Restored history document did not verify');
   seen.add(row.stream);
   visit(row);
  }
 }
 if(seen.size!==manifest.documents)throw Error('Restored history count did not match the manifest');
 return seen.size;
}

export async function archiveWorkerHistoryDay(env,{sport,day},requestCloud=cloudRequest,authenticate=driveAuth,observe){
 if(!SPORTS.has(sport)||!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error('Invalid backup scope');
 let requests = 0;
 const read = route=>{
  if(++requests>120)throw Error('History backup read budget reached');
  return requestCloud(route,{signal:AbortSignal.timeout(15000)});
 };
 const scope = 'sport=eq.'+sport+'&game_date=eq.'+day;
 const inventory = async()=>{
  const docs = [];
  for(let offset=0;;offset+=pageSize){
   const page = await read('history_documents?select=stream,checksum,source_bytes&'+scope+'&order=stream.asc&limit='+pageSize+'&offset='+offset);
   docs.push(...page);
   if(page.length<pageSize)break;
  }
  if(new Set(docs.map(doc=>doc.stream)).size!==docs.length)throw Error('Duplicate stream in backup inventory');
  return docs;
 };
 const docs = await inventory();
 if(!docs.length)return {sport,day,documents:0,parts:0,bytes:0};
 const {storeVerified,readVerified} = driveArchive(env,authenticate);
 const prefix = 'cloudflare-staging-history-v1-'+sport+'-'+day;
 const manifest = [];
 let part = [], bytes = 0;
 let completed = 0;
 const flush = async()=>{
  if(!part.length)return;
  const body = JSON.stringify({version:1,sport,day,documents:part});
  const receipt = await storeVerified(prefix+'-part-'+(manifest.length+1),body);
  manifest.push({...receipt,documents:part.length});
  completed+=part.length;
  part=[];
  bytes=0;
 };
 for(let i=0;i<docs.length;){
  const batch = [];
  let expectedBytes = 0;
  while(i<docs.length&&batch.length<24){
   const doc = docs[i], size = Number(doc.source_bytes);
   if(!/^[a-z0-9_-]+$/i.test(doc.stream)||!Number.isFinite(size)||size<1||size>partBytes)throw Error('History document cannot be backed up within budget');
   if(batch.length&&expectedBytes+size>batchBytes)break;
   batch.push(doc);
   expectedBytes+=size;
   i++;
  }
  const rows = await read('history_documents?select=stream,game_date,checksum,payload&'+scope+'&stream=in.('+batch.map(doc=>doc.stream).join(',')+')');
  const byStream = new Map(rows.map(row=>[row.stream,row]));
  if(rows.length!==batch.length)throw Error('History backup inventory changed');
  for(const doc of batch){
   const row = byStream.get(doc.stream);
   if(!row||row.game_date!==day||row.checksum!==doc.checksum||checksum(row.payload)!==doc.checksum)throw Error('History backup source did not verify');
   const size = Buffer.byteLength(JSON.stringify(row))+1;
   if(size>partBytes)throw Error('History backup part exceeds size limit');
   if(bytes+size>partBytes)await flush();
   part.push(row);
   bytes+=size;
  }
 }
 await flush();
 if(checksum(await inventory())!==checksum(docs))throw Error('History backup inventory changed before the manifest');
 const receipt=await storeVerified(prefix+'-manifest',JSON.stringify({version:1,sport,day,documents:completed,parts:manifest}));
 const restored=observe?await restoreVerifiedDay(readVerified,receipt,sport,day,observe):null;
 return {sport,day,documents:completed,parts:manifest.length,restored,bytes:manifest.reduce((sum,p)=>sum+p.bytes,0)};
}
