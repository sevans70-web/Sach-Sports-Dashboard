// Railway startup launches this script after the dashboard server starts.\n// Run inside the Railway service: node scripts/backup-to-drive.mjs
// Streams files directly from the mounted volume to Google Drive without staging a second copy.
import {promises as fs,createReadStream} from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
const root=process.env.RAILWAY_VOLUME_MOUNT_PATH||"/data";
const rootStat=await fs.stat(root);
if(!rootStat.isDirectory())throw Error("Railway backup source is not a directory: "+root);
const folder=process.env.BACKUP_DRIVE_FOLDER_ID;
const clientId=process.env.GOOGLE_OAUTH_CLIENT_ID;
const clientSecret=process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const refreshToken=process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
if(!folder||!clientId||!clientSecret||!refreshToken)throw Error("OAuth backup configuration missing: BACKUP_DRIVE_FOLDER_ID and GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN required");
const tokenResponse=await fetch("https://oauth2.googleapis.com/token",{
 method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},
 body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:refreshToken,grant_type:"refresh_token"})
});
if(!tokenResponse.ok)throw Error("Google OAuth refresh failed: HTTP "+tokenResponse.status+" (check consent testing status and refresh token)");
const {access_token:token}=await tokenResponse.json();
if(!token)throw Error("Google OAuth did not return an access token");
const auth={Authorization:"Bearer "+token};
async function api(url,options={}){const r=await fetch(url,{...options,headers:{...auth,...options.headers}});if(!r.ok)throw Error("Drive API "+r.status+": "+(await r.text()).slice(0,300));return r;}
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
let count=0,total=0,errors=[],deletionCandidates=[];
const cutoff=new Date();cutoff.setUTCHours(0,0,0,0);cutoff.setUTCDate(cutoff.getUTCDate()-6);
async function md5File(file){const hash=createHash("md5");for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest("hex");}
function historicalDate(rel){if(!rel.startsWith("sach-history/"))return null;const base=path.basename(rel);const dates=[...base.matchAll(/(?:^|[^0-9])(20\\d{2}-\\d{2}-\\d{2})(?=[^0-9]|$)/g)];if(!dates.length)return null;const d=dates[dates.length-1][1];const date=new Date(d+"T00:00:00Z");return !Number.isNaN(date.valueOf())&&date.toISOString().slice(0,10)===d?date:null;}
async function markForCleanup(full,rel,size,remoteFile){const date=historicalDate(rel);if(!date||date>=cutoff)return;if(!remoteFile||Number(remoteFile.size)!==size||!remoteFile.md5Checksum)return;const localHash=await md5File(full);if(localHash===remoteFile.md5Checksum)deletionCandidates.push({full,rel,size,localHash});else console.error("CLEANUP_HASH_MISMATCH",rel);}

async function walk(dir,parent){
 const remote=await query("'"+parent+"' in parents and trashed = false");
 const remoteFiles=new Map(remote.filter(f=>f.mimeType!== "application/vnd.google-apps.folder").map(f=>[f.name,f]));
 for(const entry of await fs.readdir(dir,{withFileTypes:true})){
  const full=path.join(dir,entry.name);
  if(entry.isSymbolicLink())continue;
  if(entry.isDirectory()){await walk(full,await directory(entry.name,parent));continue;}
  if(!entry.isFile())continue;
  try{
   const stat=await fs.stat(full);const size=stat.size;
   if(remoteFiles.has(entry.name)&&Number(remoteFiles.get(entry.name).size)===size){const rel=path.relative(root,full);const remote=remoteFiles.get(entry.name);if(remote.md5Checksum&&await md5File(full)===remote.md5Checksum){count++;total+=size;console.log("BACKUP_SKIP",rel,size);await markForCleanup(full,rel,size,remote);continue;}console.log("BACKUP_REUPLOAD",rel);}
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
     const r=await fetch(location,{method:"PUT",headers:{...auth,"Content-Length":String(data.length),"Content-Range":`bytes ${offset}-${end}/${size}`},body:data});
     if(r.status===308){offset=end+1;continue;}
     if(!r.ok)throw Error("Upload failed "+r.status);
     result=await r.json();offset=size;
    }
   }
   if(Number(result.size)!==size)throw Error("Uploaded file size mismatch");
   return result;
   });
   await markForCleanup(full,path.relative(root,full),size,uploaded);
   count++;total+=size;console.log("BACKUP_OK",path.relative(root,full),size);
  }catch(e){errors.push({file:path.relative(root,full),error:String(e)});console.error("BACKUP_FAILED",path.relative(root,full),String(e));}
 }
}
await walk(root,backup);
console.log(JSON.stringify({status:errors.length?"INCOMPLETE":"COMPLETE",driveFolderId:backup,files:count,bytes:total,errors}));
if(errors.length){console.error("CLEANUP_ABORTED_BACKUP_INCOMPLETE");process.exitCode=1;}
else {
 let removed=0,freed=0,cleanupErrors=0;
 for(const item of deletionCandidates){
  try{const stat=await fs.stat(item.full);if(stat.size!==item.size||await md5File(item.full)!==item.localHash){console.error("CLEANUP_CHANGED",item.rel);continue;}await fs.unlink(item.full);removed++;freed+=item.size;console.log("CLEANUP_OK",item.rel,item.size);}
  catch(e){cleanupErrors++;console.error("CLEANUP_FAILED",item.rel,String(e));}
 }
 console.log("CLEANUP_COMPLETE",JSON.stringify({removed,bytesFreed:freed,cleanupErrors,cutoff:cutoff.toISOString().slice(0,10)}));
 if(cleanupErrors)process.exitCode=1;
}
