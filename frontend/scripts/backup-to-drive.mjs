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
let count=0,total=0,errors=[],deleted=0,freedBytes=0;
// Only date-stamped sport history is eligible. Keep seven Toronto-calendar days,
// including today. Never delete databases, manifests, system files, or undated data.
const todayToronto=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Toronto",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const [yy,mm,dd]=todayToronto.split("-").map(Number);
const cutoff=new Date(Date.UTC(yy,mm-1,dd-6));
function expiredHistory(rel){
 const segments=rel.split(path.sep);
 if(segments[0]!=="sach-history"||segments.length<3||segments[1]==="_system")return false;
 const match=segments.at(-1).match(/(?:^|_)(\\d{4}-\\d{2}-\\d{2})\\.json$/);
 if(!match)return false;
 const day=new Date(match[1]+"T00:00:00Z");
 return !Number.isNaN(day.getTime())&&day.toISOString().slice(0,10)===match[1]&&day<cutoff;
}
async function safelyPrune(full,rel,size,remoteMd5){
 if(!expiredHistory(rel)||!remoteMd5)return;
 const current=await fs.stat(full);
 if(current.size!==size)return;
 const localMd5=await md5File(full);
 if(localMd5.toLowerCase()!==remoteMd5.toLowerCase())return;
 // Recheck after hashing to avoid removing a changing live file.
 const after=await fs.stat(full);
 if(after.size!==current.size||after.mtimeMs!==current.mtimeMs)return;
 await fs.unlink(full);
 deleted++;freedBytes+=size;
 console.log("RETENTION_DELETE_VERIFIED",rel,size);
}

async function md5File(file){const hash=createHash("md5");for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest("hex");}

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
   if(remoteFiles.has(entry.name)&&Number(remoteFiles.get(entry.name).size)===size){const rel=path.relative(root,full);const remote=remoteFiles.get(entry.name);if(remote.md5Checksum&&await md5File(full)===remote.md5Checksum){count++;total+=size;console.log("BACKUP_SKIP",rel,size);await safelyPrune(full,rel,size,remote.md5Checksum);continue;}console.log("BACKUP_REUPLOAD",rel);}
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
   if(!result.md5Checksum||await md5File(full)!==result.md5Checksum)throw Error("Uploaded file checksum mismatch");
   return result;
   });
   count++;total+=size;console.log("BACKUP_OK",path.relative(root,full),size);
   await safelyPrune(full,path.relative(root,full),size,uploaded.md5Checksum);
  }catch(e){errors.push({file:path.relative(root,full),error:String(e)});console.error("BACKUP_FAILED",path.relative(root,full),String(e));}
 }
}
await walk(root,backup);
console.log(JSON.stringify({status:errors.length?"INCOMPLETE":"COMPLETE",driveFolderId:backup,files:count,bytes:total,deleted,freedBytes,errors}));
// Retention runs only after matching MD5 checksums establish an archived copy.
if(errors.length)process.exitCode=1;
