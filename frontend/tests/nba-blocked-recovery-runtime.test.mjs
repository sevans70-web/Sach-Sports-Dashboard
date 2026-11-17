import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {rolldown} from 'rolldown';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {workerModelRuntimePlugin} from '../build/worker-model-runtime.mjs';

test('uncached Rebounds/Assists/Threes recover exact validated inputs after restart; absent inputs block capture instead of retrying403',{timeout:180000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'nba-blocked-real-'));let mf;
 const markets=['rebounds','assists','threes_made'],calls=[],ledger={worker_pregame_originals:new Map(),worker_pregame_picks:new Map()};let mode='recorded';
 try{
  execFileSync('tar',['-xzf',resolve('../docs/audits/2026-11-17-r1-durable-release/current-inputs.tar.gz'),'-C',dir]);
  const manifest=JSON.parse(await readFile(join(dir,'current-history-manifest.json'))),clock=Date.parse(manifest.finishedAt),sources=new Map();
  for(const receipt of manifest.receipts){const body=await readFile(join(dir,'sources',receipt.file),'utf8');assert.equal(createHash('sha256').update(body).digest('hex'),receipt.sha256);sources.set(receipt.source,{payload:JSON.parse(body),observedAt:receipt.observedAt});}
  const boards={};for(const market of markets){const b=JSON.parse(await readFile(join(dir,'nba-'+market+'.json')));boards[market]={...b,rows:b.rows.map(({researchForecast,estimatedEv,pregameProbability,forecastCapturedAt,...row})=>row)};}
  const entry=`
import {withEnv} from 'cloudflare:workers';
import {dashboardJobClass} from '${resolve('jobs/coordinator.mjs')}';
import {attachFittedResearchForecasts} from '${resolve('lib/live-model-forecast.ts')}';
import {selectNbaCandidates} from '${resolve('lib/nba-ranking-candidates.ts')}';
import {nbaHistoryUnavailable} from '${resolve('lib/nba-history-availability.ts')}';
import {nbaOfficialFetch} from '${resolve('lib/official-history-source.ts')}';
import {validateNbaHistoryEvidence} from '${resolve('lib/nba-history-evidence.ts')}';
let clock=${clock};const NativeDate=Date;globalThis.Date=class extends NativeDate{constructor(...a){super(...(a.length?a:[clock]))}static now(){return clock}};
async function forecast(input){
 const fitted=await attachFittedResearchForecasts(input,'nba',clock),rows=selectNbaCandidates(fitted.rows,input.market,clock),board={...fitted,rows};
 const priced=input.rows.length;board.quoteMatchAudit={...board.quoteMatchAudit,integrityVerifiedQuotes:priced};
 if(nbaHistoryUnavailable(board))return Response.json({...board,success:false,reason:'nba_official_history_unavailable'},{status:503});
 return Response.json({...board,success:true});
}
const Base=dashboardJobClass({dashboard:{async fetch(r,env){
 // The actual optional season-baseline call/catch from loadNbaOverview is
 // replayed before the actual forecast. No statistics are manufactured.
 try{const response=await nbaOfficialFetch('https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/statistics/byathlete?season=2026');if(!response.ok)throw Error('optional baseline unavailable');}catch{}
 const market=new URL(r.url).searchParams.get('market');return forecast(JSON.parse(await env.VINEXT_KV_CACHE.get('test-input:'+market)));
}}});
export class RecoveryQueue extends Base{
 async arm(){} now(){return clock;}
 control(action,value){
  if(action==='seed'){for(const {source,payload,observedAt} of value)this.writeNbaHistoryEvidence(validateNbaHistoryEvidence(source,payload,observedAt,clock));return true;}
  if(action==='step'){const due=this.rows("SELECT MIN(due) AS due FROM jobs WHERE state='active'")[0]?.due;if(due!=null)clock=Math.max(clock+1001,due+1);return this.alarm().then(()=>this.status());}
  if(action==='inspect')return {status:this.status(),checks:this.rows("SELECT name FROM sqlite_master WHERE name='nba_history_checks'").length?this.rows('SELECT source,sha,verified FROM nba_history_checks ORDER BY source'):[],originals:this.documents('original-marker')};
  if(action==='marker'){this.document('original-marker','preserved',{projection:12,probability:.61,ev:-2,at:'original-time'});return true;}
  if(action==='enqueue')return this.enqueue(value);throw Error('invalid_control');
 }
}
export default{async fetch(r,env){const body=await r.json();if(body.clock)clock=body.clock;if(body.action==='forecast')return forecast(body.board);return Response.json(await env.DASHBOARD_JOBS.getByName(body.lane||'capture:nba').control(body.action,body.value));}};`;
  await writeFile(join(dir,'entry.mjs'),entry);const model=workerModelRuntimePlugin(),build=await rolldown({input:join(dir,'entry.mjs'),platform:'neutral',external:['cloudflare:workers',/^node:/],plugins:[{name:'aliases',resolveId(id){if(id==='next/server')return resolve('tests/fixtures/ranking-framework.mjs');if(id.startsWith('@/'))return resolve(id.slice(2)+'.ts');}},{name:model.name,transform:model.transform}]});await build.write({file:join(dir,'worker.mjs'),format:'esm'});await build.close();
  const boot=()=>{const o=convertV4MiniflareOptions({modules:true,modulesRoot:dir,scriptPath:join(dir,'worker.mjs'),compatibilityDate:'2026-11-06',compatibilityFlags:['nodejs_compat'],resourcePersistencePath:join(dir,'persistence'),durableObjects:{DASHBOARD_JOBS:{className:'RecoveryQueue',useSQLite:true}},kvNamespaces:['VINEXT_KV_CACHE'],bindings:{SUPABASE_URL:'https://isolated.supabase.co',SUPABASE_SECRET_KEY:'synthetic-local-only'},outboundService:async r=>{
   const u=new URL(r.url);calls.push({method:r.method,path:u.origin+u.pathname,mode});
   if(u.hostname==='isolated.supabase.co'){
    const table=ledger[u.pathname.split('/').at(-1)];if(!table)return Response.json([]);
    const key=x=>[x.sport,x.market,x.game_id,x.player_id].join('|');
    if(r.method==='POST'){for(const row of await r.json())if(!table.has(key(row)))table.set(key(row),row);return new Response(null,{status:201});}
    return Response.json([...table.values()].filter(x=>x.sport===u.searchParams.get('sport')?.slice(3)&&x.market===u.searchParams.get('market')?.slice(3)));
   }
   assert.equal(r.method,'GET');if(mode==='recorded'&&sources.has(r.url)){const s=sources.get(r.url);return Response.json(s.payload,{headers:{'x-sach-observed-at':s.observedAt}});}
   return Response.json({error:'recorded_HTTP403_access_denial'},{status:403});
  }});o.workers[0].config.limits={subrequests:350,cpuMs:30000};return new Miniflare(o);};
  const call=async(action,value,lane='capture:nba')=>{const r=await mf.dispatchFetch('https://isolated.test/control',{method:'POST',body:JSON.stringify({action,value,lane,...(action==='forecast'?{board:value}:{}),clock})});return {status:r.status,body:await r.json()};};
  mf=await boot();const reference={};for(const m of markets){const r=await call('forecast',boards[m]);assert.equal(r.status,200);assert.equal(r.body.rows.length,25);reference[m]=r.body;}
  // Dispose all module caches; durable source storage is the only history
  // recovery path. No cached market board is seeded.
  await mf.dispose();mf=await boot();await call('marker');const items=[...sources].map(([source,s])=>({source,...s}));
  for(let i=0;i<items.length;i+=5)assert.equal((await call('seed',items.slice(i,i+5))).body,true);
  const before=(await call('inspect')).body;mode='denied';calls.length=0;const proof=[];
  for(const m of markets){const r=await call('forecast',boards[m]);assert.equal(r.status,200);assert.equal(r.body.rows.length,25);const shape=b=>b.rows.map(x=>({id:x.playerId,projection:x.researchForecast.projection,price:x.researchForecast.priceComparison,ev:x.estimatedEv}));assert.deepEqual(shape(r.body),shape(reference[m]),m);assert.ok(r.body.officialHistoryCoverage.sourceEvidence.every(e=>e.recovered));proof.push({market:m,uncachedRows:r.body.rows.length,exactProjectionProbabilityEvParity:true});}
  assert.deepEqual((await call('inspect')).body,before,'foreground cannot restamp source observations, successful checks or original marker');assert.ok(calls.every(c=>c.path.startsWith('https://isolated.supabase.co')),'no source HTTP is necessary for fresh validated discovery/finals');
  const kv=await mf.getKVNamespace('VINEXT_KV_CACHE');assert.equal((await kv.list()).keys.length,0,'no saved market board supplied recovery');
  for(const m of markets)await kv.put('test-input:'+m,JSON.stringify(boards[m]));
  const jobs=[];for(const m of markets){await call('enqueue',{id:'nba-recover-'+m,kind:'capture',sport:'nba',market:m,created:clock});let job;for(let phase=0;phase<7;phase++){const s=(await call('step')).body;job=s.jobs.find(j=>j.id==='nba-recover-'+m);if(job.state==='done'||job.state==='blocked')break;}assert.equal(job.state,'done',JSON.stringify(job));assert.ok(job.progress.lastCheckpointAt>0);assert.ok(job.stored>0);jobs.push({market:m,state:job.state,eligible:job.eligible,stored:job.stored,sourceCheckpoints:job.progress.sourceCheckpoints});}
  assert.equal(calls.filter(c=>c.path.endsWith('/statistics/byathlete')).length,1,'persistent exact-url403 is not retried for each market');
  const originals=JSON.stringify([...ledger.worker_pregame_originals]),picks=JSON.stringify([...ledger.worker_pregame_picks]);
  // A different empty source store reproduces the actual missing-evidence
  // condition. It must block immediately rather than run60-second rank loops.
  await call('enqueue',{id:'nba-no-evidence',kind:'capture',sport:'nba',market:'rebounds',created:clock},'capture:nba-empty');
  const blocked=(await call('step',null,'capture:nba-empty')).body.jobs[0];assert.equal(blocked.state,'blocked');assert.equal(blocked.attempts,1);assert.equal(blocked.lastError,'nba_history_evidence_unavailable');assert.equal(blocked.failureDetails.verifiedQuotes,25);assert.equal(blocked.progress.needsAttention,true);
  const hits=calls.length;await call('step',null,'capture:nba-empty');assert.equal(calls.length,hits,'blocked job cannot repeatedly retry denied sources');assert.equal(JSON.stringify([...ledger.worker_pregame_originals]),originals);assert.equal(JSON.stringify([...ledger.worker_pregame_picks]),picks);
  assert.deepEqual((await call('inspect')).body.originals,before.originals);
  console.log('NBA_RECORDED403_RECOVERY',JSON.stringify({scope:'isolated workerd, actual captured2026-11-17 source bodies/quotes and frozen snapshot clock; no production access',markets:proof,jobs,missingEvidence:{state:blocked.state,attempts:blocked.attempts,details:blocked.failureDetails},originalRecordsPreserved:true,foregroundProviderHistoryCalls:0}));
 }finally{await mf?.dispose();await rm(dir,{recursive:true,force:true});}
});
