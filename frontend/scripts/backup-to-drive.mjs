import {driveAuth} from './drive-auth.mjs';
import {storageInventory} from './storage-inventory.mjs';
import {pruneVerifiedFile,md5File} from './retention-cleanup.mjs';
import {expiredHistory,historyFileInfo,retentionCutoff,orphanArchiveInfo} from './retention-policy.mjs';
import {cloudConfigured,saveCloudDocument,cloudRequest} from './history-cloud.mjs';
// Railway startup launches this script after the dashboard server starts.\n// Run inside the Railway service: node scripts/backup-to-drive.mjs
// Freezes small live files in bounded memory; streams larger immutable archives.
// No second on-disk copy of the mounted volume is staged.
import {promises as fs,createReadStream} from "node:fs";
import path from "node:path";
import {randomUUID,createHash} from "node:crypto";
const root=process.env.RAILWAY_VOLUME_MOUNT_PATH||"/data";
const rootStat=await fs.stat(root);
if(!rootStat.isDirectory())throw Error("Railway backup source is not a directory: "+root);
// A quiescent startup check with no orphan files has nothing to upload or prune.
// Full archive replication still runs after startup and on the regular schedule.
if(process.env.SACH_BACKUP_ORPHANS_ONLY==='1'){
 const inventory=await storageInventory(root);
 if(inventory.temporaryBytes===0){console.log(JSON.stringify({status:'COMPLETE',scope:'orphan-temporary-files',files:0,bytes:0,deleted:0,freedBytes:0,errors:[]}));process.exit(0)}
}

