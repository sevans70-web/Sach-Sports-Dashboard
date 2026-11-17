import test from 'node:test';import assert from 'node:assert/strict';import {readFile,mkdtemp,readdir,writeFile,rm,cp} from 'node:fs/promises';import {gunzipSync} from 'node:zlib';import {join,resolve} from 'node:path';import {tmpdir} from 'node:os';import {Miniflare,convertV4MiniflareOptions} from 'miniflare';import {loadTs} from './load-ts.mjs';
const {selectNbaCandidates}=await loadTs(new URL('../lib/nba-ranking-candidates.ts',import.meta.url));const {scopedNbaBoard}=await loadTs(new URL('../lib/nba-slate-scope.ts',import.meta.url));
const enabled=!!process.env.SACH_NBA_COMPARISON_BUNDLE,expected=process.env.SACH_EXPECT_DENIAL_COLLAPSE==='1';
const board=JSON.parse(gunzipSync(await readFile(new URL('./fixtures/nba-points-recovery-2026-11-16.json.gz',import.meta.url)))),now=Date.parse(board.updatedAt)+1000;
test('exact shipping NBA Points forecast path: mixed athlete403 must not erase other eligible snapshot-backed forecasts',{skip:!enabled},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'nba-compiled-denial-'));let mf;
 try{
  await cp(resolve(process.env.SACH_NBA_COMPARISON_BUNDLE),dir,{recursive:true});const files=(await readdir(dir,{recursive:true})).filter(p=>p.endsWith('.js'));const forecast=files.find(p=>/live-model-forecast-/.test(p));assert.ok(forecast);
  const denied=new Set(board.rows.slice(0,4).map(r=>String(r.playerId))),calls=[];
  await writeFile(join(dir,'comparison.mjs'),`import {t as attach} from './${forecast}';const NativeDate=Date;globalThis.Date=class extends NativeDate{constructor(...a){super(...(a.length?a:[${now}]))}static now(){return ${now}}};export default{async fetch(r){const p=await r.json();return Response.json(await attach(p,'nba',Date.now()));}};`);
  const opts=convertV4MiniflareOptions({name:'nba-compiled-comparison',modules:[{type:'ESModule',path:join(dir,'comparison.mjs')},...files.map(p=>({type:'ESModule',path:join(dir,p)}))],modulesRoot:dir,compatibilityDate:'2026-11-06',compatibilityFlags:['nodejs_compat'],outboundService:req=>{
   const u=new URL(req.url);if(u.pathname.endsWith('/gamelog')){const id=u.pathname.split('/').at(-2);calls.push(id);return denied.has(id)?new Response('{}',{status:403}):Response.json({seasonTypes:[],events:{}});}
   throw Error('Unexpected source '+u.origin+u.pathname);
  }});opts.workers[0].config.limits={subrequests:350,cpuMs:30000};mf=new Miniflare(opts);
  const original=JSON.stringify(board),response=await mf.dispatchFetch('https://comparison.test/points',{method:'POST',body:JSON.stringify(board)});assert.equal(response.status,200);const b=await response.json(),rows=selectNbaCandidates(b.rows,'points',now),api=scopedNbaBoard({...b,rows},'points','2026-11-16',now);
  assert.equal(JSON.stringify(board),original,'source evidence never mutated');
  if(expected){assert.equal(rows.length,0);assert.ok(calls.length<board.rows.length);}
  else{assert.ok(rows.length>0);assert.equal(new Set(calls).size,25);assert.ok(rows.every(r=>!denied.has(String(r.playerId))));assert.ok(api.evDiagnostics.available>0);assert.equal(api.evDiagnostics.available+api.evDiagnostics.unavailable,rows.length);}
  const recovered=api.rows.map(r=>({id:r.playerId,projection:r.researchForecast.projection,probabilities:r.researchForecast.priceComparison,ev:r.nbaEv.percent}));
  if(process.env.SACH_COMPARISON_REFERENCE)assert.deepEqual(recovered,JSON.parse(await readFile(process.env.SACH_COMPARISON_REFERENCE)));
  if(process.env.SACH_COMPARISON_OUTPUT)await writeFile(process.env.SACH_COMPARISON_OUTPUT,JSON.stringify(recovered,null,2));
  console.log('COMPILED_NBA_COMPARISON',JSON.stringify({artifact:process.env.SACH_NBA_COMPARISON_BUNDLE,expectedCollapse:expected,rows:rows.length,requests:calls.length,deniedAthletes:[...denied],forecastReasons:b.forecastBlockers,ev:api.evDiagnostics}));
 }finally{await mf?.dispose();await rm(dir,{recursive:true,force:true});}
});
