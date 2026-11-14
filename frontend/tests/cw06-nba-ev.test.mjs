import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {nbaRankingEv,nbaEvNotice,attachNbaRankingEv}=await loadTs(new URL('../lib/nba-ranking-ev.ts',import.meta.url));
const now=Date.parse('2026-11-14T16:00:00Z'),markets=['points','rebounds','assists','threes_made','pts_rebs_asts','pts_rebs','pts_asts'];
function row(market='points',p=[.4,.5,.1]){
 const calculatedAt=new Date(now).toISOString(),r={sport:'nba',market,rank:7,playerId:'123',gameId:'456',gameTime:'2026-11-14T23:00:00Z',quoteVersion:1,quoteId:'q-'+market,sportsbook:'Book',sportsbookKey:'book',lineType:'main',sportsbookLine:10,overPrice:100,underPrice:-110,quoteUpdatedAt:'2026-11-14T15:59:00Z',boardCapturedAt:calculatedAt,forecastCapturedAt:calculatedAt,prediction:'NO PICK'};
 return {...r,researchForecast:{status:'available',projection:11,calculatedAt,modelSelection:null,priceComparison:{overProbability:p[0],underProbability:p[1],pushProbability:p[2],quoteEvidence:{sport:r.sport,market,gameId:r.gameId,playerId:r.playerId,quoteId:r.quoteId,sportsbookKey:r.sportsbookKey,line:r.sportsbookLine,overPrice:r.overPrice,underPrice:r.underPrice,calculatedAt}}}};
}
test('CW06 all seven NBA markets retain signed and zero EV without manufacturing a pick',()=>{
 for(const market of markets){for(const [probabilities,text] of [[[.4,.5,.1],'-10.0%'],[[.5,.5,0],'0.0%'],[[.6,.3,.1],'+30.0%']]){const r=row(market,probabilities),before=structuredClone(r),ev=nbaRankingEv(r,now);assert.equal(ev.status,'available',market);assert.equal(ev.displayText,text);assert.equal(ev.side,'OVER');assert.equal(ev.validatedForBetting,false);assert.deepEqual(r,before);}
  const r=row(market,[.3,.6,.1]);r.researchForecast.projection=9;const ev=nbaRankingEv(r,now);assert.equal(ev.side,'UNDER');assert.ok(Math.abs(ev.percent-100*(.6*100/110-.3))<1e-10);assert.equal(r.researchForecast.modelSelection,null);
 }
});
test('CW06 invalid or unavailable evidence has an explicit reason; no bookmaker-implied fallback',()=>{
 const r=row(),f=r.researchForecast,p=f.priceComparison;
 for(const bad of [{...r,sportsbookLine:'10'},{...r,overPrice:'100'},{...r,sportsbookLine:10.3},{...r,underPrice:null},{...r,quoteUpdatedAt:'2026-11-14T15:00:00Z'},{...r,researchForecast:null},{...r,researchForecast:{...f,giReason:'price_validation_failed'}},{...r,researchForecast:{...f,priceComparison:null}},{...r,researchForecast:{...f,priceComparison:{...p,overProbability:.9}}},{...r,researchForecast:{...f,priceComparison:{...p,quoteEvidence:null}}},{...r,researchForecast:{...f,priceComparison:{...p,quoteEvidence:{...p.quoteEvidence,quoteId:'other'}}}},{...r,researchForecast:{...f,projection:10}},{...r,researchForecast:{...f,calculatedAt:'2026-11-14T23:00Z'}},{...r,forecastCapturedAt:'2026-11-14T23:01Z'},{...r,market:'first_basket',lineType:'scorer'}]){const ev=nbaRankingEv(bad,now);assert.equal(ev.status,'unavailable');assert.ok(ev.code&&ev.reason);assert.equal(ev.percent,null);assert.equal(nbaEvNotice(ev),ev.reason);}
});
test('CW06 cannot reprice or flip an invalid saved selection; saved EV survives results',()=>{
 const r=row('points',[.3,.6,.1]),f=r.researchForecast;r.researchForecast={...f,modelSelection:{side:'UNDER',price:-110,line:10,quoteId:r.quoteId,sportsbookKey:r.sportsbookKey,calculatedAt:f.calculatedAt}};
 assert.equal(nbaRankingEv(r,now).side,'UNDER');assert.equal(nbaRankingEv({...r,quoteId:'changed'},now).status,'unavailable');
 const frozen={...r,boardFrozen:true,gameState:'post',actualResult:999};assert.deepEqual(nbaRankingEv(frozen,now+86400000),nbaRankingEv({...frozen,actualResult:0},now+86400000));assert.equal(nbaRankingEv(frozen,now+86400000).quoteBasis,'saved_pregame');
});
test('CW06 API enrichment preserves ranks, predictions, original objects and unrelated markets',()=>{
 const nba=markets.map((m,i)=>({...row(m),rank:20-i})),nfl={...row(),sport:'nfl'},nhl={...row(),sport:'nhl'},scorer={...row(),market:'first_basket'},rows=[...nba,nfl,nhl,scorer],before=structuredClone(rows),out=attachNbaRankingEv(rows,now);
 assert.deepEqual(rows,before);assert.deepEqual(out.map(r=>r.rank),rows.map(r=>r.rank));assert.deepEqual(out.map(r=>r.prediction),rows.map(r=>r.prediction));assert.ok(out.slice(0,7).every(r=>r.nbaEv.status==='available'));assert.equal(out[7],nfl);assert.equal(out[8],nhl);assert.equal(out[9],scorer);
});

test('CW06 unavailable Worker runtime cannot erase frozen NBA forecasts',async()=>{
 const {attachFittedResearchForecasts}=await loadTs(new URL('../lib/live-model-forecast.ts',import.meta.url)),prior=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{userAgent:'Cloudflare-Workers'}});
 try{for(const market of markets){const original={...row(market),boardFrozen:true,frozen:true},before=structuredClone(original),result=await attachFittedResearchForecasts({market,rows:[original]},'nba',now,{offlineOnly:true});assert.deepEqual(result.rows[0],before);assert.deepEqual(original,before);}}
 finally{if(prior)Object.defineProperty(globalThis,'navigator',prior);else delete globalThis.navigator;}
});
