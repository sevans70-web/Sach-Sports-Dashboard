import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './load-ts.mjs';

test('P01 retains strongest five UNDERs without relabeling or mutating rows',async()=>{
 const {capRankingUnders}=await loadTs(new URL('../lib/saved-model-pick.ts',import.meta.url));
 const rows=Array.from({length:30},(_,i)=>({rank:i+1,side:i<9?'UNDER':i===9?'UNDER 10.5':'OVER'}));
 const kept=capRankingUnders(rows,r=>r.side);
 assert.deepEqual(kept.filter(r=>r.side.startsWith('UNDER')).map(r=>r.rank),[1,2,3,4,5]);
 assert.equal(kept.filter(r=>r.side==='OVER').length,20);
 assert.equal(rows.length,30);
 assert.equal(rows[5].side,'UNDER');
});

test('N05 quarter point expectation never yields impossible negative yards',async()=>{
 const {quarterPoint}=await loadTs(new URL('../lib/quarter-forecast.ts',import.meta.url));
 const model={group:'nfl|q1_receiving_yards',model:{coefficients:[-5],intercept:0}};
 const value=quarterPoint(model,[1]);
 assert.ok(Number.isFinite(value)&&value>=0);
});
