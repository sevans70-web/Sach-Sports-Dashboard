import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {basketballHistorySeasons,basketballHistoryWindow}=await loadTs(new URL('../lib/basketball-history-window.ts',import.meta.url));
test('fall NBA and CBB use the new ending-year season while WNBA stays in its calendar year',()=>{
 assert.deepEqual(basketballHistorySeasons('nba','2026-10-23T23:00Z'),[2026,2027]);
 assert.deepEqual(basketballHistorySeasons('cbb','2026-11-01T23:00Z'),[2026,2027]);
 assert.deepEqual(basketballHistorySeasons('wnba','2026-10-23T23:00Z'),[2025,2026]);
 assert.deepEqual(basketballHistorySeasons('nba','2026-04-01T23:00Z'),[2025,2026]);
});
test('rollover fixture includes current season game before selecting the last five',()=>{
 const rows=[28,19,40,36,36,8].map((value,i)=>({gameId:String(i),date:i===5?'2026-10-21T23:00Z':`2026-04-${String(i+1).padStart(2,'0')}T23:00Z`,value}));
 assert.deepEqual(basketballHistoryWindow(rows,'2026-10-23T23:00Z').slice(-5).map(r=>r.value),[19,40,36,36,8]);
});
test('later games, undated rows, duplicates and missing values cannot contaminate pregame Last 20',()=>{
 const before='2026-10-23T23:00Z';const history=Array.from({length:25},(_,i)=>({gameId:String(i),date:`2026-09-${String(i+1).padStart(2,'0')}T23:00Z`,value:i}));
 const future=Array.from({length:25},(_,i)=>({gameId:'future'+i,date:'2026-10-24T23:00Z',value:99}));
 const rows=basketballHistoryWindow([...history,...future,history[24],{gameId:'bad',date:'',value:0},{gameId:'null',date:history[0].date,value:null}],before);
 assert.equal(rows.length,20);assert.equal(rows[0].value,5);assert.equal(rows.at(-1).value,24);
});
