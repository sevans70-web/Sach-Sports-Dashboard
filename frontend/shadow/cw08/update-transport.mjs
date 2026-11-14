/** Approved code-only update in the existing Cloudflare manual environment.
 * Never reads feed/bootstrap secret values, imports receipts or edits cron. */
import {readFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {buildShadow} from './build.mjs';
import {ensureFrozenHistory} from './frozen-history.mjs';
const plan=JSON.parse(await readFile(new URL('./rate-limit-deployment-plan.json',import.meta.url),'utf8'));
const account='d3d6d023ab7ab731cc3e191d0ea3c179';
export function updateMetadata(settings,bundle){
 const kv=settings.bindings?.find(b=>b.name==='EVIDENCE'),study=settings.bindings?.find(b=>b.name==='STUDY');
 const secrets=settings.bindings?.filter(b=>b.type==='secret_text').map(b=>b.name).sort();
 if(kv?.type!=='kv_namespace'||study?.type!=='durable_object_namespace'||kv?.namespace_id!==plan.evidenceKV||study?.namespace_id!==plan.durableObjectNamespace||study?.class_name!==plan.durableObjectClass||
  JSON.stringify(secrets)!==JSON.stringify(['BOOTSTRAP_TOKEN','OWLS_INSIGHT_API_KEY'])||settings.bindings.length!==4||
  !settings.tags?.includes('cw08-shadow-managed')||!settings.tags.includes('cw08-bundle:03602bcf9ad3448c8ff5db9901eaeca148e8e75d5bc462a354706d5e521f12b1')||
  settings.compatibility_date!=='2026-11-14'||JSON.stringify(settings.compatibility_flags)!==JSON.stringify(['nodejs_compat']))throw Error('Research configuration mismatch');
 if(bundle.sha256!==plan.testedBundle.sha256||bundle.bytes!==plan.testedBundle.bytes)throw Error('Tested bundle mismatch');
 return {main_module:'worker.mjs',compatibility_date:settings.compatibility_date,compatibility_flags:settings.compatibility_flags,
  keep_bindings:['secret_text'],bindings:[{...kv},{name:'STUDY',type:'durable_object_namespace',class_name:study.class_name}],
  exports:{NhlShadowCoordinator:{type:'durable-object',storage:'sqlite'}},limits:settings.limits,
  observability:settings.observability,logpush:settings.logpush,tail_consumers:settings.tail_consumers,
  tags:['cw08-shadow-managed','cw08-bundle:'+bundle.sha256],annotations:{'workers/message':'Approved CW08 transport-only update; frozen model, receipts and cron preserved'}};
}
export async function update(env=process.env){
 const repo=resolve(import.meta.dirname,'../../..'),head=execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim();
 if(env.CW08_TRANSPORT_APPROVED!=='yes'||env.CW08_APPROVED_COMMIT!==head||!env.CLOUDFLARE_API_TOKEN)throw Error('Exact commit approval and existing Cloudflare environment required');
 const dashboardVersion=env.CW08_VERIFIED_DASHBOARD_VERSION;if(dashboardVersion!=='bdd010c7-ab1d-41a1-83fb-bcabab45b86f')throw Error('Verified dashboard version required');
 const api=async(method,path,body)=>{const form=body instanceof FormData;const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+path,{method,headers:{Authorization:'Bearer '+env.CLOUDFLARE_API_TOKEN,...(form?{}:{'Content-Type':'application/json'})},...(body?{body:form?body:JSON.stringify(body)}:{})});if(!r.ok)throw Error('Cloudflare '+method+' '+path+' HTTP '+r.status);const d=await r.json();if(!d.success)throw Error('Cloudflare rejected update');return d.result;};
 const version=async name=>(await api('GET','/workers/scripts/'+name+'/deployments')).deployments[0]?.versions?.[0]?.version_id;
 const path='/workers/scripts/'+plan.worker;
 if(await version('sach-sports-cloudflare-test')!==dashboardVersion||await version(plan.worker)!==plan.replaceVersion)throw Error('Deployment version fence failed');
 const schedules=await api('GET',path+'/schedules');if(JSON.stringify(schedules.schedules.map(x=>x.cron))!==JSON.stringify([plan.cron]))throw Error('Unexpected research schedule');
 const settings=await api('GET',path+'/settings'),dir=await mkdtemp(resolve(tmpdir(),'cw08-transport-')),file=resolve(dir,'worker.mjs');
 ensureFrozenHistory(repo);
 const bundle=await buildShadow(file),metadata=updateMetadata(settings,bundle),source=await readFile(file,'utf8');
 const keys=async()=>{let result=[],cursor;do{const url=new URL('https://api.cloudflare.com/client/v4/accounts/'+account+'/storage/kv/namespaces/'+plan.evidenceKV+'/keys');url.searchParams.set('prefix','receipts/');url.searchParams.set('limit','1000');if(cursor)url.searchParams.set('cursor',cursor);const r=await fetch(url,{headers:{Authorization:'Bearer '+env.CLOUDFLARE_API_TOKEN}});if(!r.ok)throw Error('Receipt inventory unavailable');const d=await r.json();if(!d.success)throw Error('Receipt inventory rejected');result.push(...d.result.map(x=>({name:x.name,sha:x.metadata?.sha256})));cursor=d.result_info?.cursor;}while(cursor);return result;};
 const before=await keys();if(before.length<339||before.some(x=>!x.name.endsWith('/'+x.sha+'.json')))throw Error('Receipt identity check failed');
 const beforeStatus=await (await fetch('https://'+plan.worker+'.sevans70.workers.dev/status')).json();if(!beforeStatus.ready||beforeStatus.production!==false||beforeStatus.releaseApproved!==false||beforeStatus.pendingUploads||beforeStatus.lastStorageError)throw Error('Research preflight failed');
 if(await version('sach-sports-cloudflare-test')!==dashboardVersion||await version(plan.worker)!==plan.replaceVersion)throw Error('Deployment version fence failed');
 const form=new FormData();form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));form.append('worker.mjs',new Blob([source],{type:'application/javascript+module'}),'worker.mjs');
 // Only mutation: upload research code with existing namespaces and retained secrets.
 await api('PUT',path,form);
 const afterSettings=await api('GET',path+'/settings'),afterSchedules=await api('GET',path+'/schedules'),after=await keys(),mapped=new Map(after.map(x=>[x.name,x.sha]));
 const bindings=x=>JSON.stringify(x.bindings.map(b=>({name:b.name,type:b.type,namespace:b.namespace_id||null,class:b.class_name||null})).sort((a,b)=>a.name.localeCompare(b.name)));
 if(bindings(settings)!==bindings(afterSettings)||JSON.stringify(schedules)!==JSON.stringify(afterSchedules)||before.some(x=>mapped.get(x.name)!==x.sha)||await version('sach-sports-cloudflare-test')!==dashboardVersion)throw Error('Post-upload integrity check failed; stop and restore previous research version');
 const status=await (await fetch('https://'+plan.worker+'.sevans70.workers.dev/status')).json();if(!status.ready||status.production!==false||status.releaseApproved!==false||status.receipts<beforeStatus.receipts||status.lastStorageError)throw Error('Post-upload research status failed; stop and restore previous research version');
 console.log(JSON.stringify({kind:'cw08_transport_updated',commit:head,bundle,version:await version(plan.worker),receiptsBefore:before.length,allExistingReceiptIdentitiesPreserved:true,cronUnchanged:true,bindingsUnchanged:true,dashboardUntouched:true,status:{receipts:status.receipts,completedCycles:status.completedCycles,pendingUploads:status.pendingUploads,sourceTransport:status.sourceTransport}}));
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(import.meta.filename))await update();
