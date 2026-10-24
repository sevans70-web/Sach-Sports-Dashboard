import {Readable} from 'node:stream';
import {createGunzip} from 'node:zlib';
import {createHash} from 'node:crypto';
import {StringDecoder} from 'node:string_decoder';
import {cloudConfigured,cloudRequest} from '../scripts/history-cloud.mjs';
let token:{value:string;expires:number}|null=null;
async function driveToken(){
 if(token&&token.expires>Date.now())return token.value;
 const client_id=process.env.GOOGLE_OAUTH_CLIENT_ID,client_secret=process.env.GOOGLE_OAUTH_CLIENT_SECRET,refresh_token=process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
 if(!client_id||!client_secret||!refresh_token)throw Error('Archived history authorization is unavailable');
 const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id,client_secret,refresh_token,grant_type:'refresh_token'}),signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('Archived history authorization failed');const p=await r.json();if(!p.access_token)throw Error('Archived history authorization failed');token={value:p.access_token,expires:Date.now()+Math.max(60,Number(p.expires_in||3600)-120)*1000};return token.value;
}
/** Read a checksum-verified cold archive without downloading it back onto Railway. */
export async function visitCloudArchive(relativePath:string,parse:(stream:AsyncIterable<string>)=>Promise<void>){
 if(!cloudConfigured())return false;
 const files=await cloudRequest(`history_archive_files?select=drive_file_id,md5&relative_path=eq.${encodeURIComponent(relativePath)}&order=verified_at.desc&limit=1`);
 const file=files?.[0];if(!file)return false;
 const response=await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.drive_file_id)}?alt=media`,{headers:{Authorization:'Bearer '+await driveToken()},signal:AbortSignal.timeout(120000)});
 if(!response.ok||!response.body)throw Error('Archived history copy could not be read');
 const hash=createHash('md5'),decoder=new StringDecoder('utf8');
 async function* bytes(){for await(const raw of response.body as any){const value=Buffer.from(raw);hash.update(value);yield value;}}
 const input=relativePath.endsWith('.gz')?Readable.from(bytes()).pipe(createGunzip()):Readable.from(bytes());
 async function* chunks(){for await(const raw of input)yield decoder.write(Buffer.from(raw));const tail=decoder.end();if(tail)yield tail;}
 await parse(chunks());
 if(hash.digest('hex').toLowerCase()!==String(file.md5).toLowerCase())throw Error('Archived history checksum mismatch');
 return true;
}

export async function visitCloudSegments(prefix:string,parse:(stream:AsyncIterable<string>)=>Promise<void>){
 if(!cloudConfigured())return;
 for(let offset=0;;offset+=100){
  const files=await cloudRequest(`history_archive_files?select=relative_path&relative_path=like.${encodeURIComponent(prefix+'/*')}&order=relative_path.asc&limit=100&offset=${offset}`);
  for(const file of files)await visitCloudArchive(file.relative_path,parse);
  if(files.length<100)break;
 }
}
