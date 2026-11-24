import test from 'node:test';import assert from 'node:assert/strict';import {readFile}from'node:fs/promises';import{gunzipSync}from'node:zlib';import{loadTs}from'./load-ts.mjs';
const source=JSON.parse(gunzipSync(await readFile(new URL('./fixtures/nfl-official-finals-2026-11-24.json.gz',import.meta.url)))),now=Date.parse(source.clock),nativeFetch=globalThis.fetch;
const {nflFinalObservation,nflOfficialPlayerHistory}=await loadTs(new URL('../lib/nfl-final-history.ts',import.meta.url));
const {espnOpportunityGames,opportunityFeatures}=await loadTs(new URL('../lib/opportunity-backtest.ts',import.meta.url));
const {footballResearchSample}=await loadTs(new URL('../lib/football-history.ts',import.meta.url));
const {fittedResearchForecast}=await loadTs(new URL('../lib/live-model-forecast.ts',import.meta.url));
const snapshot=JSON.parse(gunzipSync(await readFile(new URL('../model-runtime/snapshot.json.gz',import.meta.url))));
const td=JSON.parse(gunzipSync(await readFile(new URL('../model-runtime/nfl-passing-tds.json.gz',import.meta.url))));
let requests=0;globalThis.fetch=async url=>{requests++;assert.ok(!String(url).includes('/athletes/'),'Never retry the denied athlete family');const r=source.records[String(url)];assert.ok(r,'Only recorded authorized official resources: '+url);return Response.json(r.payload,{headers:{'x-sach-observed-at':r.observedAt}});};
test.after(()=>{globalThis.fetch=nativeFetch;});
const qbs=[['3046779','8','Jared Goff'],['4431611','3','Caleb Williams'],['4360698','21','Joe Milton III'],['2577417','6','Dak Prescott'],['3139477','12','Patrick Mahomes'],['3918298','2','Josh Allen']];
test('November26 official full-game histories restore genuine supported forecasts without athlete logs',async()=>{
 let passing=0,passingTds=0;for(const [id,team,name]of qbs){
  const payload=await nflOfficialPlayerHistory(id,team,2026,now);assert.ok(payload.completeFinals>=8&&payload.completeFinals<=10);const cohort=footballResearchSample(payload,['passingyards','passyards'],'passing_yards','2026-11-26T18:00:00Z',2026);if(id==='4360698'){assert.ok(cohort.games<3);assert.equal(cohort.projection,null);continue;}assert.ok(cohort.games>=3,name);assert.ok(cohort.projection>0);
  const history=espnOpportunityGames(payload,{sport:'nfl',season:'2026',playerId:id,playerName:name,source:payload.sourcePolicy,retrievedAt:source.clock});
  for(const market of ['passing_yards','passing_tds']){
   const rows=history.filter(g=>g.market===market),last=rows.at(-1);assert.ok(rows.length>=3,name+' '+market);const target={...last,gameId:'nov26-'+team,gameTime:'2026-11-27T01:15:00Z'};
   const f=opportunityFeatures(rows,target,source.clock);assert.ok(f.features,name+' '+market);assert.ok(f.features.every(Number.isFinite));
   const models=market==='passing_tds'?td.models:snapshot.models;
   const forecast=fittedResearchForecast(target,'nfl',market,{models,observations:rows,digest:'recorded-official-finals-verification',asOf:source.clock,gi:{}},now);
   assert.equal(forecast.status,'available',name+' '+market+':'+forecast.reason);assert.ok(Number.isFinite(forecast.projection));assert.equal(forecast.priceComparison,null,'No invented current quote/EV');
   if(market==='passing_yards')passing++;else passingTds++;
  }
 }
 assert.equal(passing,5);assert.equal(passingTds,5);assert.ok(requests<=66,'At most6calendars+60FINALs; coalesced caches may use fewer');console.log(JSON.stringify({November26QBs:6,passingProjections:passing,passingTdProjections:passingTds,officialRequests:requests}));
});
test('all explicit receiving/targets/rushing workload observations remain player/category matched; missing zeroes are never inferred',async()=>{
 const url=Object.keys(source.records).find(u=>u.includes('/summary?')&&source.records[u].payload.boxscore.players.some(p=>String(p.team.id)==='8'));
 const original=source.records[url],p=original.payload,id=String(p.header.id),g=nflFinalObservation(p,id,'8',2026,source.clock);
 for(const [playerId,a]of Object.entries(g.players)){
  const log={names:['passingAttempts','passingYards','passingTouchdowns','passingInterceptions','rushingAttempts','rushingYards','rushingTouchdowns','receivingTargets','receivingYards','receivingTouchdowns','receptions'],events:{[id]:{gameDate:g.gameTime,gameResult:g.result,team:{id:g.teamId},opponent:{id:g.opponentId}}},seasonTypes:[{type:2,categories:[{type:'event',events:[{eventId:id,stats:a.stats}]}]}]};
  for(const o of espnOpportunityGames(log,{sport:'nfl',season:'2026',playerId,playerName:a.name,source:url,retrievedAt:source.clock})){
   assert.equal(o.playerId,playerId);assert.equal(o.teamId,'8');const ix={passing_yards:[1,0],passing_tds:[2,0],rushing_yards:[5,4],receiving_yards:[8,7],receptions:[10,7]}[o.market];assert.equal(o.actual,a.stats[ix[0]]);assert.equal(o.workload,a.stats[ix[1]]);
  }
 }
 const altered=structuredClone(p),group=altered.boxscore.players.find(t=>String(t.team.id)==='8').statistics.find(g=>g.name==='receiving'),player=group.athletes[0],index=group.keys.indexOf('receivingTargets');player.stats[index]='';const checked=nflFinalObservation(altered,id,'8',2026,source.clock);assert.equal(checked.players[player.athlete.id].stats[7],null);
});
test('wrong identities, preseason, nonfinal, incomplete categories and negative attempts fail closed',()=>{
 const [url,record]=Object.entries(source.records).find(([u])=>u.includes('/summary?'));const id=record.payload.header.id,team=String(record.payload.boxscore.players[0].team.id);
 for(const change of [p=>p.header.id='wrong',p=>p.header.season.type=1,p=>p.header.competitions[0].status.type.completed=false,p=>p.boxscore.players[0].statistics=p.boxscore.players[0].statistics.filter(g=>g.name!=='receiving'),p=>p.boxscore.players[0].statistics.find(g=>g.name==='passing').athletes[0].stats[0]='1/-2']){
  const p=structuredClone(record.payload);change(p);if(p.boxscore.players[0].statistics.find(g=>g.name==='passing')?.athletes[0]?.stats[0]==='1/-2'){const g=nflFinalObservation(p,id,team,2026,source.clock);assert.equal(Object.values(g.players).find(p=>p.stats[1]!=null).stats[0],null);}else assert.throws(()=>nflFinalObservation(p,id,team,2026,source.clock));
 }
 assert.throws(()=>nflFinalObservation(record.payload,id,'999',2026,source.clock));
});
test('every quoted player in the five supported November26 markets is classified from authentic current-season workload evidence',async()=>{
 const boards=JSON.parse(gunzipSync(await readFile(new URL('./fixtures/nfl-nov26-recorded-rows.json.gz',import.meta.url)))).boards;
 const summary=[];for(const [market,board]of Object.entries(boards)){
  let available=0;const holds={};for(const row of board.rows){
   const log=await nflOfficialPlayerHistory(String(row.playerId),String(row.teamId),2026,now);
   const observations=espnOpportunityGames(log,{sport:'nfl',season:'2026',playerId:String(row.playerId),playerName:row.playerName,source:log.sourcePolicy,retrievedAt:source.clock});
   const models=market==='passing_tds'?td.models:snapshot.models;
   const original=JSON.stringify(row),f=fittedResearchForecast({...row,market},'nfl',market,{models,observations,digest:'source-coverage-test',asOf:source.clock,gi:{}},now);
   if(f.status==='available'){available++;assert.ok(Number.isFinite(f.projection));assert.ok(f.inputReceipt.features.every(Number.isFinite));}
   else{holds[f.reason]=(holds[f.reason]||0)+1;assert.ok(['player_team_history_unavailable','fewer_than_three_same_season_team_appearances','prior_workload_role_uncertain'].includes(f.reason),f.reason);}
   assert.equal(JSON.stringify(row),original);if(f.priceComparison)assert.fail('Archived quote must not be restamped current to obtain EV');
  }
  assert.ok(available>0,market);assert.equal(available+Object.values(holds).reduce((a,b)=>a+b,0),board.rows.length);summary.push({market,quotedPlayers:board.rows.length,availableIndependentProjections:available,holds});
 }
 console.log(JSON.stringify({recordedNovember26PlayerCoverage:summary,quoteScope:'original archived timestamps; no manufactured fresh EV'}));
});
