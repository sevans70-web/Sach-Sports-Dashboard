import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {trackRankBoard,currentDroppedRows}=await loadTs(new URL('../lib/rank-movement.ts',import.meta.url));
const now=Date.parse('2026-10-29T12:00Z'),time='2026-10-29T23:00Z',iso=new Date(now).toISOString();
for(const sport of ['nfl','cfb','mlb'])test(sport+': movement survives refresh/storage and an empty provider interval; kickoff is never NEW',()=>{
 const scope=sport+'|points|evening|2026-10-29',rows=[{playerId:'a',gameId:'g',rank:1,gameTime:time}];
 const first=trackRankBoard(rows,null,scope,iso);assert.equal(first.rows[0].movement,'same');
 const entered=trackRankBoard([...rows,{...rows[0],playerId:'b',rank:2}],first.board,scope,iso);assert.equal(entered.rows[1].movement,'new');
 const empty=trackRankBoard([],JSON.parse(JSON.stringify(entered.board)),scope,iso);
 const restored=trackRankBoard([...rows,{...rows[0],playerId:'b',rank:2}],empty.board,scope,iso);assert.equal(restored.rows[0].movement,'same');assert.equal(restored.rows[1].movement,'new');
 const started=trackRankBoard([{...rows[0],playerId:'b',rank:1,gameState:'in'}],entered.board,scope,iso);assert.equal(started.rows[0].movement,'same');
 assert.equal(trackRankBoard(rows,entered.board,scope+'next',iso).rows[0].movement,'same');
});
test('DROPPED admits only distinct same-fixture same-day future replacements and rejects started/stale/wrong market rows',()=>{
 const active=[{playerId:'current',gameId:'g',gameTime:time}],valid={playerId:'old',gameId:'g',market:'points',gameTime:time};
 const invalid=[{...valid,playerId:'current'},{...valid,gameId:'other'},{...valid,gameTime:'2026-10-28T23:00Z'},{...valid,gameTime:'2026-10-29T11:00Z'},{...valid,gameState:'in'},{...valid,boardFrozen:true},{...valid,market:'rebounds'},{...valid,gameTime:'invalid'}];
 assert.deepEqual(currentDroppedRows([valid,valid,...invalid],active,'points','2026-10-29',now),[valid]);
 const mlb={player_id:'b',game_pk:'42',startTime:time};assert.equal(currentDroppedRows([mlb],[{...mlb,player_id:'a'}],'hits','2026-10-29',now).length,1);
});
