import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {gunzipSync} from 'node:zlib';import{loadTs}from'./load-ts.mjs';
const{checkedRankingPayload,rankingEvText}=await loadTs(new URL('../lib/ranking-display-evidence.ts',import.meta.url)),{formatEvPercent,estimatedEvText}=await loadTs(new URL('../lib/estimated-ev.ts',import.meta.url));
const now=Date.parse('2026-11-21T18:17:00Z');
function row(sport='nba',market='points') {const r={sport,market,playerId:'123',gameId:'456',gameTime:'2026-11-22T00:00Z',quoteVersion:1,quoteId:'exact',sportsbookKey:'book',sportsbook:'Book',quoteMarket:market,quotePeriod:market.startsWith('q1_')?'q1':'game',lineType:'main',sportsbookLine:10.5,overPrice:100,underPrice:100,quoteUpdatedAt:'2026-11-21T18:16Z',boardCapturedAt:'2026-11-21T18:17Z'};return {...r,researchForecast:{status:'available',projection:11,calculatedAt:r.boardCapturedAt,modelGroup:sport+'|'+market,modelSelection:{side:'OVER',price:100,line:10.5,quoteId:r.quoteId,sportsbookKey:r.sportsbookKey,calculatedAt:r.boardCapturedAt},priceComparison:{overProbability:.4,underProbability:.6,pushProbability:0,quoteEvidence:{sport,market,playerId:r.playerId,gameId:r.gameId,quoteId:r.quoteId,sportsbookKey:r.sportsbookKey,line:r.sportsbookLine,overPrice:r.overPrice,underPrice:r.underPrice,calculatedAt:r.boardCapturedAt}}}};}
test('ranking evidence never relabels another sport/market/game/player/quote or a future forecast',()=>{
 for(const sport of ['nba','nfl','nhl']){const r=row(sport),before=structuredClone(r),bad=[{...r,sport:'soccer'},{...r,market:'rebounds'},{...r,pregameContext:{playerId:'other'}},{...r,quotePeriod:'q1'},{...r,researchForecast:{...r.researchForecast,calculatedAt:'2026-11-21T19:00Z'}},{...r,researchForecast:{...r.researchForecast,priceComparison:{...r.researchForecast.priceComparison,quoteEvidence:{...r.researchForecast.priceComparison.quoteEvidence,gameId:'other'}}}}];
 const p=checkedRankingPayload({success:true,market:'points',rows:[r,...bad]},sport,'points',now);assert.deepEqual(p.rows,[r]);assert.equal(p.rankingEvidenceDiagnostics.withheld,6);assert.match(p.coverageNotice,/6 ranking rows were withheld/);assert.deepEqual(r,before);
 }
});
test('an unavailable locked board and wrong-market response are terminal states, not verified empty boards',()=>{
 for(const value of [{success:true,boardUnavailable:true,rows:[]},{success:true,market:'assists',rows:[]}])assert.throws(()=>checkedRankingPayload(value,'nba','points',now),e=>e.retryable===false&&/unavailable|another market/.test(e.message));
 assert.deepEqual(checkedRankingPayload({success:true,market:'points',rows:[]},'nba','points',now).rows,[]);
});
test('all three requested sports display valid negative/zero EV without turning it into a selection or altering other sports',()=>{
 for(const sport of ['nba','nfl','nhl']){const r=row(sport),before=structuredClone(r);assert.equal(estimatedEvText(r,now),'-20.0%');r.researchForecast.priceComparison.overProbability=.5;r.researchForecast.priceComparison.underProbability=.5;assert.equal(estimatedEvText(r,now),'0.0%');assert.equal(r.researchForecast.modelSelection.side,'OVER');assert.deepEqual(before.researchForecast.priceComparison.overProbability,.4);for(const n of [-10,0,12])assert.equal(rankingEvText(n,sport,formatEvPercent),formatEvPercent(n));}
 assert.equal(rankingEvText(-10,'cfb',formatEvPercent),'—');assert.equal(rankingEvText(null,'nba',formatEvPercent),'—');
});
test('the captured real API population is checked in every active category at its snapshot clock',async()=>{
 const fixture=JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/ranking-population-2026-11-21.json.gz',import.meta.url))));let categories=0;
 for(const[sport,markets]of Object.entries(fixture.boards))for(const[market,payload]of Object.entries(markets)){categories++;const before=JSON.stringify(payload);if(payload.boardUnavailable)assert.throws(()=>checkedRankingPayload(payload,sport,market,Date.parse(fixture.at)),/original pregame/);else{const p=checkedRankingPayload(payload,sport,market,Date.parse(fixture.at));assert.equal(p.rankingEvidenceDiagnostics.withheld,0,sport+' '+market);}assert.equal(JSON.stringify(payload),before);}
 assert.equal(categories,37);
});
test('NBA candidates and market counts preserve eight legitimate UNDER rows rather than enforcing a five-UNDER quota',async()=>{
 const {selectNbaCandidates}=await loadTs(new URL('../lib/nba-ranking-candidates.ts',import.meta.url)),{rankingMarketCoverage}=await loadTs(new URL('../lib/ranking-market-coverage.ts',import.meta.url));
 const rows=Array.from({length:8},(_,i)=>{const r=row('nba','q1_points');r.rank=i+1;r.playerId=String(100+i);r.capturedAt=r.boardCapturedAt;delete r.boardCapturedAt;r.researchForecast.projection=9;r.researchForecast.modelSelection.side='UNDER';r.researchForecast.priceComparison.quoteEvidence.playerId=r.playerId;r.researchForecast.priceComparison.quoteEvidence.calculatedAt=r.researchForecast.calculatedAt;return r;});
 const before=structuredClone(rows),selected=selectNbaCandidates(rows,'q1_points',now);assert.equal(selected.length,8);assert.deepEqual(selected.map(r=>r.rank),[1,2,3,4,5,6,7,8]);const c=rankingMarketCoverage('nba','q1_points','2026-11-21',rows,now);assert.equal(c.games.reduce((n,g)=>n+g.rows,0),8);assert.deepEqual(rows,before);
});

