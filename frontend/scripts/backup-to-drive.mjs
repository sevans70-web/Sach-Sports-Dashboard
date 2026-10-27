import {driveAuth} from './drive-auth.mjs';
import {storageInventory} from './storage-inventory.mjs';
import {pruneVerifiedFile,md5File} from './retention-cleanup.mjs';
import {expiredHistory,historyFileInfo,retentionCutoff,orphanArchiveInfo} from './retention-policy.mjs';
import {cloudConfigured,saveCloudDocument,cloudRequest} from './history-cloud.mjs';
// Railway startup launches this script after the dashboard server starts.\n// Run inside the Railway service: node scripts/backup-to-drive.mjs
// Streams files directly from the mounted volume to Google Drive without staging a second copy.
import {promises as fs,createReadStream} from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
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
const backupStatusFile=path.join(root,'sach-history','_system','last-backup.json');
async function backupStatus(value){await fs.mkdir(path.dirname(backupStatusFile),{recursive:true});const temp=backupStatusFile+'.'+process.pid+'.tmp';await fs.writeFile(temp,JSON.stringify({...value,updatedAt:new Date().toISOString(),retentionCutoff:retentionCutoff(),scope:process.env.SACH_BACKUP_ORPHANS_ONLY==='1'?'orphan-temporary-files':'full-volume'}));await fs.rename(temp,backupStatusFile)}
await backupStatus({status:'RUNNING',startedAt:new Date().toISOString()});
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

async function walk(dir,parent){
 const remote=await query("'"+parent+"' in parents and trashed = false");
 const remoteFiles=new Map();
 for(const f of remote.filter(f=>f.mimeType!=="application/vnd.google-apps.folder")){const same=remoteFiles.get(f.name)||[];same.push(f);remoteFiles.set(f.name,same);}
 const entries=await fs.readdir(dir,{withFileTypes:true});
 entries.sort((a,b)=>Number(expiredHistory(path.relative(root,path.join(dir,b.name))))-Number(expiredHistory(path.relative(root,path.join(dir,a.name))))||a.name.localeCompare(b.name));
 for(const entry of entries){
  const full=path.join(dir,entry.name);
  if(entry.isSymbolicLink())continue;
  if(entry.isDirectory()){await walk(full,await directory(entry.name,parent));continue;}
  if(!entry.isFile())continue;
  if(process.env.SACH_BACKUP_ORPHANS_ONLY==='1'&&!orphanArchiveInfo(path.relative(root,full)))continue;
  try{
   const stat=await fs.stat(full);const size=stat.size;
   // Replicate first: cloud migration belongs only to the independently verified retention path.
   // Calling Supabase for every source file can stall the full Drive archive during cloud outages.
   const candidates=(remoteFiles.get(entry.name)||[]).filter(f=>Number(f.size)===size&&f.md5Checksum);
   if(candidates.length){const local=await md5File(full),remote=candidates.find(f=>f.md5Checksum.toLowerCase()===local.toLowerCase());if(remote){const rel=path.relative(root,full);count++;total+=size;console.log("BACKUP_SKIP",rel,size);await safelyPrune(full,rel,size,remote);continue;}console.log("BACKUP_REUPLOAD",path.relative(root,full));}
   const uploaded=await retryUpload(async()=>{
   const session=await api("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,size,md5Checksum",{method:"POST",headers:{"content-type":"application/json; charset=UTF-8","X-Upload-Content-Type":"application/octet-stream","X-Upload-Content-Length":String(size)},body:JSON.stringify({name:entry.name,parents:[parent]})});
   const location=session.headers.get("location");if(!location)throw Error("Missing upload session");
   let result;
   if(size===0){const r=await api(location,{method:"PUT",headers:{"Content-Length":"0","Content-Range":"bytes */0"}});result=await r.json();}
   else{
    let offset=0;const chunkSize=8*1024*1024;
    while(offset<size){
     const end=Math.min(size,offset+chunkSize)-1;
     const chunks=[];for await(const c of createReadStream(full,{start:offset,end}))chunks.push(c);
     const data=Buffer.concat(chunks);
     const r=await driveRequest(location,{method:"PUT",headers:{"Content-Length":String(data.length),"Content-Range":`bytes ${offset}-${end}/${size}`},body:data});
     if(r.status===308){offset=end+1;continue;}
     if(!r.ok)throw Error("Upload failed "+r.status);
     result=await r.json();offset=size;
    }
   }
   if(Number(result.size)!==size)throw Error("Uploaded file size mismatch");
   if(!result.md5Checksum||await md5File(full)!==result.md5Checksum)throw Error("Uploaded file checksum mismatch");
   return result;
   });
   count++;total+=size;console.log("BACKUP_OK",path.relative(root,full),size);
   await safelyPrune(full,path.relative(root,full),size,uploaded);
  }catch(e){errors.push({file:path.relative(root,full),error:String(e)});console.error("BACKUP_FAILED",path.relative(root,full),String(e));}
 }
}
console.log('STORAGE_BEFORE',JSON.stringify(await fs.statfs(root).then(s=>({totalBytes:s.blocks*s.bsize,freeBytes:s.bavail*s.bsize}))));
await walk(root,backup);
await backupStatus({status:errors.length?'INCOMPLETE':'COMPLETE',files:count,bytes:total,deleted,freedBytes,errors});
console.log('STORAGE_AFTER',JSON.stringify(await fs.statfs(root).then(s=>({totalBytes:s.blocks*s.bsize,freeBytes:s.bavail*s.bsize}))));
console.log(JSON.stringify({status:errors.length?"INCOMPLETE":"COMPLETE",driveFolderId:backup,scope:process.env.SACH_BACKUP_ORPHANS_ONLY==='1'?'orphan-temporary-files':'full-volume',files:count,bytes:total,deleted,freedBytes,errors}));
// Retention runs only after matching MD5 checksums establish an archived copy.
if(errors.length)process.exitCode=1;

