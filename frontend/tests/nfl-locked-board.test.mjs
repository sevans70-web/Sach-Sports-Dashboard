import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {selectNflLockedBoard}=await loadTs(new URL('../lib/nfl-locked-board.ts',import.meta.url));
test('kickoff feed shrink cannot remove unvalidated pregame research rows in any NFL market',()=>{
 for(const market of ['passing_yards','receiving_yards','receptions','rushing_yards']){
  const rows=Array.from({length:25},(_,i)=>({playerId:String(i),gameId:String(i),market,rank:i+1,gameTime:i<15?'2026-10-25T17:00Z':'2026-10-25T20:25Z',sportsbookLine:i+.5,recommendationEligible:false,researchForecast:{projection:i+2,modelSelection:null}}));
  const full={capturedAt:'2026-10-25T16:55Z',payload:{kind:'research_rankings',market,rows}};
  const late={capturedAt:'2026-10-25T17:05Z',payload:{kind:'research_rankings',market,rows:rows.slice(15)}};
  const board=selectNflLockedBoard([full,late],market,'2026-10-25',Date.parse('2026-10-25T17:10Z'));
  assert.deepEqual(selectNflLockedBoard([{...full,payload:{market,rows}}],market,'2026-10-25',Date.parse('2026-10-25T17:10Z')).rows,rows);assert.deepEqual(board.rows,rows);assert.equal(board.capturedAt,full.capturedAt);
  assert.equal(selectNflLockedBoard([{...full,capturedAt:'2026-10-26T00:00Z'}],market,'2026-10-25',Date.parse('2026-10-25T17:10Z')),null);
 }
});
