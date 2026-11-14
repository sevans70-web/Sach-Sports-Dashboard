/** Run ONLY after explicit approval, inside the existing Cloudflare manual job.
 * Feed and build credentials stay in Cloudflare; never print request bodies. */
import {readFile,mkdtemp} from 'node:fs/promises';import {tmpdir} from 'node:os';import {resolve} from 'node:path';import {execFileSync} from 'node:child_process';import {randomBytes} from 'node:crypto';
import {buildShadow} from './build.mjs';import {decodeShadowArtifacts} from '../../scripts/cw08-cloudflare-artifacts.mjs';
const root=resolve(import.meta.dirname,'../..'),repo=resolve(root,'..');
export const plan=JSON.parse(await readFile(resolve(import.meta.dirname,'deployment-plan.json'),'utf8'));
export function activationGuard(env,head){if(env.CF_CW08_ACTIVATION!=='approved'||!/^([a-f0-9]{40})$/.test(env.CF_CW08_APPROVED_COMMIT||'')||env.CF_CW08_APPROVED_COMMIT!==head)throw Error('Explicit approval for this exact commit required');if(!env.CLOUDFLARE_API_TOKEN||!env.OWLS_INSIGHT_API_KEY)throw Error('Existing Cloudflare-only credentials required');}
export function workerMetadata(feedKey,bootstrap,bundleSha256,namespaceId){return {main_module:'worker.mjs',compatibility_date:plan.compatibilityDate,compatibility_flags:['nodejs_compat'],exports:{NhlShadowCoordinator:{type:'durable-object',storage:'sqlite'}},bindings:[{name:'STUDY',type:'durable_object_namespace',class_name:plan.className},{name:'EVIDENCE',type:'kv_namespace',namespace_id:namespaceId},{name:'OWLS_INSIGHT_API_KEY',type:'secret_text',text:feedKey},{name:'BOOTSTRAP_TOKEN',type:'secret_text',text:bootstrap}],limits:{cpu_ms:30000,subrequests:1000},tags:['cw08-shadow-managed','cw08-bundle:'+bundleSha256],observability:{enabled:true,head_sampling_rate:1,redact_query_string:true,logs:{enabled:true,invocation_logs:true,head_sampling_rate:1},traces:{enabled:true,head_sampling_rate:.1}}};}
export async function activate(env=process.env){
 const head=execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim();activationGuard(env,head);
 const account='d3d6d023ab7ab731cc3e191d0ea3c179',base=`https://api.cloudflare.com/client/v4/accounts/${account}`,auth={Authorization:'Bearer '+env.CLOUDFLARE_API_TOKEN};
 const api=async(method,path,body,optional404=false)=>{const form=body instanceof FormData,r=await fetch(base+path,{method,headers:{...auth,...(form?{}:{'Content-Type':'application/json'})},...(body==null?{}:{body:form?body:JSON.stringify(body)})});if(optional404&&r.status===404)return null;if(!r.ok)throw Error('Cloudflare activation API '+method+' failed ('+r.status+')');const data=await r.json();if(!data.success)throw Error('Cloudflare activation API rejected action');return data.result;};
 const protectProduction=async()=>{const deployments=await api('GET','/workers/scripts/'+plan.productionWorker+'/deployments'),trigger=await api('GET','/builds/triggers/'+plan.dashboardTrigger);if(deployments.deployments[0]?.versions?.[0]?.version_id!==plan.productionVersion||JSON.stringify(trigger.branch_includes)!==JSON.stringify([plan.pausedBranchInclude]))throw Error('Production version or build pause changed; activation refused');};
 // No resources change before all artifact and production guard checks succeed.
 await protectProduction();const work=await mkdtemp(resolve(tmpdir(),'cw08-activate-')),output=resolve(work,'worker.mjs'),built=await buildShadow(output);
 const source=await readFile(output,'utf8');if(source.includes(env.OWLS_INSIGHT_API_KEY)||source.includes(env.CLOUDFLARE_API_TOKEN))throw Error('Credential detected in bundle');
 const existing=await api('GET','/workers/scripts/'+plan.worker+'/settings',null,true);if(existing&&(!existing.tags?.includes('cw08-shadow-managed')||!existing.tags?.includes('cw08-bundle:'+built.sha256)))throw Error('Existing research Worker does not match this verified bundle');
 const manifest=JSON.parse(await readFile(resolve(root,'model-research/cw08-nhl-v3/cloudflare-shadow-manifests.json'),'utf8')),pkg=manifest.packages[0],bytes=await readFile(resolve(root,'model-research/cw08-nhl-v3',pkg.file)),files=decodeShadowArtifacts({sha256:pkg.packageSha256,chunks:[bytes.toString('base64')]});
 const receipts=files.filter(f=>f.path.startsWith('receipts/')).map(f=>JSON.parse(f.content));if(receipts.length!==339)throw Error('Incorrect initial enrollment');
 const bootstrap=randomBytes(32).toString('hex'),workerPath='/workers/scripts/'+plan.worker;let created=false;
 try{
  let namespaces=[];for(let page=1;;page++){const chunk=await api('GET','/storage/kv/namespaces?per_page=100&page='+page);namespaces.push(...chunk);if(chunk.length<100)break;}
  const matches=namespaces.filter(n=>n.title===plan.namespaceTitle);if(matches.length>1)throw Error('Ambiguous research namespace');
  let namespace=matches[0];if(!namespace)namespace=await api('POST','/storage/kv/namespaces',{title:plan.namespaceTitle});
  if(existing){if(!existing.bindings?.some(b=>b.name==='EVIDENCE'&&b.type==='kv_namespace'&&b.namespace_id===namespace.id))throw Error('Existing namespace binding mismatch');}
  else if(matches.length){const keys=await api('GET','/storage/kv/namespaces/'+namespace.id+'/keys?limit=1');if(keys.length)throw Error('Refusing to adopt unrecognized nonempty evidence namespace');}
  if(existing){created=true;await api('PUT',workerPath+'/schedules',[]);}
  const metadata=workerMetadata(env.OWLS_INSIGHT_API_KEY,bootstrap,built.sha256,namespace.id);
  const form=new FormData();form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));form.append('worker.mjs',new Blob([source],{type:'application/javascript+module'}),'worker.mjs');
  await api('PUT',workerPath,form);created=true;await api('PUT',workerPath+'/schedules',[]);await api('POST',workerPath+'/subdomain',{enabled:true,previews_enabled:false});
  const url='https://'+plan.worker+'.sevans70.workers.dev';let status;
  for(const receipt of receipts){const body=JSON.stringify(receipt);let ok=false;for(let n=0;n<4;n++){try{const r=await fetch(url+'/bootstrap',{method:'POST',headers:{Authorization:'Bearer '+bootstrap,'Content-Type':'application/json','Content-Length':String(Buffer.byteLength(body))},body,signal:AbortSignal.timeout(20000)});if(r.ok){status=await r.json();ok=true;break;}}catch{}await new Promise(r=>setTimeout(r,1000*2**n));}if(!ok)throw Error('Seed import incomplete; cron remains disabled');}
  if(!status?.ready||status.seeded!==339)throw Error('Seed enrollment not ready');
  const check=await fetch(url+'/status',{signal:AbortSignal.timeout(15000)});if(!check.ok)throw Error('Research status unavailable');const live=await check.json();if(!live.ready||live.receipts<339||live.releaseApproved!==false||live.production!==false)throw Error('Research readiness mismatch');
  await protectProduction();await api('PUT',workerPath+'/schedules',[{cron:plan.cron}]);await protectProduction();
  console.log(JSON.stringify({kind:'cw08_shadow_activation',worker:plan.worker,namespace:namespace.id,cron:plan.cron,commit:head,bundle:built,seeded:339,sourcePackage:pkg.packageSha256,productionChanged:false,productionModelDeployed:false,dashboardBuilt:false,production:false}));
 }catch(error){if(created)try{await api('PUT',workerPath+'/schedules',[]);}catch{}throw error;}
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(import.meta.filename))await activate();
