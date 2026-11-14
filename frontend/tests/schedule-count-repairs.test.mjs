import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {schedulePayloads}=await loadTs(new URL('../lib/schedule-payloads.ts',import.meta.url));
const {scheduleSnapshot,requireDashboardSummary,currentDashboardSnapshot}=await loadTs(new URL('../lib/dashboard-response-state.ts',import.meta.url));
const {rankingScopeSummary}=await loadTs(new URL('../lib/ranking-scope-summary.ts',import.meta.url));
const {rankingMarketCoverage,recordRankingMarket,readRankingMarketCoverage}=await loadTs(new URL('../lib/ranking-market-coverage.ts',import.meta.url));
const {rankingRowIsPick}=await loadTs(new URL('../lib/ranking-pick-count.ts',import.meta.url));
const now=Date.parse('2026-11-14T16:00:00Z'),stamp=new Date(now).toISOString();
function row(market='points',sport='nba'){return {sport,market,playerId:'p',playerName:'Player Example',gameId:'g',gameTime:'2026-11-15T18:00:00Z',gameState:'pre',quoteVersion:1,quoteId:'q',sportsbook:'Book',sportsbookKey:'book',lineType:'main',sportsbookLine:10.5,overPrice:100,underPrice:100,quoteUpdatedAt:stamp,capturedAt:stamp,boardCapturedAt:stamp,researchForecast:{status:'available',projection:11,calculatedAt:stamp,priceComparison:{overProbability:.6,underProbability:.4,pushProbability:0},modelSelection:{side:'OVER',line:10.5,price:100,quoteId:'q',sportsbookKey:'book',calculatedAt:stamp}}};}
test('NBA/NFL/NHL date failures and malformed payloads cannot publish partial schedules or false empty dates',async()=>{
 for(const sport of ['NBA','NFL','NHL']){
  await assert.rejects(schedulePayloads([Promise.resolve({games:[1]}),Promise.reject(Error('offline'))],sport,x=>Array.isArray(x.games)),/incomplete/);
  await assert.rejects(schedulePayloads([Promise.resolve({error:'rate limited'})],sport,x=>Array.isArray(x.games)),/incomplete/);
  assert.deepEqual(await schedulePayloads([Promise.resolve({games:[]}),Promise.resolve({games:[1]})],sport,x=>Array.isArray(x.games)),[{games:[]},{games:[1]}]);
 }
});
test('failed polls retain bounded same-sport schedules; confirmed empty dates replace them and expired dates cannot leak',()=>{
 const good=scheduleSnapshot(null,'nba', {success:true,games:[{id:'g'}]},true,now);
 const kept=scheduleSnapshot(good,'nba',{success:false,games:[]},true,now+30_000);assert.equal(kept.data.games[0].id,'g');assert.equal(kept.data.retainedSchedule,true);assert.equal(kept.at,now);
 assert.equal(scheduleSnapshot(good,'nfl',null,false,now),null);assert.equal(scheduleSnapshot(good,'nba',null,false,now+900_000),null);
 assert.deepEqual(scheduleSnapshot(good,'nba',{success:true,games:[]},true,now+1).data.games,[]);
 assert.equal(currentDashboardSnapshot({at:Date.parse('2026-11-15T04:59:59Z'),data:{}},Date.parse('2026-11-15T05:00:01Z')),false);
 assert.throws(()=>requireDashboardSummary({success:false,scheduleAvailable:false,games:0,previewGames:[]}),/cannot be verified/);
});
test('scope counts bind market, date and official fixture; unknown coverage is not zero and kickoff invalidates aggregate caches',()=>{
 const game={id:'g',date:'2026-11-15T18:00:00Z'},cov=rankingMarketCoverage('nba','points','2026-11-15',[row(),row()],now);
 const result=rankingScopeSummary([game],['points','assists'],[cov,cov,{...cov,day:'2026-11-14'}],now);
 assert.equal(result.estimatedPicks,1);assert.equal(result.coverageComplete,false);assert.equal(result.coverageAudit.missingMarketDates.length,1);
 assert.equal(rankingScopeSummary([game],['points'],[],now).estimatedPicks,null);
 assert.equal(rankingScopeSummary([],['points'],[],now).estimatedPicks,0);
 assert.equal(rankingScopeSummary([game],['points'],[{...cov,checkedAt:now-900_000}],now).estimatedPicks,null);
 const before=Date.parse(game.date)-1000;assert.equal(rankingScopeSummary([game],['points'],[{...cov,checkedAt:before}],before+2000).estimatedPicks,null);
 assert.equal(rankingScopeSummary([game],['points'],[cov],now).coverageComplete,true);
});
test('seven NBA diagnostic rows, scorer candidates and true picks remain separate in coverage',()=>{
 for(const market of ['points','rebounds','assists','threes_made','pts_rebs_asts','pts_rebs','pts_asts']){
  const valid=row(market),missing={...row(market),playerId:'missing',researchForecast:{status:'unavailable'}};
  const c=rankingMarketCoverage('nba',market,'2026-11-15',[valid,missing],now).games[0];assert.equal(c.rows,2);assert.equal(c.picks,1);assert.equal(c.ev,1);
  assert.equal(rankingRowIsPick({...valid,withdrawnFromBoard:true},now),false);
  assert.equal(rankingRowIsPick({...valid,researchForecast:{...valid.researchForecast,modelSelection:null}},now),false);
 }
 const scorer={...row('first_basket'),lineType:'scorer',sportsbookLine:null,overPrice:500,underPrice:null,researchForecast:null};
 const c=rankingMarketCoverage('nba','first_basket','2026-11-15',[scorer],now).games[0];assert.equal(c.rows,1);assert.equal(c.picks,0);assert.equal(c.ev,0);
});
test('coverage caches use actual future fixture dates and reject expired/future-dated counters',async()=>{
 const entries=new Map(),cache={get:async k=>entries.get(k)||null,put:async(k,v)=>entries.set(k,JSON.parse(v))};
 await recordRankingMarket(cache,'nba','points',{success:true,market:'points',updatedAt:stamp,rows:[row()]},now);
 const [future]=await readRankingMarketCoverage(cache,'nba','2026-11-15',['points'],now);assert.equal(future.games[0].picks,1);
 assert.equal((await readRankingMarketCoverage(cache,'nba','2026-11-15',['points'],now+900_000)).length,0);
 assert.equal((await readRankingMarketCoverage(cache,'nba','2026-11-15',['points'],now-1)).length,0);
 assert.ok([...entries.keys()].every(k=>k.includes(':v3:')));
});


test('NHL tomorrow roster enrichment uses tomorrow teams, not only today teams, across Toronto DST',async()=>{
 const {nhlRosterSlateGames,nhlSlateDay}=await loadTs(new URL('../lib/nhl.ts',import.meta.url));
 const now=new Date('2026-11-01T04:30:00Z'),games=[{gameId:'today',tipoff:'2026-11-01T18:00Z',state:'pre',awayAbbr:'A',homeAbbr:'B'},{gameId:'tomorrow',tipoff:'2026-11-03T00:00Z',state:'pre',awayAbbr:'C',homeAbbr:'D'}];
 assert.equal(nhlSlateDay('tomorrow',now),'2026-11-02');assert.deepEqual(nhlRosterSlateGames(games,'tomorrow',now).map(g=>g.awayAbbr),['C']);assert.deepEqual(nhlRosterSlateGames(games,'today',now).map(g=>g.awayAbbr),['A']);
});
