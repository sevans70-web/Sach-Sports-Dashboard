/** Verify a complete private Cloudflare job export before counting evidence. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';import {resolve,dirname} from 'node:path';
import {decodeShadowArtifacts} from './cw08-cloudflare-artifacts.mjs';import {verifyShadowReceipt,digest} from './nhl-shadow-evidence.mjs';
const [file,expectedSha256,anchorTime,directory]=process.argv.slice(2);
if(!file||!expectedSha256||!anchorTime||!directory)throw Error('Usage: node scripts/extract-cw08-cloudflare-shadow.mjs PACKAGE SHA256 CLOUDFLARE_MANIFEST_TIME OUTPUT_DIRECTORY');
const bytes=await readFile(file),files=decodeShadowArtifacts({sha256:expectedSha256,chunks:[bytes.toString('base64')]}),anchor=Date.parse(anchorTime);
if(!Number.isFinite(anchor))throw Error('Cloudflare capture anchor time required');
const results=[],keys=new Set();
for(const entry of files.filter(f=>f.path.startsWith('receipts/'))){
 const receipt=JSON.parse(entry.content),r=verifyShadowReceipt(receipt),key=[r.target.market,r.target.gameId,r.target.playerId].join('|');
 if(keys.has(key))throw Error('Duplicate immutable shadow target');keys.add(key);
 if(Date.parse(r.createdAt)>anchor||Date.parse(r.target.gameTime)<=anchor)throw Error('Export not anchored before puck drop');
 if(r.modelFreeze.commit!=='007c02b'||r.model.selectionApproved!==false||r.target.sport!=='nhl')throw Error('Unexpected shadow model or scope');
 if(r.history.some(g=>Date.parse(g.gameTime)>=Date.parse(r.createdAt)-48*3600000))throw Error('Noncausal shadow history');
 results.push({key,sha256:receipt.sha256,market:r.target.market,gameId:r.target.gameId,gameTime:r.target.gameTime,createdAt:r.createdAt});
}
const reportFile=files.find(f=>f.path==='job-result.json');if(!reportFile)throw Error('Missing job completion receipt');const job=JSON.parse(reportFile.content);
if(job.accepted!==results.length||job.production!==false||job.deployed!==false||job.dashboardBuilt!==false)throw Error('Job/receipt count or safety mismatch');
for(const entry of files){const path=resolve(directory,entry.path);await mkdir(dirname(path),{recursive:true});await writeFile(path,entry.content,{flag:'wx',mode:0o444});}
const summary={packageSha256:expectedSha256,cloudflareManifestTime:anchorTime,accepted:results.length,markets:Object.fromEntries(['goals','assists'].map(m=>[m,results.filter(r=>r.market===m).length])),fixtures:new Set(results.map(r=>r.gameId)).size,earliestGameTime:results.map(r=>r.gameTime).sort()[0],latestGameTime:results.map(r=>r.gameTime).sort().at(-1),receiptIndexSha256:digest(results),modelFrozenCommit:'007c02b',production:false,releaseApproved:false};
await writeFile(resolve(directory,'verified-export.json'),JSON.stringify(summary,null,2)+'\n',{flag:'wx',mode:0o444});console.log(JSON.stringify(summary,null,2));
