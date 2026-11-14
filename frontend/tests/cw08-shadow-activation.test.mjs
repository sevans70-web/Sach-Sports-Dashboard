import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {resolve,join} from 'node:path';
import {activationGuard,workerMetadata,plan} from '../shadow/cw08/activate.mjs';import {buildShadow} from '../shadow/cw08/build.mjs';
const sha='a'.repeat(40),env={CF_CW08_PAUSE_VERIFIED_AT:new Date().toISOString(),CF_CW08_PAUSE_TRIGGER:plan.dashboardTrigger,CF_CW08_ACTIVATION:'approved',CF_CW08_APPROVED_COMMIT:sha,CLOUDFLARE_API_TOKEN:'synthetic-build-token',OWLS_INSIGHT_API_KEY:'synthetic-feed-token'};
test('activation requires explicit approval for the exact commit and Cloudflare-only credentials',()=>{
 assert.doesNotThrow(()=>activationGuard(env,sha));for(const patch of [{CF_CW08_ACTIVATION:''},{CF_CW08_APPROVED_COMMIT:'b'.repeat(40)},{CLOUDFLARE_API_TOKEN:''},{OWLS_INSIGHT_API_KEY:''},{CF_CW08_PAUSE_VERIFIED_AT:''},{CF_CW08_PAUSE_TRIGGER:'another-trigger'},{CF_CW08_PAUSE_VERIFIED_AT:new Date(Date.now()-16*60000).toISOString()},{CF_CW08_PAUSE_VERIFIED_AT:new Date(Date.now()+60000).toISOString()}])assert.throws(()=>activationGuard({...env,...patch},sha));
});
test('research deployment has only its own DO/namespace and two narrowly used secrets',()=>{
 const metadata=workerMetadata('synthetic-feed-token','synthetic-bootstrap-token','c'.repeat(64),'d'.repeat(32));
 assert.equal(plan.activationRequiresUserApproval,true);assert.equal(plan.automaticPromotion,false);assert.notEqual(plan.worker,plan.productionWorker);
 assert.deepEqual(metadata.bindings.map(b=>b.name),['STUDY','EVIDENCE','OWLS_INSIGHT_API_KEY','BOOTSTRAP_TOKEN']);assert.equal(metadata.bindings.find(b=>b.name==='EVIDENCE').namespace_id,'d'.repeat(32));
 assert.ok(!JSON.stringify(metadata).includes('synthetic-build-token'));assert.ok(!JSON.stringify(metadata).includes('SUPABASE'));assert.ok(!JSON.stringify(metadata).includes('VINEXT'));
 assert.equal(metadata.observability.traces.enabled,true);
});
test('production research bundle excludes local test controls and production writers',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'cw08-bundle-test-'));try{const out=join(dir,'worker.mjs'),result=await buildShadow(out),code=await readFile(out,'utf8');assert.ok(result.bytes<500000);for(const forbidden of ['/__test','testFault','testNow','SUPABASE_SECRET_KEY','VINEXT_KV_CACHE','supabase.co','saveNhlSlate','saveForecast','__CW08_IMPLEMENTATION_DIGEST__'])assert.ok(!code.includes(forbidden),forbidden);assert.ok(code.includes('NhlShadowCoordinator'));}finally{await rm(dir,{recursive:true,force:true});}
});
