/** Cloudflare manual-job entrypoint. Never builds or deploys the dashboard. */
import {mkdtemp,readdir,readFile,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {resolve} from 'node:path';import {spawnSync} from 'node:child_process';
import {filterShadowEnrollment} from './cw08-shadow-enrollment.mjs';
import {encodeShadowArtifacts} from './cw08-cloudflare-artifacts.mjs';
if(process.env.CF_CW08_SHADOW_ONLY!=='1')throw Error('Explicit shadow-only runner mode required');
if(!process.env.OWLS_INSIGHT_API_KEY)throw Error('Cloudflare encrypted feed binding missing from manual runner');
// Dedicated namespace prefix only: never read or overwrite dashboard cache keys.
const account='d3d6d023ab7ab731cc3e191d0ea3c179',namespace='644df6a469e84dba90c8f7dac410f895';
const token=process.env.CLOUDFLARE_API_TOKEN;if(!token)throw Error('Cloudflare build token unavailable for durable shadow evidence');
const storageRoot=`https://api.cloudflare.com/client/v4/accounts/${account}/storage/kv/namespaces/${namespace}/values/`;
const headers={Authorization:`Bearer ${token}`};
const probe=await fetch(storageRoot+encodeURIComponent('cw08-shadow/artifacts/permission-probe'),{headers});
if(!probe.ok&&probe.status!==404)throw Error(`Shadow storage permission check failed (${probe.status}); no feed capture attempted`);
const root=resolve(import.meta.dirname,'..'),work=await mkdtemp(resolve(tmpdir(),'cw08-cloudflare-'));
const run=(script,args=[])=>{const r=spawnSync(process.execPath,[resolve(root,'scripts',script),...args],{cwd:root,env:process.env,stdio:'inherit'});if(r.error)throw r.error;return r.status;};
// Workers Builds may use shallow clones. Fetch only the already-frozen model
// commit; no checkout, reset, repository writes, or pipeline commands follow.
const frozen='007c02b';if(spawnSync('git',['cat-file','-e',frozen+'^{commit}'],{cwd:root,stdio:'ignore'}).status!==0){
 const result=spawnSync('git',['fetch','--no-tags','--deepen=12','origin','cloudflare-compatibility-test'],{cwd:root,stdio:'inherit'});if(result.status!==0)throw Error('Frozen commit unavailable');
}
if(run('make-cw08-nhl-shadow-bundle.mjs',[work+'/bundle.json'])!==0)throw Error('Shadow source capture failed');
const sourceBundle=JSON.parse(await readFile(work+'/bundle.json','utf8'));
const ledger=JSON.parse(await readFile(resolve(root,'model-research/cw08-nhl-v3/cloudflare-shadow-manifests.json'),'utf8'));
const enrollment=filterShadowEnrollment(sourceBundle,ledger);
await writeFile(work+'/capture-bundle.json',JSON.stringify(enrollment.bundle)+'\n');
await writeFile(work+'/enrollment-report.json',JSON.stringify({production:false,excluded:enrollment.excluded})+'\n');
const status=run('capture-cw08-nhl-shadow.mjs',[work+'/capture-bundle.json',work+'/study']);if(status!==0&&status!==2)throw Error('Shadow receipt capture failed');
const files=await Promise.all(['bundle.json','capture-bundle.json','enrollment-report.json'].map(async path=>({path,content:await readFile(work+'/'+path,'utf8')})));
async function collect(dir,prefix=''){
 for(const entry of await readdir(dir,{withFileTypes:true})){if(entry.isDirectory())await collect(resolve(dir,entry.name),prefix+entry.name+'/');else if(entry.name.endsWith('.json'))files.push({path:prefix+entry.name,content:await readFile(resolve(dir,entry.name),'utf8')});}
}
await collect(work+'/study');
const bundle=JSON.parse(files[0].content),receipts=files.filter(f=>f.path.startsWith('receipts/'));
const result={kind:'cw08_cloudflare_shadow_job',capturedAt:new Date().toISOString(),sourceEntries:bundle.entries.length,previouslyEnrolled:enrollment.excluded.length,accepted:receipts.length,sourceRejections:bundle.rejections.length,production:false,dashboardBuilt:false,deployed:false,modelCommit:frozen};
files.push({path:'job-result.json',content:JSON.stringify(result)+'\n'});
const exported=encodeShadowArtifacts(files,['OWLS_INSIGHT_API_KEY','SPORTSGAMEODDS_API_KEY','CLOUDFLARE_API_TOKEN'].map(k=>process.env[k]));
const key='cw08-shadow/artifacts/'+exported.sha256+'.json';
const payload=JSON.stringify({format:'cw08-shadow-artifact-v2',sha256:exported.sha256,bytes:exported.bytes,base64:exported.chunks.join(''),job:result});
// Content-addressed, no expiry, no overwriting mutable production keys. Keep
// the complete source history and every receipt; logs carry only the checksum.
const uploaded=await fetch(storageRoot+encodeURIComponent(key),{method:'PUT',headers:{...headers,'Content-Type':'text/plain'},body:payload});
if(!uploaded.ok)throw Error(`Durable shadow storage failed (${uploaded.status}); evidence is not approved`);
const response=await uploaded.json();if(response.success!==true)throw Error('Durable shadow storage rejected evidence');
console.log('CW08_SHADOW_MANIFEST '+JSON.stringify({sha256:exported.sha256,bytes:exported.bytes,storage:'cloudflare-kv',namespace,key,...result}));
