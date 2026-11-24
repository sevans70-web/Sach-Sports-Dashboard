import test from'node:test';import assert from'node:assert/strict';import{createHash}from'node:crypto';import{readFileSync}from'node:fs';import{gunzipSync}from'node:zlib';import{loadTs}from'./load-ts.mjs';import{replay,giStatus,snapshot,boards}from'./fixtures/nfl-price-replay.mjs';
const{nflRankingEv}=await loadTs(new URL('../lib/nfl-ranking-ev.ts',import.meta.url)),{nflRankingDisplay,nflRankingPayload}=await loadTs(new URL('../lib/nfl-ranking-display.ts',import.meta.url)),{rankingModelConfidence}=await loadTs(new URL('../lib/ranking-model-confidence.ts',import.meta.url));
const result=replay('passing_tds'),authentic=result.rows.find(r=>r.playerName==='Patrick Mahomes');assert.ok(authentic&&!authentic.researchForecast.modelSelection);
test('all six genuine TD quote rows retain exact identity/prices; all five eligible rows have coherent direction, confidence and independently calculated signed EV',()=>{
 for(const row of result.rows){const original=JSON.stringify(row),d=nflRankingDisplay(row,result.now);assert.ok(d);if(row.researchForecast.status!=='available'){assert.equal(d.ev.code,'model_unavailable');assert.match(d.reason,/three verified/);continue;}
  assert.equal(d.ev.status,'available');const p=row.researchForecast.priceComparison,side=d.direction,win=side==='OVER'?p.overProbability:p.underProbability,loss=side==='OVER'?p.underProbability:p.overProbability,price=side==='OVER'?row.overPrice:row.underPrice;
  assert.ok(Math.abs(d.ev.percent-100*(win*(price>0?price/100:100/-price)-loss))<1e-10);assert.equal(d.confidence,100*win);assert.equal(rankingModelConfidence(row,result.now).side,side);assert.equal(JSON.stringify(row),original);
 }
 assert.equal(nflRankingPayload({rows:result.rows},result.now).nflCoverage.evAvailable,5);
});
test('the four failed markets remain held for the SAME model artifacts that failed the independent price audit',()=>{
 const models=JSON.parse(gunzipSync(readFileSync(new URL('../model-research/2026-10-19/nfl-population/distribution-models.json.gz',import.meta.url)))),sha=o=>createHash('sha256').update(JSON.stringify(o)).digest('hex');
 for(const market of ['passing_yards','rushing_yards','receiving_yards','receptions']){
  const group='nfl|'+market;assert.equal(sha(snapshot.models.find(m=>m.group===group)),sha(models.find(m=>m.group===group)));assert.equal(giStatus[group].reason,'price_validation_failed');
  const r=replay(market);for(const row of r.rows){const v=nflRankingEv(row,r.now);assert.equal(v.status,'unavailable');if(row.researchForecast.status==='available'){assert.equal(v.code,'probability_validation_failed');assert.equal(nflRankingDisplay(row,r.now).confidence,null);}}
 }
});
test('wrong line, odds, book, quote/player/game IDs, market, period and receipt time cannot acquire confidence or EV',()=>{
 for(const change of [r=>r.sportsbookLine+=1,r=>r.overPrice+=1,r=>r.underPrice+=1,r=>r.quoteId='wrong',r=>r.sportsbookKey='wrong',r=>r.playerId='wrong',r=>r.gameId='wrong',r=>r.market='passing_yards',r=>r.quotePeriod='q1',r=>r.quoteMarket='rushing_yards',r=>r.researchForecast.modelGroup='nfl|receptions',r=>delete r.researchForecast.priceComparison.quoteEvidence,r=>r.forecastCapturedAt=r.capturedAt]){
  const r=structuredClone(authentic);change(r);assert.equal(nflRankingEv(r,result.now).status,'unavailable');assert.equal(rankingModelConfidence(r,result.now).status,'unavailable');
 }
});
test('normalization, stale/future quotes, unsupported markets and directionless forecasts return explicit holds',()=>{
 const r=structuredClone(authentic);r.researchForecast.priceComparison.pushProbability=.7;assert.equal(nflRankingEv(r,result.now).code,'invalid_probabilities');
 const equal=structuredClone(authentic);equal.researchForecast.projection=equal.sportsbookLine;assert.equal(nflRankingEv(equal,result.now).code,'direction_unavailable');
 assert.equal(nflRankingEv(authentic,result.now+16*60000).code,'quote_unavailable');
 for(const m of ['passing_interceptions','qb_rushing_yards','passing_rushing_yards','rushing_receiving_yards','anytime_td','first_td','tackles','q1_passing_yards']){const v=nflRankingEv({...authentic,market:m,researchForecast:{status:'unavailable',reason:'market_model_not_fitted'}},result.now);assert.equal(v.code,'model_unavailable');}
});
test('zero and negative research EV stay signed at the authentic quote; synthetic probabilities test arithmetic only and never waive a model hold',()=>{
 const r=structuredClone(authentic),p=r.researchForecast.priceComparison,side=nflRankingDisplay(r,result.now).direction,odds=side==='OVER'?r.overPrice:r.underPrice,win=odds<0?-odds/(-odds+100):100/(odds+100),winKey=side==='OVER'?'overProbability':'underProbability',lossKey=side==='OVER'?'underProbability':'overProbability';
 // Clearly synthetic boundary inputs; original prices/quote identity unchanged.
 p[winKey]=win;p[lossKey]=1-win;p.pushProbability=0;assert.ok(Math.abs(nflRankingEv(r,result.now).percent)<1e-10);p[winKey]=win/2;p[lossKey]=1-win/2;assert.ok(nflRankingEv(r,result.now).percent<0);
 r.researchForecast.giReason='price_validation_failed';assert.equal(nflRankingEv(r,result.now).code,'probability_validation_failed');assert.equal(r.researchForecast.modelSelection,null);
});
