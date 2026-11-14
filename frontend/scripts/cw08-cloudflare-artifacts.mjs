import {gzipSync,gunzipSync,brotliCompressSync,brotliDecompressSync,constants} from 'node:zlib';import {createHash} from 'node:crypto';
export const sha256=value=>createHash('sha256').update(value).digest('hex');
/** These are NHL research records, never environment variables or request headers. */
export function encodeShadowArtifacts(files,secrets=[]){
 if(files.some(f=>!/^([a-zA-Z0-9_-]+\/)?[a-zA-Z0-9_.-]+\.json$/.test(f.path)))throw Error('Invalid shadow artifact path');
 const raw=JSON.stringify({version:1,files});
 if(secrets.some(s=>typeof s==='string'&&s.length>=8&&(raw.includes(s)||files.some(f=>f.content.includes(s)||f.path.includes(s)))))throw Error('Secret detected in shadow artifacts; export refused');
 // Lossless structural interning avoids repeatedly exporting the same frozen
 // models and player histories in the source bundle and each receipt. Preserve
 // object order and exact compact JSON text; opaque files retain their bytes.
 const nodes=[],known=new Map();
 function intern(v){const node=Array.isArray(v)?['a',...v.map(intern)]:v&&typeof v==='object'?['o',...Object.entries(v).flatMap(([k,x])=>[intern(k),intern(x)])]:['p',v];const key=JSON.stringify(node);if(known.has(key))return known.get(key);const id=nodes.length;known.set(key,id);nodes.push(node);return id;}
 const packedFiles=files.map(f=>{try{const value=JSON.parse(f.content),suffix=f.content.endsWith('\n')?'\n':'';if(JSON.stringify(value)+suffix===f.content)return {path:f.path,node:intern(value),suffix};}catch{}return {path:f.path,node:intern(f.content),opaque:true};});
 const bytes=brotliCompressSync(JSON.stringify({version:2,nodes,files:packedFiles}),{params:{[constants.BROTLI_PARAM_QUALITY]:9,[constants.BROTLI_PARAM_LGWIN]:24}}),base64=bytes.toString('base64');
 return {sha256:sha256(bytes),bytes:bytes.length,chunks:Array.from({length:Math.ceil(base64.length/3000)},(_,i)=>base64.slice(i*3000,(i+1)*3000))};
}
export function decodeShadowArtifacts(exported){
 const bytes=Buffer.from(exported.chunks.join(''),'base64');if(sha256(bytes)!==exported.sha256)throw Error('Shadow artifact export checksum mismatch');
 const value=JSON.parse(bytes[0]===0x1f&&bytes[1]===0x8b?gunzipSync(bytes):brotliDecompressSync(bytes));if(![1,2].includes(value.version)||!Array.isArray(value.files))throw Error('Invalid shadow artifact package');
 if(value.files.some(f=>!/^([a-zA-Z0-9_-]+\/)?[a-zA-Z0-9_.-]+\.json$/.test(f.path)))throw Error('Invalid shadow artifact path');
 if(value.version===1)return value.files;
 const decoded=[];for(let i=0;i<value.nodes.length;i++){const [type,...rest]=value.nodes[i],get=id=>{if(!Number.isInteger(id)||id<0||id>=i)throw Error('Invalid shadow node reference');return decoded[id];};if(type==='p')decoded.push(rest[0]);else if(type==='a')decoded.push(rest.map(get));else if(type==='o'){if(rest.length%2)throw Error('Invalid shadow object');const pairs=[];for(let j=0;j<rest.length;j+=2)pairs.push([get(rest[j]),get(rest[j+1])]);decoded.push(Object.fromEntries(pairs));}else throw Error('Invalid shadow node');}
 return value.files.map(f=>({path:f.path,content:f.opaque?decoded[f.node]:JSON.stringify(decoded[f.node])+(f.suffix||'')}));
}
