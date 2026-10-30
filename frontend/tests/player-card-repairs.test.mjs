import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {playerCardHistory,historyAverage}=await loadTs(new URL('../lib/player-card-history.ts',import.meta.url));
const {completedRankingsLast,rankingStatusText}=await loadTs(new URL('../lib/ranking-card-state.ts',import.meta.url));
const {cardProjectionLabel,cardQuotePrices}=await loadTs(new URL('../lib/public-card-metrics.ts',import.meta.url));
const sports=['nba','nfl','cfb','nhl','cbb','soccer','wnba','mlb'];
for(const sport of sports)test(sport+': prior numeric history, evidence labels and completed ordering stay consistent',()=>{
 const points=[{value:null,date:'2026-10-01'},{value:false,date:'2026-10-02'},{value:'',date:'2026-10-03'},{value:0,date:'2026-10-04',gameId:'prior-zero',workload:20},{value:12,date:'2026-10-05',gameId:'prior',workload:20},{value:99,date:'2026-10-30T12:00Z',gameId:'target',workload:20},{value:100,date:'2026-10-31',workload:20}];
 const actual=playerCardHistory({points},sport,'points','2026-10-30T20:00Z','target');
 assert.deepEqual(actual.map(p=>p.value),[0,12]);assert.equal(historyAverage(actual),6);assert.equal(historyAverage([]),null);
 assert.deepEqual(playerCardHistory({values:[null,false,'',0,'12']},sport,'points').map(p=>p.value),[0,12]);
 assert.deepEqual(playerCardHistory({values:[0,12]},sport,'points','2026-10-30T20:00Z'),[],'undated values cannot establish a pregame sample');
 const rows=[{id:'finished-1',rank:1,gameState:'post'},{id:'pending',rank:2,gameState:'pre',resultStatus:'void'},{id:'live',rank:3,gameState:'in'},{id:'finished-2',rank:4,gameState:'final'}];
 const ordered=completedRankingsLast(rows);assert.deepEqual(ordered.map(r=>r.id),['pending','live','finished-1','finished-2']);assert.deepEqual(ordered.map(r=>r.rank),[2,3,1,4]);assert.equal(rows[0].id,'finished-1');
 assert.equal(cardProjectionLabel({market:'points',modelProjection:21}),'Historical Baseline');
 assert.equal(cardProjectionLabel({market:'points',researchForecast:{status:'available',projection:22}}),'Sach Projection');
 assert.equal(cardQuotePrices({quoteVerified:true,lineType:'main',overPrice:125,underPrice:-145}),'Over +125 / Under -145');
 assert.equal(cardQuotePrices({quoteVerified:false,overPrice:125,underPrice:-145}),'');
});
test('quarter history never substitutes full-game values and selected windows average their actual sample',()=>{
 const points=Array.from({length:25},(_,i)=>({value:i,date:'2026-10-'+String(i+1).padStart(2,'0'),period:'q1',gameId:String(i),workload:20}));
 const result=playerCardHistory({points:[...points,{value:99,date:'2026-10-26',period:'full'}]},'nba','q1_points','2026-10-30T20:00Z','target');
 assert.equal(result.length,20);assert.equal(historyAverage(result.slice(-5)),22);assert.equal(historyAverage(result.slice(-10)),19.5);assert.equal(historyAverage(result),14.5);
});
test('clock labels distinguish quarters, college halves, hockey periods and supplied overtime',()=>{
 assert.equal(rankingStatusText({state:'in',status:'In Progress',period:2,clock:'04:21'},'nba'),'In Progress · Q2 · 04:21');
 assert.equal(rankingStatusText({state:'in',period:1,clock:'15:00'},'cbb'),'In Progress · H1 · 15:00');
 assert.equal(rankingStatusText({state:'in',period:4},'nhl'),'In Progress · OT1');
 assert.equal(rankingStatusText({state:'pre',clock:'12:00',period:1},'nba'),'Scheduled');
 assert.equal(rankingStatusText({state:'post',status:'Final',clock:'0:00',period:4},'nba'),'Final');
});
