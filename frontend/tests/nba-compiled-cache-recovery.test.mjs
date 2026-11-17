import test from 'node:test';import assert from 'node:assert/strict';import {readFile,mkdtemp,readdir,writeFile,rm,cp} from 'node:fs/promises';import {gunzipSync} from 'node:zlib';import {join,resolve} from 'node:path';import {tmpdir} from 'node:os';import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
const enabled=!!process.env.SACH_NBA_COMPARISON_BUNDLE;
const recorded=JSON.parse(gunzipSync(await readFile(new URL('../../docs/audits/2026-11-15-release-blockers/recorded-browser-inputs.json.gz',import.meta.url)))).files;
const markets=['points','rebounds','assists','threes_made','pts_rebs_asts','pts_rebs','pts_asts'],now=Date.parse('2026-11-15T15:54:10Z');
test('actual compiled NBA ranking routes recover seven recorded markets from existing KV during denied feeds, including cold concurrency',{skip:!enabled,timeout:180000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'nba-compiled-cache-'));let mf;const writes=[],calls=[];
 try{
  await cp(resolve(process.env.SACH_NBA_COMPARISON_BUNDLE),dir,{recursive:true});const files=(await readdir(dir,{recursive:true})).filter(p=>p.endsWith('.js'));
  await writeFile(join(dir,'cache-test.mjs'),`import dashboard from './index.js';export {DashboardJobQueue} from './index.js';const NativeDate=Date;globalThis.Date=class extends NativeDate{constructor(...a){super(...(a.length?a:[${now}]))}static now(){return ${now}}};export default dashboard;`);
  const opts=convertV4MiniflareOptions({name:'nba-compiled-cache',modules:[{type:'ESModule',path:join(dir,'cache-test.mjs')},...files.map(p=>({type:'ESModule',path:join(dir,p)}))],modulesRoot:dir,compatibilityDate:'2026-11-06',compatibilityFlags:['nodejs_compat'],kvNamespaces:['VINEXT_KV_CACHE'],durableObjects:{DASHBOARD_JOBS:{className:'DashboardJobQueue',useSQLite:true}},serviceBindings:{ASSETS:()=>new Response(null,{status:404})},bindings:{SUPABASE_URL:'https://db.supabase.co',SUPABASE_SECRET_KEY:'synthetic-test-only',OWLS_INSIGHT_API_KEY:'synthetic-test-only'},outboundService:req=>{
   const u=new URL(req.url);calls.push(u.origin+u.pathname);if(req.method!=='GET'){writes.push(req.method+' '+u.pathname);throw Error('Test forbids production/history writes');}
   if(u.hostname==='db.supabase.co')return Response.json([]);
   return new Response('{}',{status:403});
  }});opts.workers[0].config.limits={subrequests:350,cpuMs:30000};mf=new Miniflare(opts);const kv=await mf.getKVNamespace('VINEXT_KV_CACHE');const snapshots=new Map();
  for(const market of markets){const board=recorded['nba-'+market+'.json'],key='sach:pregame-board:v1:nba:2026-11-15:'+market,value=JSON.stringify({capturedAt:Date.parse(board.updatedAt),pregameOnly:true,board:{...board,boardDay:'2026-11-15'}});snapshots.set(key,value);await kv.put(key,value);}
  const check=async market=>{const response=await mf.dispatchFetch('https://test/api/nba/rankings?market='+market+'&day=2026-11-15'),body=await response.json();assert.equal(response.status,200,JSON.stringify(body));assert.equal(body.dataState,'stale',JSON.stringify(body));assert.ok(body.coverageNotice);assert.equal(body.rows.length,recorded['nba-'+market+'.json'].rows.length,market);assert.deepEqual(body.rows.map(r=>r.researchForecast),recorded['nba-'+market+'.json'].rows.map(r=>r.researchForecast));assert.ok(body.evDiagnostics.available>0);return {market,rows:body.rows.length,ev:body.evDiagnostics};};
  const results=await Promise.all(markets.slice(0,2).map(check));for(const market of markets.slice(2))results.push(await check(market));
  for(const [key,value]of snapshots)assert.equal(await kv.get(key),value,'outage recovery must not overwrite cached evidence');assert.deepEqual(writes,[]);assert.ok(calls.length>0,'must exercise failed upstream, not mock route responses');console.log('COMPILED_NBA_CACHE_RECOVERY',JSON.stringify({results,upstreamCalls:calls.length,writes:writes.length}));
 }finally{await mf?.dispose();await rm(dir,{recursive:true,force:true});}
});