test('deferred card history is disclosed without claiming a request is in flight',async()=>{
 const {publicPropContext}=await loadTs(new URL('../lib/public-prop-context.ts',import.meta.url));
 const deferred=publicPropContext({historyDeferred:true},'nhl','goalie_saves',[]);assert.ok(deferred.facts.includes('Expand quick analysis to load recent player results.'));assert.ok(!deferred.facts.some(x=>x.includes('Loading')));
});

test('coverage counts match all 17 NFL quote-backed categories and every legitimate NHL comparison EV',async()=>{
 const {rankingMarketCoverage}=await loadTs(new URL('../lib/ranking-market-coverage.ts',import.meta.url)),{nflRankingDisplay}=await loadTs(new URL('../lib/nfl-ranking-display.ts',import.meta.url)),{completeRankingProp}=await loadTs(new URL('../lib/public-card-metrics.ts',import.meta.url));
 const fixture=JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/ranking-population-2026-11-21.json.gz',import.meta.url))));let checked=0;
 for(const[sport,boards]of Object.entries(fixture.boards))if(['nfl','nhl'].includes(sport))for(const[market,payload]of Object.entries(boards)){
  checked++;const before=JSON.stringify(payload),day=payload.boardDay||'2026-11-21',valid=payload.rows.filter(r=>sport==='nfl'?nflRankingDisplay(r,now):completeRankingProp(r,now)),coverage=rankingMarketCoverage(sport,market,day,payload.rows,now);
  assert.equal(coverage.games.reduce((n,g)=>n+g.rows,0),valid.length,sport+' '+market);
  assert.equal(coverage.games.reduce((n,g)=>n+g.ev,0),valid.filter(r=>sport==='nfl'?nflRankingDisplay(r,now).ev.status==='available':completeRankingProp(r,now)!=null).length,sport+' '+market+' EV');assert.equal(JSON.stringify(payload),before);
 }assert.equal(checked,23);
});
