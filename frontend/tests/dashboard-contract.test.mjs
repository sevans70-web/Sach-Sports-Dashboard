import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {dashboardSlate,dashboardCounts}=await loadTs(new URL('../lib/dashboard-contract.ts',import.meta.url));
const time=new Date(Date.now()+3600000).toISOString(),stamp=new Date().toISOString();
const games=[{id:'a',date:time,state:'pre'},{id:'b',date:time,state:'in',awayLineupConfirmed:true}];
const row={playerId:'1',gameId:'a',gameTime:time,sportsbookLine:10.5,modelProjection:12,quoteVersion:1,sportsbook:'FanDuel',sportsbookKey:'fanduel',lineType:'main',overPrice:-110,underPrice:-110,quoteUpdatedAt:stamp};
test('dashboard counts distinguish traceable quotes from validated predictions',()=>{
 const d=dashboardCounts(games,[row,row,{...row,playerId:'2',quoteVersion:undefined},{...row,playerId:'3',sportsbookLine:null},{...row,gameId:'wrong'}]);
 assert.equal(d.games,2);assert.equal(d.rankedPlayers,3);assert.equal(d.playerProps,1);assert.equal(d.predictions,0);assert.deepEqual(d.verifiedRows,[]);
 assert.equal(d.confirmedLineups,1);assert.equal(d.pendingLineups,3);
});
test('saved model selections have a separate snapshot count from validated predictions',()=>{
 const quoted={...row,capturedAt:stamp,quoteId:'q',researchForecast:{modelSelection:{side:'OVER',line:10.5,price:-110,quoteId:'q',sportsbookKey:'fanduel',calculatedAt:stamp}}};
 const d=dashboardCounts(games,[quoted]);assert.equal(d.estimatedPicks,1);assert.equal(d.predictions,0);
 assert.equal(dashboardCounts(games,[{...quoted,researchForecast:{}}]).estimatedPicks,0);
});
test('a genuine zero quote is retained but a missing threshold cannot become zero',()=>{
 assert.equal(dashboardCounts(games,[{...row,sportsbookLine:0}]).playerProps,1);assert.equal(dashboardCounts(games,[{...row,sportsbookLine:null}]).playerProps,0);
});
test('legacy low thresholds never inflate homepage prop or prediction counts',()=>{
 const d=dashboardCounts(games,[{...row,quoteVersion:undefined,sportsbookLine:150}],true);assert.equal(d.playerProps,0);assert.equal(d.predictions,0);
});
test('current slate retains overnight live games, today finals and the next complete day without duplicates',()=>{
 const g=[{id:'live',date:'2026-10-16T23:00:00-04:00',state:'in'},{id:'final',date:'2026-10-17T08:00:00-04:00',state:'post'},{id:'next',date:'2026-10-18T15:00:00-04:00',state:'pre'},{id:'next2',date:'2026-10-18T17:00:00-04:00',state:'pre'},{id:'later',date:'2026-10-20T17:00:00-04:00',state:'pre'}];
 assert.deepEqual(dashboardSlate([...g,g[0]],new Date('2026-10-17T12:00:00-04:00')).map(g=>g.id),['live','next','next2','final']);
});
test('the full calendar keeps later published games beyond the dashboard preview',()=>{
 const now=new Date('2026-10-17T12:00:00-04:00'),g=[{id:'today',date:'2026-10-17T20:00:00Z',state:'pre'},{id:'next',date:'2026-10-18T20:00:00Z',state:'pre'},{id:'later',date:'2026-11-02T20:00:00Z',state:'pre'}];assert.equal(dashboardSlate(g,now).length,2);assert.equal(dashboardSlate(g,now,true).length,3);
});
