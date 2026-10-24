import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {nbaBoardDates,activeNbaBoardDay}=await loadTs(new URL('../lib/nba-board-window.ts',import.meta.url));
const now=new Date('2026-10-24T04:49:00Z');
test('midnight keeps previous slate when one or four games remain live',()=>{
 for(const count of [1,4]){const games=Array.from({length:count},()=>({tipoff:'2026-10-24T02:00Z',state:'in'}));games.push({tipoff:'2026-10-24T23:00Z',state:'pre'});assert.equal(activeNbaBoardDay(games,now),'2026-10-23');}
});
test('next slate remains independently addressable while older games are live',()=>{
 assert.deepEqual(nbaBoardDates(now),{previous:'2026-10-23',today:'2026-10-24',tomorrow:'2026-10-25'});
});
test('after final the default can advance but previous board date remains available',()=>{
 assert.equal(activeNbaBoardDay([{tipoff:'2026-10-24T02:00Z',state:'post'}],now),'2026-10-24');
 assert.equal(nbaBoardDates(now).previous,'2026-10-23');
});
test('live games retain their slate beyond an arbitrary early-morning cutoff and month rollover',()=>{
 assert.equal(activeNbaBoardDay([{tipoff:'2026-11-01T02:00Z',state:'in'}],new Date('2026-11-01T12:00Z')),'2026-10-31');
});
