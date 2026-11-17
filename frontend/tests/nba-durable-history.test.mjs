import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {rolldown} from 'rolldown';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {loadTs} from './load-ts.mjs';
const fixtures=JSON.parse(gunzipSync(await readFile(new URL('./fixtures/nba-official-censuses-2026-11-15.json.gz',import.meta.url))));
const now=Date.parse(fixtures.provenance.revalidatedAt),future=new Date(now+86400000).toISOString();
// Discovery envelopes are an explicit test contract indexed from actual raw
// fixture identities, not a claimed ESPN gamelog response or complete live slate.
const players=new Map();for(const f of fixtures.accepted)for(const team of f.payload.boxscore.players)for(const p of team.statistics[0].athletes){const id=String(p.athlete.id),events=players.get(id)||[];events.push(f);players.set(id,events);}
const uncovered=new Set(fixtures.accepted.map(f=>f.source)),cohort=[];
while(uncovered.size){const [id,events]=[...players].sort((a,b)=>b[1].filter(f=>uncovered.has(f.source)).length-a[1].filter(f=>uncovered.has(f.source)).length)[0];assert.ok(events.some(f=>uncovered.has(f.source)));cohort.push(id);for(const f of events)uncovered.delete(f.source);players.delete(id);}
const rows=cohort.map(playerId=>({playerId,season:'2027',gameTime:future,gameState:'pre'}));
const sources=Object.fromEntries(fixtures.accepted.map(f=>[f.source,f.payload]));
for(const playerId of cohort){
 const events=fixtures.accepted.filter(f=>f.payload.boxscore.players.some(t=>t.statistics[0].athletes.some(p=>String(p.athlete.id)===playerId)));
 const metadata=events.map(f=>{
  const team=f.payload.boxscore.players.find(t=>t.statistics[0].athletes.some(p=>String(p.athlete.id)===playerId));
  const competition=f.payload.header.competitions[0],own=competition.competitors.find(s=>String(s.team.id)===String(team.team.id)),other=competition.competitors.find(s=>s!==own);
  assert.equal(typeof own.winner,'boolean');assert.equal(own.winner,Number(own.score)>Number(other.score));
  return [f.payload.header.id,{gameDate:competition.date,gameResult:own.winner?'W':'L'}];
 });
 sources[`https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${playerId}/gamelog?season=2027`]={athlete:{id:playerId},events:Object.fromEntries(metadata),seasonTypes:[{displayName:'Regular Season',categories:[{type:'event',events:events.map(f=>({eventId:f.payload.header.id}))}]}]};
}
assert.ok(Object.values(sources).some(p=>Object.values(p.events||{}).some(e=>e.gameResult==='L')),'the discovery contract must include real losses, not an always-W placeholder');
const entry=`
import {withEnv} from 'cloudflare:workers';
import {dashboardJobClass} from '${resolve('jobs/coordinator.mjs')}';
import {runJobBudget} from '${resolve('jobs/budget.mjs')}';
import {refreshNbaObservations} from '${resolve('lib/live-basketball-observations.ts')}';
import {configuredNbaEvidence} from '${resolve('lib/nba-durable-history.ts')}';
let clock=${now};const NativeDate=Date;globalThis.Date=class extends NativeDate{constructor(...a){super(...(a.length?a:[clock]))}static now(){return clock}};
const Base=dashboardJobClass({dashboard:{fetch(){throw Error('No dashboard or ledger write')}}});
export class EvidenceQueue extends Base{
 now(){return clock;}
 inspect(){return {versions:this.rows("SELECT name FROM sqlite_master WHERE name='nba_history_versions'").length?this.rows('SELECT source,sha,body FROM nba_history_versions ORDER BY source,sha'):[],checks:this.rows("SELECT name FROM sqlite_master WHERE name='nba_history_checks'").length?this.rows('SELECT * FROM nba_history_checks ORDER BY source'):[],documents:this.documents('protected-test-marker')};}
 seed(){this.document('protected-test-marker','original',{savedAt:'original-time',projection:17,probability:.63,ev:7,grade:'original'});return this.inspect();}
 async background(args){let calls=0;const store={cacheRead:u=>this.cacheRead(u),cacheWrite:(u,v)=>this.cacheWrite(u,v),readNbaEvidence:s=>this.readNbaHistoryEvidence(s),writeNbaEvidence:v=>this.writeNbaHistoryEvidence(v)};const execution=await runJobBudget({env:this.env,store,gate:async()=>0,limit:args.requestLimit||220,cacheSources:true,allowNbaSourceDenials:true,now:()=>clock},async()=>refreshNbaObservations(args.rows,clock,async source=>{calls++;if(args.useHttp){const response=await fetch(source);if(!response.ok)throw Error('source unavailable');return response.json();}if(!args.sources[source])throw Error('HTTP429 test outage');return args.sources[source];},{evidence:configuredNbaEvidence()}),withEnv);return {...execution,calls};}
}
export default{async fetch(request,env){const a=await request.json();clock=a.clock??clock;try{
 if(a.action==='foreground'){let calls=0;const access=configuredNbaEvidence();const result=await refreshNbaObservations(a.rows,clock,async()=>{calls++;throw Error('HTTP403 test outage');},{evidence:access});return Response.json({result,calls,writeEnabled:Boolean(access?.write)});}
 const stub=env.DASHBOARD_JOBS.getByName(a.lane||'capture:nba');if(!['seed','inspect','background','readNbaHistoryEvidence','writeNbaHistoryEvidence'].includes(a.action))throw Error('test_action');return Response.json(await stub[a.action](...(a.args||[])));
 }catch(e){return Response.json({error:e.message,usage:e.usage});}}};`;

