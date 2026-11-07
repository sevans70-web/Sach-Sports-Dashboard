import test from 'node:test';import assert from 'node:assert/strict';
import {resolve} from 'node:path';import {gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
import {partitionModelRuntime,workerModelRuntimePlugin} from '../build/worker-model-runtime.mjs';
const partitions=partitionModelRuntime(resolve('model-runtime'));
test('Worker model partitions preserve digest and contain only required sport/markets',()=>{
 for(const [key,part]of Object.entries(partitions)){
  const bytes=Buffer.from(part.bytes,'base64');assert.equal(createHash('sha256').update(bytes).digest('hex'),part.sha256);
  const data=JSON.parse(gunzipSync(bytes)),[sport,market]=key.split('|');
  assert.ok(data.digest);assert.ok(data.models.length);assert.ok(data.observations.length);
  assert.ok(data.observations.every(g=>g.sport===sport));
  if(!['pts_rebs_asts','pts_rebs','pts_asts','rebs_asts'].includes(market))assert.ok(data.observations.every(g=>g.market===market));
  assert.ok(gunzipSync(bytes).length<20*1024*1024);
 }
});
test('Vite replacement runs without filesystem access in the runtime module',()=>{
 const code=workerModelRuntimePlugin().transform('',resolve('lib/worker-model-runtime.ts'));
 assert.ok(!code.includes('readFileSync'));assert.ok(code.includes('checksum mismatch'));
 assert.equal(workerModelRuntimePlugin().transform('',resolve('lib/other.ts')),undefined);
});
test('embedded loader executes without disk reads and combines the original component models',async()=>{
 const code=workerModelRuntimePlugin().transform('',resolve('lib/worker-model-runtime.ts'));
 const runtime=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
 const points=runtime.workerModelRuntime('nba','points');
 assert.equal(points.models[0].group,'nba|points');assert.ok(points.observations.length>1000);
 assert.equal(runtime.workerModelRuntime('nba','points'),points,'repeat requests reuse the checked partition');
 const combo=runtime.workerModelRuntime('nba','pts_rebs');
 assert.deepEqual(combo.models.map(m=>m.group),['nba|points','nba|rebounds']);
 assert.equal(combo.digest,points.digest);
 assert.deepEqual(combo.observations.filter(g=>g.market==='points'),points.observations);
 assert.equal(runtime.workerModelRuntime('cbb','points').models[0].group,'cbb|points');
 const reloaded=runtime.workerModelRuntime('nba','points');
 assert.notEqual(reloaded,points,'switching markets evicts the previous decoded partition');
 assert.deepEqual(reloaded,points,'eviction preserves the original model and observations');
 assert.equal(runtime.workerModelRuntime('nfl','passing_yards'),null);
 assert.equal(runtime.workerModelRuntime('nba','first_basket'),null);
});
