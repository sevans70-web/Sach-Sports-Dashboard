// Run inside the Railway service: node scripts/backup-to-drive.mjs
// Streams files directly from the mounted volume to Google Drive without staging a second copy.
import {createSign,createHash} from "node:crypto";
import {promises as fs,createReadStream} from "node:fs";
import path from "node:path";
const root=process.env.RAILWAY_VOLUME_MOUNT_PATH||"/data";
const folder=process.env.BACKUP_DRIVE_FOLDER_ID;
const raw=process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
if(!folder||!raw)throw Error("Backup configuration missing");
const credentials=JSON.parse(raw);
const b64=o=>Buffer.from(JSON.stringify(o)).toString("base64url");
const now=Math.floor(Date.now()/1000);
const assertion=b64({alg:"RS256",typ:"JWT"})+"."+b64({iss:credentials.client_email,scope:"https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive",aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3500});
const sign=createSign("RSA-SHA256");sign.update(assertion);sign.end();
const jwt=assertion+"."+sign.sign(credentials.private_key,"base64url");
const tokenResponse=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:jwt})});
if(!tokenResponse.ok)throw Error("Google authentication failed: "+tokenResponse.status);
const {access_token:token}=await tokenResponse.json();
const auth={Authorization:"Bearer "+token};
async function api(url,options={}){const r=await fetch(url,{...options,headers:{...auth,...options.headers}});if(!r.ok)throw Error("Drive API "+r.status+": "+(await r.text()).slice(0,300));return r;}
const query=async q=>(await (await api("https://www.googleapis.com/drive/v3/files?fields=nextPageToken,files(id,name,mimeType,size,md5Checksum)&page_size=1000&q="+encodeURIComponent(q))).json()).files;
async function directory(name,parent){const safe=name.replaceAll("'","\\'");const matches=await query("'"+parent+"' in parents and name = '"+safe+"' and mimeType = 'application/vnd.google-apps.folder' and trashed = false");if(matches.length)return matches[0].id;const r=await api("https://www.googleapis.com/drive/v3/files?fields=id",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name,mimeType:"application/vnd.google-apps.folder",parents:[parent]})});return (await r.json()).id;}
const backup=await directory("railway-"+new Date().toISOString().replace(/[:.]/g,"-"),folder);
let count=0,total=0,errors=[];
async function walk(dir,parent){
 for(const entry of await fs.readdir(dir,{withFileTypes:true})){
  const full=path.join(dir,entry.name);
  if(entry.isSymbolicLink())continue;
  if(entry.isDirectory()){await walk(full,await directory(entry.name,parent));continue;}
  if(!entry.isFile())continue;
  try{
   const stat=await fs.stat(full);const size=stat.size;
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
   count++;total+=size;console.log("BACKUP_OK",path.relative(root,full),size);
  }catch(e){errors.push({file:path.relative(root,full),error:String(e)});console.error("BACKUP_FAILED",path.relative(root,full),String(e));}
 }
}
await walk(root,backup);
console.log(JSON.stringify({status:errors.length?"INCOMPLETE":"COMPLETE",driveFolderId:backup,files:count,bytes:total,errors}));
if(errors.length)process.exitCode=1;