const folder=process.env.BACKUP_DRIVE_FOLDER_ID;
const clientId=process.env.GOOGLE_OAUTH_CLIENT_ID;
const clientSecret=process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const refreshToken=process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
if(!folder||!clientId||!clientSecret||!refreshToken)throw Error("OAuth backup configuration missing: BACKUP_DRIVE_FOLDER_ID and GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN required");
const {request:driveRequest}=driveAuth({clientId,clientSecret,refreshToken});
async function api(url,options={}){const r=await driveRequest(url,options);if(!r.ok)throw Error("Drive API "+r.status+": "+(await r.text()).slice(0,300));return r;}
async function query(q){let files=[],pageToken;do{const u=new URL("https://www.googleapis.com/drive/v3/files");u.searchParams.set("fields","nextPageToken,files(id,name,mimeType,size,md5Checksum)");u.searchParams.set("pageSize","1000");u.searchParams.set("q",q);if(pageToken)u.searchParams.set("pageToken",pageToken);const page=await (await api(u.toString())).json();files.push(...page.files);pageToken=page.nextPageToken;}while(pageToken);return files;}
async function directory(name,parent){const safe=name.replaceAll("'","\\'");const matches=await query("'"+parent+"' in parents and name = '"+safe+"' and mimeType = 'application/vnd.google-apps.folder' and trashed = false");if(matches.length)return matches[0].id;const r=await api("https://www.googleapis.com/drive/v3/files?fields=id",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name,mimeType:"application/vnd.google-apps.folder",parents:[parent]})});return (await r.json()).id;}
// Resume the newest backup folder instead of creating duplicate full backups.
const existing=await query("'"+folder+"' in parents and mimeType = 'application/vnd.google-apps.folder' and name contains 'railway-' and trashed = false");
const previous=existing.filter(x=>x.name.startsWith("railway-")).sort((a,b)=>b.name.localeCompare(a.name))[0];
const backup=previous?.id||await directory("railway-"+new Date().toISOString().replace(/[:.]/g,"-"),folder);
console.log("BACKUP_FOLDER",backup,previous?"RESUMING":"NEW");
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function retryUpload(fn,label){
 let last;
 for(let attempt=1;attempt<=5;attempt++){
  try{return await fn();}
  catch(e){last=e;console.error("BACKUP_RETRY",label,"attempt",attempt,String(e));if(attempt<5)await sleep(Math.min(30000,1000*2**attempt));}
 }
 throw last;
}
let count=0,total=0,errors=[],deleted=0,freedBytes=0;
const startedAt=new Date().toISOString(),verifiedFiles=[];let lastCheckpoint=0;
const operationalFiles=new Set(['sach-history/_system/last-backup.json','sach-history/_system/backup-manifest.json']);
// The outbox contains retry pointers, not original receipts. Completed jobs are
// removed by replication; the durable protected_* receipts remain in scope.
const operationalPrefixes=['sach-history/_system/protected-outbox/'];
const operationalFile=rel=>operationalFiles.has(rel)||operationalPrefixes.some(prefix=>rel.startsWith(prefix))||/^sach-history\/_system\/(?:last-backup|last-capture|save-safeguards-[a-z]+)\.json\..+\.tmp$/.test(rel);
const backupStatusFile=path.join(root,'sach-history','_system','last-backup.json');
async function backupStatus(value){await fs.mkdir(path.dirname(backupStatusFile),{recursive:true});const temp=backupStatusFile+'.'+process.pid+'.'+randomUUID()+'.tmp';await fs.writeFile(temp,JSON.stringify({...value,updatedAt:new Date().toISOString(),retentionCutoff:retentionCutoff(),scope:process.env.SACH_BACKUP_ORPHANS_ONLY==='1'?'orphan-temporary-files':'full-volume'}));await fs.rename(temp,backupStatusFile)}
await backupStatus({status:'RUNNING',startedAt,driveFolderId:backup,files:0,bytes:0});
async function recordVerified(rel,size,remote){
 verifiedFiles.push({path:rel,bytes:size,driveFileId:remote.id,md5:remote.md5Checksum});
 if(Date.now()-lastCheckpoint>=30000){lastCheckpoint=Date.now();await backupStatus({status:'RUNNING',startedAt,driveFolderId:backup,files:count,bytes:total,lastVerifiedPath:rel,deleted,freedBytes,errors});}
}
// Freeze the source path inventory before copying. New capture files may also
// be copied, but every file present at cycle start must have a verified receipt.
const sourcePaths=new Set();
async function inventoryPaths(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){
 const full=path.join(dir,entry.name),rel=path.relative(root,full);
 if(entry.isDirectory())await inventoryPaths(full);
 else if(entry.isFile()&&!operationalFile(rel))sourcePaths.add(rel);
}}
try{await inventoryPaths(root);}catch(e){errors.push({file:'source-inventory',error:String(e)});}
console.log('BACKUP_SOURCE_INVENTORY',sourcePaths.size);
console.log('RETENTION_CUTOFF',retentionCutoff());
async function migrateDocument(full,rel,size){
 const info=historyFileInfo(rel);if(!info?.document)return true;
 if(size>16*1024*1024)throw Error('Searchable document exceeds migration size limit; preserving source');
 if(!cloudConfigured())throw Error('Cloud history configuration missing; preserving source');
 const sourceStat=await fs.stat(full);
 const payload=JSON.parse(await fs.readFile(full,'utf8'));
 await saveCloudDocument(info.sport,info.stream,info.day,payload,size,sourceStat.mtime.toISOString());
 console.log('CLOUD_DOCUMENT_VERIFIED',rel,size);return payload;
}
async function safelyPrune(full,rel,size,remoteFile){
 // Retention is disabled until explicitly enabled after independent full-archive verification.
 if(process.env.SACH_ENABLE_BACKUP_PRUNE!=='1')return;
 const removed=await pruneVerifiedFile({full,rel,size,remoteFile,migrateDocument,quiescent:process.env.SACH_BACKUP_QUIESCENT==='1',
 verifyRemote:async id=>(await api(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=id,size,md5Checksum,trashed`)).json(),
 recordArchive:async record=>{await cloudRequest('history_archive_files?on_conflict=relative_path,md5',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(record)});}
 });
 if(removed){deleted++;freedBytes+=size;console.log('RETENTION_DELETE_VERIFIED',rel,size);}
}

async function uploadVerified(full,name,parent,size,rel){
 // Atomic source replacements must not change bytes midway through a resumable
 // upload. Freeze small live documents in bounded memory; large immutable
 // archives remain streamed and must still match their source checksum.
 const snapshot=size<=16*1024*1024?await fs.readFile(full):null;
 if(snapshot)size=snapshot.length;
 const expectedMd5=snapshot?createHash('md5').update(snapshot).digest('hex'):null;
 return retryUpload(async()=>{
   const session=await api("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,size,md5Checksum",{method:"POST",headers:{"content-type":"application/json; charset=UTF-8","X-Upload-Content-Type":"application/octet-stream","X-Upload-Content-Length":String(size)},body:JSON.stringify({name,parents:[parent]})});
   const location=session.headers.get("location");if(!location)throw Error("Missing upload session");
   let result;
   if(size===0){const r=await api(location,{method:"PUT",headers:{"Content-Length":"0","Content-Range":"bytes */0"}});result=await r.json();}
   else{
    let offset=0;const chunkSize=8*1024*1024;
    while(offset<size){
     const end=Math.min(size,offset+chunkSize)-1;
     let data;
     if(snapshot)data=snapshot.subarray(offset,end+1);
     else{const chunks=[];for await(const c of createReadStream(full,{start:offset,end}))chunks.push(c);data=Buffer.concat(chunks);}
     const r=await driveRequest(location,{method:"PUT",headers:{"Content-Length":String(data.length),"Content-Range":`bytes ${offset}-${end}/${size}`},body:data});
     if(r.status===308){offset=end+1;continue;}
     if(!r.ok)throw Error("Upload failed "+r.status+": "+(await r.text()).slice(0,200));
     result=await r.json();offset=size;
    }
   }
   if(Number(result.size)!==size)throw Error("Uploaded file size mismatch");
   if(!result.md5Checksum||(expectedMd5??await md5File(full))!==result.md5Checksum)throw Error("Uploaded file checksum mismatch");
   return result;
   },rel);}

let activeFiles=0;const waitingFiles=[];
async function withFileSlot(work){
 if(activeFiles>=4)await new Promise(resolve=>waitingFiles.push(resolve));else activeFiles++;
 try{return await work();}finally{const next=waitingFiles.shift();if(next)next();else activeFiles--;}
}
async function walkDirectory(dir,parent,nextDirectories){
 const remote=await query("'"+parent+"' in parents and trashed = false");
 const remoteFolders=new Map(remote.filter(f=>f.mimeType==="application/vnd.google-apps.folder").map(f=>[f.name,f.id]));
 const remoteFiles=new Map();
 for(const f of remote.filter(f=>f.mimeType!=="application/vnd.google-apps.folder")){const same=remoteFiles.get(f.name)||[];same.push(f);remoteFiles.set(f.name,same);}
 const entries=await fs.readdir(dir,{withFileTypes:true});
 entries.sort((a,b)=>Number(expiredHistory(path.relative(root,path.join(dir,b.name))))-Number(expiredHistory(path.relative(root,path.join(dir,a.name))))||a.name.localeCompare(b.name));
 let batch=[];
 const flush=async()=>{await Promise.all(batch);batch=[];};
 for(const entry of entries){
  const full=path.join(dir,entry.name);
  if(entry.isSymbolicLink())continue;
  if(entry.isDirectory()){await flush();nextDirectories.push({dir:full,parent:remoteFolders.get(entry.name)||await directory(entry.name,parent)});continue;}
  if(!entry.isFile())continue;
  if(operationalFile(path.relative(root,full)))continue;
  if(process.env.SACH_BACKUP_ORPHANS_ONLY==='1'&&!orphanArchiveInfo(path.relative(root,full)))continue;
  batch.push(withFileSlot(async()=>{try{
   const stat=await fs.stat(full);const size=stat.size;
   // Replicate first: cloud migration belongs only to the independently verified retention path.
   // Calling Supabase for every source file can stall the full Drive archive during cloud outages.
   const candidates=(remoteFiles.get(entry.name)||[]).filter(f=>Number(f.size)===size&&f.md5Checksum);
   if(candidates.length){const local=await md5File(full),remote=candidates.find(f=>f.md5Checksum.toLowerCase()===local.toLowerCase());if(remote){const rel=path.relative(root,full);count++;total+=size;console.log("BACKUP_SKIP",rel,size);await recordVerified(rel,size,remote);await safelyPrune(full,rel,size,remote);return;}console.log("BACKUP_REUPLOAD",path.relative(root,full));}
   const uploaded=await uploadVerified(full,entry.name,parent,size,path.relative(root,full));
   const copiedSize=Number(uploaded.size);count++;total+=copiedSize;console.log("BACKUP_OK",path.relative(root,full),copiedSize);
   await recordVerified(path.relative(root,full),copiedSize,uploaded);
   await safelyPrune(full,path.relative(root,full),copiedSize,uploaded);
  }catch(e){errors.push({file:path.relative(root,full),error:String(e)});console.error("BACKUP_FAILED",path.relative(root,full),String(e));}}));
  if(batch.length>=4)await flush();
 }
 await flush();
}
async function walk(dir,parent){
 let directories=[{dir,parent}];
 while(directories.length){
  const next=[];
  for(let i=0;i<directories.length;i+=4)await Promise.all(directories.slice(i,i+4).map(async item=>{
   try{await walkDirectory(item.dir,item.parent,next);}catch(e){errors.push({file:path.relative(root,item.dir)||'.',error:String(e)});console.error('BACKUP_FAILED',String(e));}
  }));
  directories=next;
 }
}
console.log('STORAGE_BEFORE',JSON.stringify(await fs.statfs(root).then(s=>({totalBytes:s.blocks*s.bsize,freeBytes:s.bavail*s.bsize}))));
try{await walk(root,backup);}catch(e){errors.push({file:'.',error:String(e)});console.error('BACKUP_FAILED',String(e));}
const verifiedPaths=new Set(verifiedFiles.map(file=>file.path));
const unverifiedSourcePaths=[...sourcePaths].filter(rel=>!verifiedPaths.has(rel));
if(unverifiedSourcePaths.length)errors.push({file:'source-inventory',error:'Unverified source paths: '+unverifiedSourcePaths.length});
let manifest=null;
try{
 const manifestPath=path.join(root,'sach-history','_system','backup-manifest.json');
 const body=JSON.stringify({version:1,startedAt,completedAt:new Date().toISOString(),driveFolderId:backup,sourcePaths:[...sourcePaths].sort(),unverifiedSourcePaths,excludedOperationalFiles:[...operationalFiles],excludedOperationalPrefixes:operationalPrefixes,files:verifiedFiles.sort((a,b)=>a.path.localeCompare(b.path)),errors});
 await fs.writeFile(manifestPath,body);
 const remote=await uploadVerified(manifestPath,'backup-manifest-'+startedAt.replace(/[:.]/g,'-')+'.json',backup,Buffer.byteLength(body),'backup-manifest');
 manifest={driveFileId:remote.id,md5:remote.md5Checksum,files:verifiedFiles.length,sourceFiles:sourcePaths.size,unverifiedSourceFiles:unverifiedSourcePaths.length};
 console.log('BACKUP_MANIFEST_VERIFIED',JSON.stringify(manifest));
}catch(e){errors.push({file:'backup-manifest',error:String(e)});}
await backupStatus({status:errors.length?'INCOMPLETE':'COMPLETE',startedAt,driveFolderId:backup,manifest,files:count,bytes:total,deleted,freedBytes,errors});
console.log('STORAGE_AFTER',JSON.stringify(await fs.statfs(root).then(s=>({totalBytes:s.blocks*s.bsize,freeBytes:s.bavail*s.bsize}))));
console.log(JSON.stringify({status:errors.length?"INCOMPLETE":"COMPLETE",driveFolderId:backup,scope:process.env.SACH_BACKUP_ORPHANS_ONLY==='1'?'orphan-temporary-files':'full-volume',files:count,bytes:total,deleted,freedBytes,manifest,errors}));
// Retention runs only after matching MD5 checksums establish an archived copy.
if(errors.length)process.exitCode=1;

