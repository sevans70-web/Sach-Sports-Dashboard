import test from 'node:test';import assert from 'node:assert/strict';
import {updateMetadata,update} from '../shadow/cw08/update-transport.mjs';
const bundle={bytes:151874,sha256:'c6a71a74051e42a9f6642944b6f9e247be3c4b3f74c96cd84319fb0dbb4959e4'};
const settings=()=>({compatibility_date:'2026-11-14',compatibility_flags:['nodejs_compat'],tags:['cw08-shadow-managed','cw08-bundle:03602bcf9ad3448c8ff5db9901eaeca148e8e75d5bc462a354706d5e521f12b1'],bindings:[{name:'BOOTSTRAP_TOKEN',type:'secret_text'},{name:'OWLS_INSIGHT_API_KEY',type:'secret_text'},{name:'EVIDENCE',type:'kv_namespace',namespace_id:'94a4f6693e144aa1ae92d2939d563014'},{name:'STUDY',type:'durable_object_namespace',class_name:'NhlShadowCoordinator',namespace_id:'24d604463d7f410f880ba8366769e853'}],limits:{cpu_ms:30000,subrequests:1000},observability:{enabled:true},tail_consumers:[],logpush:false});
test('code-only research update retains secret bindings without copying secret values and reuses existing resources',()=>{
 const m=updateMetadata(settings(),bundle);assert.deepEqual(m.keep_bindings,['secret_text']);assert.equal(m.bindings.length,2);assert.ok(m.bindings.every(b=>b.type!=='secret_text'&&!('text' in b)));assert.equal(m.exports.NhlShadowCoordinator.storage,'sqlite');assert.equal(m.bindings.find(b=>b.name==='EVIDENCE').namespace_id,settings().bindings[2].namespace_id);assert.ok(!('migrations' in m));
});
test('research updater rejects unknown namespaces, secrets, source bundles and versions before mutation',async()=>{
 for(const change of [s=>s.bindings[2].namespace_id='wrong',s=>s.bindings[3].namespace_id='wrong',s=>s.bindings.push({name:'UNEXPECTED',type:'secret_text'}),s=>s.tags=[],s=>s.compatibility_flags=[]]){const s=settings();change(s);assert.throws(()=>updateMetadata(s,bundle));}
 assert.throws(()=>updateMetadata(settings(),{...bundle,bytes:1}));await assert.rejects(update({}),/Exact commit approval/);
});
test('research bundle is byte-identical from repository and application working directories',async()=>{
 const {execFileSync}=await import('node:child_process'),{mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{resolve}=await import('node:path');
 const app=resolve(import.meta.dirname,'..'),repo=resolve(app,'..'),work=await mkdtemp(resolve(tmpdir(),'cw08-repro-'));
 try{for(const cwd of [repo,app]){const got=JSON.parse(execFileSync(process.execPath,[resolve(app,'shadow/cw08/build.mjs'),resolve(work,'worker.mjs')],{cwd,encoding:'utf8'}));assert.deepEqual(got,bundle);}}finally{await rm(work,{recursive:true,force:true});}
});
