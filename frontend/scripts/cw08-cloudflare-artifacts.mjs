import {gzipSync,gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
export const sha256=value=>createHash('sha256').update(value).digest('hex');
/** These are NHL research records, never environment variables or request headers. */
export function encodeShadowArtifacts(files,secrets=[]){
 if(files.some(f=>!/^([a-zA-Z0-9_-]+\/)?[a-zA-Z0-9_.-]+\.json$/.test(f.path)))throw Error('Invalid shadow artifact path');
 const raw=JSON.stringify({version:1,files});
 if(secrets.some(s=>typeof s==='string'&&s.length>=8&&(raw.includes(s)||files.some(f=>f.content.includes(s)||f.path.includes(s)))))throw Error('Secret detected in shadow artifacts; export refused');
 const bytes=gzipSync(raw),base64=bytes.toString('base64');
 return {sha256:sha256(bytes),bytes:bytes.length,chunks:Array.from({length:Math.ceil(base64.length/3000)},(_,i)=>base64.slice(i*3000,(i+1)*3000))};
}
export function decodeShadowArtifacts(exported){
 const bytes=Buffer.from(exported.chunks.join(''),'base64');if(sha256(bytes)!==exported.sha256)throw Error('Shadow artifact export checksum mismatch');
 const value=JSON.parse(gunzipSync(bytes));if(value.version!==1||!Array.isArray(value.files))throw Error('Invalid shadow artifact package');
 if(value.files.some(f=>!/^([a-zA-Z0-9_-]+\/)?[a-zA-Z0-9_.-]+\.json$/.test(f.path)))throw Error('Invalid shadow artifact path');return value.files;
}
