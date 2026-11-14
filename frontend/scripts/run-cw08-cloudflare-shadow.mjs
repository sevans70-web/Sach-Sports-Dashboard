/** Cloudflare manual-job entrypoint. Never builds or deploys the dashboard. */
import {mkdtemp,readdir,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {resolve} from 'node:path';import {spawnSync} from 'node:child_process';
import {encodeShadowArtifacts} from './cw08-cloudflare-artifacts.mjs';
if(process.env.CF_CW08_SHADOW_ONLY!=='1')throw Error('Explicit shadow-only runner mode required');
if(!process.env.OWLS_INSIGHT_API_KEY)throw Error('Cloudflare encrypted feed binding missing from manual runner');
const root=resolve(import.meta.dirname,'..'),work=await mkdtemp(resolve(tmpdir(),'cw08-cloudflare-'));
const run=(script,args=[])=>{const r=spawnSync(process.execPath,[resolve(root,'scripts',script),...args],{cwd:root,env:process.env,stdio:'inherit'});if(r.error)throw r.error;return r.status;};
// Workers Builds may use shallow clones. Fetch only the already-frozen model
// commit; no checkout, reset, repository writes, or pipeline commands follow.
const frozen='007c02b';if(spawnSync('git',['cat-file','-e',frozen+'^{commit}'],{cwd:root,stdio:'ignore'}).status!==0){
 const result=spawnSync('git',['fetch','--no-tags','--deepen=12','origin','cloudflare-compatibility-test'],{cwd:root,stdio:'inherit'});if(result.status!==0)throw Error('Frozen commit unavailable');
}
if(run('make-cw08-nhl-shadow-bundle.mjs',[work+'/bundle.json'])!==0)throw Error('Shadow source capture failed');
const status=run('capture-cw08-nhl-shadow.mjs',[work+'/bundle.json',work+'/study']);if(status!==0&&status!==2)throw Error('Shadow receipt capture failed');
const files=[{path:'bundle.json',content:await readFile(work+'/bundle.json','utf8')}];
async function collect(dir,prefix=''){
 for(const entry of await readdir(dir,{withFileTypes:true})){if(entry.isDirectory())await collect(resolve(dir,entry.name),prefix+entry.name+'/');else if(entry.name.endsWith('.json'))files.push({path:prefix+entry.name,content:await readFile(resolve(dir,entry.name),'utf8')});}
}
await collect(work+'/study');
const bundle=JSON.parse(files[0].content),receipts=files.filter(f=>f.path.startsWith('receipts/'));
const result={kind:'cw08_cloudflare_shadow_job',capturedAt:new Date().toISOString(),sourceEntries:bundle.entries.length,accepted:receipts.length,sourceRejections:bundle.rejections.length,production:false,dashboardBuilt:false,deployed:false,modelCommit:frozen};
files.push({path:'job-result.json',content:JSON.stringify(result)+'\n'});
const exported=encodeShadowArtifacts(files,['OWLS_INSIGHT_API_KEY','SPORTSGAMEODDS_API_KEY','CLOUDFLARE_API_TOKEN'].map(k=>process.env[k]));
console.log('CW08_SHADOW_MANIFEST '+JSON.stringify({sha256:exported.sha256,bytes:exported.bytes,chunks:exported.chunks.length,...result}));
exported.chunks.forEach((value,index)=>console.log('CW08_SHADOW_CHUNK '+JSON.stringify({sha256:exported.sha256,index,value})));