test('real official NBA censuses persist in the existing DO, recover after eviction, and retain seven-market calculations',{timeout:120000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'nba-durable-'));let mf;
 const boot=async()=>{const opts=convertV4MiniflareOptions({modules:true,modulesRoot:dir,scriptPath:join(dir,'worker.mjs'),compatibilityDate:'2026-11-06',compatibilityFlags:['nodejs_compat'],durableObjects:{DASHBOARD_JOBS:{className:'EvidenceQueue',useSQLite:true}},resourcePersistencePath:join(dir,'storage'),outboundService:request=>{assert.equal(request.method,'GET');assert.ok(sources[request.url],'No uncaptured production/provider requests permitted');return Response.json(sources[request.url]);}});opts.workers[0].config.limits={subrequests:350,cpuMs:30000};return new Miniflare(opts);};
 const call=async(action,args=[],clock=now,extra={})=>{const response=await mf.dispatchFetch('https://isolated.test/control',{method:'POST',body:JSON.stringify({action,args,clock,...extra})});assert.equal(response.status,200);return response.json();};
 try{
  await writeFile(join(dir,'entry.mjs'),entry);const bundle=await rolldown({input:join(dir,'entry.mjs'),platform:'neutral',external:['cloudflare:workers',/^node:/],plugins:[{name:'app-aliases',resolveId(id){if(id==='next/server')return resolve('tests/fixtures/ranking-framework.mjs');if(id.startsWith('@/'))return resolve(id.slice(2)+'.ts');}}]});await bundle.write({file:join(dir,'worker.mjs'),format:'esm'});await bundle.close();mf=await boot();
  const marker=await call('seed');const warm=await call('background',[{rows,sources}]);assert.equal(warm.error,undefined,JSON.stringify(warm));assert.ok(warm.calls>34);assert.equal(warm.result.observations.length,5382);assert.deepEqual(warm.result.unavailablePlayers,[]);assert.ok(warm.usage.cacheWrites>=34);
  const before=await call('inspect');assert.equal(before.versions.length,Object.keys(sources).length);
  await mf.dispose();mf=await boot();
  const cold=await call('foreground',[],now+60000,{rows});assert.equal(cold.error,undefined,JSON.stringify(cold));assert.equal(cold.calls,0);assert.equal(cold.writeEnabled,false);assert.deepEqual(cold.result.unavailablePlayers,[]);
  const sort=rs=>[...rs].sort((a,b)=>[a.gameId,a.playerId,a.market].join('|').localeCompare([b.gameId,b.playerId,b.market].join('|')));
  assert.deepEqual(sort(cold.result.observations),sort(warm.result.observations),'cold reads must retain actual inputs and source retrieval timestamps');assert.deepEqual(await call('inspect'),before,'read-only cold recovery changes no evidence, checks or originals');
  // Gamelog freshness is never extended by a failed request.
  const expired=await call('foreground',[],now+15*60000+1,{rows});assert.equal(expired.result.observations.length,0);assert.equal(expired.result.unavailablePlayers.length,rows.length);assert.deepEqual(await call('inspect'),before);
  // A new complete discovery can reuse known official finals during summary
  // 429s. Neither their first receipt nor last successful check is re-stamped.
  const logs=Object.fromEntries(Object.entries(sources).filter(([s])=>s.includes('/gamelog')));
  const recovered=await call('background',[{rows,sources:logs}],now+20*60000);assert.equal(recovered.error,undefined,JSON.stringify(recovered));assert.deepEqual(sort(recovered.result.observations),sort(warm.result.observations));assert.deepEqual(recovered.result.unavailablePlayers,[]);assert.ok(recovered.result.sourceEvidence.some(r=>r.source.includes('/summary?')&&r.recovered&&r.lastVerifiedAt===fixtures.provenance.revalidatedAt));
  const first=fixtures.accepted[0],original=await call('readNbaHistoryEvidence',[first.source],now+20*60000);
  const malformed=structuredClone(original);delete malformed.payload.boxscore.players[0].statistics[0].totals;
  const failed=await call('writeNbaHistoryEvidence',[malformed],now+20*60000);assert.equal(failed.error,'nba_evidence_incomplete_census');assert.deepEqual(await call('readNbaHistoryEvidence',[first.source],now+20*60000),original);
  const wrong=structuredClone(original);wrong.sha256='wrong';assert.equal((await call('writeNbaHistoryEvidence',[wrong],now+20*60000)).error,'nba_evidence_checksum_invalid');
  assert.equal(await call('writeNbaHistoryEvidence',[original],now+20*60000),false,'duplicate/older checks must not overwrite');
  // Keep the metadata for the removed event: losing a category reference is
  // truncation even when the orphaned events object still contains that ID.
  const [logSource,fullLog]=Object.entries(logs).find(([,p])=>p.seasonTypes[0].categories[0].events.length>1);
  const truncated=structuredClone(fullLog);truncated.seasonTypes[0].categories[0].events.pop();
  const {validateNbaHistoryEvidence}=await loadTs(new URL('../lib/nba-history-evidence.ts',import.meta.url));
  const partial=validateNbaHistoryEvidence(logSource,truncated,new Date(now+40*60000).toISOString(),now+40*60000);
  const checkpoint=await call('inspect',[],now+40*60000);
  assert.equal((await call('writeNbaHistoryEvidence',[partial],now+40*60000)).error,'nba_evidence_discovery_regression');
  assert.deepEqual(await call('inspect',[],now+40*60000),checkpoint,'a rejected truncation must atomically preserve the original body and successful-check timestamp');
  const affected=rows.find(r=>logSource.includes('/athletes/'+r.playerId+'/'));
  const partialRefresh=await call('background',[{rows:[affected],sources:{[logSource]:truncated}}],now+40*60000);
  assert.deepEqual(partialRefresh.result.unavailablePlayers,[affected.playerId]);assert.equal(partialRefresh.calls,1);assert.equal(partialRefresh.usage.cacheWrites,0);
  assert.deepEqual(await call('inspect',[],now+40*60000),checkpoint);
  assert.deepEqual((await call('inspect',[],now,{lane:'capture:nfl'})).versions,[]);assert.deepEqual((await call('inspect',[],now,{lane:'capture:nhl'})).versions,[]);assert.deepEqual((await call('inspect')).documents,marker.documents);
  const phases=[];let resumed,prior=0;
  for(let phase=0;phase<12;phase++){
   resumed=await call('background',[{rows,sources,useHttp:true,requestLimit:30}],now,{lane:'capture:nba-budget-rehearsal'});
   assert.ok(resumed.usage.used<=30);assert.ok(resumed.usage.maxActive<=4);
   const persisted=(await call('inspect',[],now,{lane:'capture:nba-budget-rehearsal'})).versions.length;
   phases.push({phase,used:resumed.usage.used,checkpoints:resumed.usage.cacheWrites,versions:persisted,error:resumed.error||null});
   if(!resumed.error)break;
   assert.equal(resumed.error,'job_subrequest_budget');assert.ok(resumed.usage.cacheWrites>0||persisted>prior,'a limited phase must make checkpoint progress');prior=persisted;
   if(phase===0){await mf.dispose();mf=await boot();}
  }
  assert.equal(resumed.error,undefined,JSON.stringify(phases));assert.ok(phases.length>1);assert.deepEqual(sort(resumed.result.observations),sort(warm.result.observations));
  console.log('NBA_SOURCE_BUDGET_RECOVERY',JSON.stringify({limit:30,phases,observations:resumed.result.observations.length}));

  // No invented historical values: compare unchanged models with the same
  // real observations, before/after storage. The future fixture is a declared
  // synthetic target; historical quote numbers test arithmetic only, not a bet.
  const {nbaCombinationHistory}=await loadTs(new URL('../lib/nba-combination-history.ts',import.meta.url));const {basketballFeatureIndex}=await loadTs(new URL('../lib/basketball-model-inputs.ts',import.meta.url));const {forecastDistribution,evaluatePrice}=await loadTs(new URL('../lib/probability-forecast.ts',import.meta.url));
  const base=JSON.parse(gunzipSync(await readFile('model-runtime/snapshot.json.gz'))),models=[...base.models,...JSON.parse(await readFile('model-runtime/nba-combination-models.json')).models];const recorded=JSON.parse(gunzipSync(await readFile('../docs/audits/2026-11-15-release-blockers/recorded-browser-inputs.json.gz'))).files;
  const results=[];
  for(const market of ['points','rebounds','assists','threes_made','pts_rebs_asts','pts_rebs','pts_asts']){
   const histories=[warm.result.observations,cold.result.observations].map(rows=>{const all=[...base.observations.filter(r=>r.sport==='nba'),...rows];return market.startsWith('pts_')?nbaCombinationHistory(all,market):all.filter(r=>r.market===market);});
   const p=warm.result.observations.find(r=>r.market==='points'),target={...p,market,gameId:'isolated-future-fixture',gameTime:future,basketballContext:{home:p.basketballContext.home}},model=models.find(m=>m.group==='nba|'+market);
   const outputs=histories.map(h=>forecastDistribution(model,h,target,new Date(now).toISOString(),basketballFeatureIndex(h)));assert.ok(outputs[0].forecast,JSON.stringify({market,reason:outputs[0].reason}));assert.deepEqual(outputs[1],outputs[0],market);
   const quote=recorded['nba-'+market+'.json'].rows[0],price={line:quote.sportsbookLine,overPrice:quote.overPrice,underPrice:quote.underPrice};assert.deepEqual(evaluatePrice(outputs[1].forecast.values,price),evaluatePrice(outputs[0].forecast.values,price));results.push({market,inputParity:true,projectionAndProbabilityParity:true,evArithmeticParity:true});
  }
  console.log('NBA_DURABLE_REAL_EVIDENCE',JSON.stringify({censuses:fixtures.accepted.length,observations:warm.result.observations.length,discoveryContracts:cohort.length,coldProviderCalls:cold.calls,sevenMarkets:results,productionAccess:false}));
 }finally{await mf?.dispose();await rm(dir,{recursive:true,force:true});}
});

