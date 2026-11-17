import test from 'node:test';import assert from 'node:assert/strict';import {readFile,mkdtemp,readdir,writeFile,rm,cp} from 'node:fs/promises';import {gunzipSync} from 'node:zlib';import {join,resolve} from 'node:path';import {tmpdir} from 'node:os';import {Miniflare,convertV4MiniflareOptions} from 'miniflare';import {loadTs} from './load-ts.mjs';
const {selectNbaCandidates}=await loadTs(new URL('../lib/nba-ranking-candidates.ts',import.meta.url));const {scopedNbaBoard}=await loadTs(new URL('../lib/nba-slate-scope.ts',import.meta.url));
const recorded=JSON.parse(gunzipSync(await readFile(new URL('../../docs/audits/2026-11-15-release-blockers/recorded-browser-inputs.json.gz',import.meta.url)))).files;
const markets=['points','rebounds','assists','threes_made','pts_rebs_asts','pts_rebs','pts_asts'],now=Date.parse('2026-11-15T15:54:10Z'),enabled=!!process.env.SACH_PROFILE_BUNDLE,failed=process.env.SACH_PROFILE_FAILED==='1';
for(const allDenied of [false,true])test('compiled NBA7 '+(allDenied?'genuine full denial must abstain':'existing initial public profile contract'),{skip:!enabled,timeout:180000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'nba-profile-'));let mf;const calls=[],results={};
 try{
  await cp(resolve(process.env.SACH_PROFILE_BUNDLE),dir,{recursive:true});const files=(await readdir(dir,{recursive:true})).filter(p=>p.endsWith('.js')),forecast=files.find(p=>/live-model-forecast-/.test(p));assert.ok(forecast);
  await writeFile(join(dir,'profile.mjs'),`import {t as attach} from './${forecast}';const NativeDate=Date;globalThis.Date=class extends NativeDate{constructor(...a){super(...(a.length?a:[${now}]))}static now(){return ${now}}};export default{async fetch(r){const p=await r.json();return Response.json(await attach(p,'nba',Date.now()));}};`);
  const opts=convertV4MiniflareOptions({name:'nba-profile',modules:[{type:'ESModule',path:join(dir,'profile.mjs')},...files.map(p=>({type:'ESModule',path:join(dir,p)}))],modulesRoot:dir,compatibilityDate:'2026-11-06',compatibilityFlags:['nodejs_compat'],outboundService:req=>{
   const u=new URL(req.url);assert.ok(u.pathname.endsWith('/gamelog'),'unexpected outbound '+u.pathname);const agent=req.headers.get('User-Agent');calls.push({path:u.pathname,agent});return allDenied||agent!=='Mozilla/5.0 (compatible; SachSports/1.0)'?new Response('{}',{status:403}):Response.json({seasonTypes:[],events:{}});
  }});opts.workers[0].config.limits={subrequests:350,cpuMs:30000};mf=new Miniflare(opts);
  for(const market of markets){const original=JSON.stringify(recorded['nba-'+market+'.json']),r=await mf.dispatchFetch('https://test/forecast',{method:'POST',body:original});assert.equal(r.status,200);const b=await r.json(),rows=selectNbaCandidates(b.rows,market,now),api=scopedNbaBoard({...b,rows},market,'2026-11-15',now);
   results[market]={count:rows.length,ev:api.evDiagnostics,rows:rows.map(row=>({id:row.playerId,projection:row.researchForecast.projection,pricing:row.researchForecast.priceComparison,forecast:row.researchForecast.reason}))};
   if(allDenied||failed)assert.equal(rows.length,0,market);else assert.ok(rows.length>0,market);assert.equal(JSON.stringify(recorded['nba-'+market+'.json']),original);
  }
  if(!allDenied&&process.env.SACH_PROFILE_REFERENCE)assert.deepEqual(results,JSON.parse(await readFile(process.env.SACH_PROFILE_REFERENCE)));
  if(!allDenied&&process.env.SACH_PROFILE_OUTPUT)await writeFile(process.env.SACH_PROFILE_OUTPUT,JSON.stringify(results,null,2));
  console.log('NBA_PROFILE_CONTRACT',JSON.stringify({allDenied,failed,counts:Object.fromEntries(Object.entries(results).map(([m,v])=>[m,{rows:v.count,ev:v.ev}])),calls:calls.length,agents:[...new Set(calls.map(c=>c.agent))]}));
 }finally{await mf?.dispose();await rm(dir,{recursive:true,force:true});}
});
