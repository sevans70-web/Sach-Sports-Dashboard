import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {independentFootballRankings,selectRecordedFootballSlate}=await loadTs(new URL('../lib/football-slate-rankings.ts',import.meta.url));
test('each slate selects from its whole pool before capping; all day can exceed 25',()=>{
 const rows=['17:00','20:25','23:20'].flatMap((time,b)=>Array.from({length:35},(_,i)=>({playerId:b+'-'+i,gameId:b,gameTime:'2026-10-25T'+time+'Z',rank:b*35+i+1})));
 const ranked=independentFootballRankings(rows);assert.equal(ranked.length,75);
 for(const slate of ['early','afternoon','evening'])assert.deepEqual(ranked.filter(r=>r.slateKey===slate).map(r=>r.rank),Array.from({length:25},(_,i)=>i+1));
});
test('each slate locks its own original pregame evidence and ignores later results',()=>{
 const row={playerId:'early',gameId:'g',rank:1,gameTime:'2026-10-25T17:00Z',sportsbookLine:50.5,researchForecast:{projection:60}};
 const snap=(capturedAt,rows)=>({capturedAt,payload:{market:'receiving_yards',rows}});
 const snapshots=[snap('2026-10-25T16:55Z',[row]),snap('2026-10-25T17:05Z',[{...row,sportsbookLine:10.5,actualResult:100}])];
 const board=selectRecordedFootballSlate(snapshots,'receiving_yards','2026-10-25','early',Date.parse(row.gameTime));
 assert.equal(board.rows[0].sportsbookLine,50.5);assert.equal(board.rows[0].actualResult,undefined);
});

test('all day never mixes tomorrow evening into the current calendar day',()=>{
 const rows=[{gameTime:'2026-10-25T17:00Z'},{gameTime:'2026-10-26T00:20Z'},{gameTime:'2026-10-27T00:15Z'}];
 assert.equal(independentFootballRankings(rows,25,'2026-10-25').length,2);
 assert.equal(independentFootballRankings(rows,25,'2026-10-26').length,1);
});