test('semantic validation rejects reconciled-but-impossible census values and ambiguous identities',async()=>{
 const {validateNbaHistoryEvidence}=await loadTs(new URL('../lib/nba-history-evidence.ts',import.meta.url));
 const {basketballModelObservations}=await loadTs(new URL('../lib/basketball-model-observations.ts',import.meta.url));
 const frame=fixtures.accepted[0],identity={sport:'nba',season:'2027',gameId:frame.payload.header.id,source:frame.source,retrievedAt:fixtures.provenance.revalidatedAt};
 const mutations=[
  p=>{p.boxscore.players[1].statistics[0].athletes[0].athlete.id=p.boxscore.players[0].statistics[0].athletes[0].athlete.id;},
  p=>{p.header.competitions[0].competitors[1].homeAway=p.header.competitions[0].competitors[0].homeAway;},
  p=>{p.boxscore.players[0].statistics[0].athletes[0].athlete.id='non-numeric';},
  ...[-1,.5].map(points=>p=>{const team=p.boxscore.players[0],g=team.statistics[0],i=g.labels.indexOf('PTS'),player=g.athletes.find(a=>!a.didNotPlay),delta=points-Number(player.stats[i]);player.stats[i]=String(points);g.totals[i]=String(Number(g.totals[i])+delta);const side=p.header.competitions[0].competitors.find(s=>String(s.team.id)===String(team.team.id));side.score=String(Number(side.score)+delta);}),
  p=>{p.boxscore.players[0].statistics[0].totals[p.boxscore.players[0].statistics[0].labels.indexOf('OREB')]='9999';},
 ];
 for(const mutate of mutations){const payload=structuredClone(frame.payload);mutate(payload);assert.ok(basketballModelObservations(payload,identity).length,'the added guard must cover a semantic gap beyond existing total reconciliation');assert.throws(()=>validateNbaHistoryEvidence(frame.source,payload,identity.retrievedAt,now),/nba_evidence_incomplete_census/);}
});

