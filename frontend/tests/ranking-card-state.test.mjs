import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './load-ts.mjs';
const {rankingCardState}=await loadTs(new URL('../lib/ranking-card-state.ts',import.meta.url));
test('a void research capture cannot make a live or upcoming game look final',()=>{
 for(const status of ['void','hit','miss','push']){
  assert.equal(rankingCardState({gameState:'in'},status),'live');
  assert.equal(rankingCardState({gameState:'pre'},status),'pregame');
 }
 assert.equal(rankingCardState({gameState:'post'},'pending'),'final');
 assert.equal(rankingCardState({},'hit'),'final');
});