test('cancellation propagates through storage reads, stale-census recovery and both refresh phases',async()=>{
 const {validateNbaHistoryEvidence,readNbaHistorySource}=await loadTs(new URL('../lib/nba-history-evidence.ts',import.meta.url));
 const {refreshNbaObservations}=await loadTs(new URL('../lib/live-basketball-observations.ts',import.meta.url));
 const frame=fixtures.accepted[0],stored=validateNbaHistoryEvidence(frame.source,frame.payload,fixtures.provenance.revalidatedAt,now);
 const [discoveryUrl,discoveryBody]=Object.entries(sources).find(([s])=>s.includes('/gamelog'));
 const discovery=validateNbaHistoryEvidence(discoveryUrl,discoveryBody,fixtures.provenance.revalidatedAt,now);
 const errors=[new DOMException('caller cancelled','AbortError'),new DOMException('caller deadline','TimeoutError'),Object.assign(Error('job_subrequest_budget'),{deferred:true}),Error('job_lease_lost'),Error('nba_ranking_deadline')];
 for(const error of errors){
  let live=0,writes=0;
  await assert.rejects(()=>readNbaHistorySource(frame.source,now,async()=>{live++;return {payload:frame.payload,observedAt:stored.observedAt};},{read:()=>{throw error;},write:()=>{writes++;}}),e=>e===error);
  assert.equal(live,0);assert.equal(writes,0);
  // An expired discovery must refresh; FINAL bodies now recover without HTTP.
  await assert.rejects(()=>readNbaHistorySource(discoveryUrl,now+20*60000,async()=>{throw error;},{read:()=>discovery,write:()=>{writes++;}}),e=>e===error);
  assert.equal(writes,0,'a cancelled refresh must not silently return or update an older census');
  await assert.rejects(()=>refreshNbaObservations(rows.slice(0,1),now,async()=>{throw error;}),e=>e===error);
  const [url,log]=Object.entries(sources).find(([s])=>s.includes('/athletes/'+rows[0].playerId+'/'));
  await assert.rejects(()=>refreshNbaObservations(rows.slice(0,1),now,async source=>{if(source===url)return log;throw error;}),e=>e===error);
 }
});

test('a foreground deadline admits no new reads or provider requests after in-flight evidence returns',async()=>{
 const {refreshNbaObservations}=await loadTs(new URL('../lib/live-basketball-observations.ts',import.meta.url));
 const {runNbaRankingWork}=await loadTs(new URL('../lib/nba-ranking-work.ts',import.meta.url));
 const {validateNbaHistoryEvidence}=await loadTs(new URL('../lib/nba-history-evidence.ts',import.meta.url));
 let reads=0,live=0,writes=0;
 const access={read:async source=>{reads++;await new Promise(resolve=>setTimeout(resolve,30));return validateNbaHistoryEvidence(source,sources[source],fixtures.provenance.revalidatedAt,now);},write:()=>{writes++;}};
 await assert.rejects(()=>runNbaRankingWork(()=>refreshNbaObservations(rows,now,async()=>{live++;throw Error('unexpected live fetch');},{evidence:access}),2),/nba_ranking_deadline/);
 await new Promise(resolve=>setTimeout(resolve,60));assert.ok(reads>0&&reads<=4);assert.equal(live,0);assert.equal(writes,0);
});
