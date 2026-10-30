import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {independentFootballRankings,selectRecordedFootballSlate,nearestQuotedFootballDay}=await loadTs(new URL('../lib/football-slate-rankings.ts',import.meta.url));
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

test('N04 uses next day that actually has eligible scorer quotes',()=>{
 const next=[{gameTime:'2026-11-01T18:00:00Z'}];
 assert.equal(nearestQuotedFootballDay(next,'2026-10-29','2026-10-29'),'2026-11-01');
 assert.equal(nearestQuotedFootballDay([...next,{gameTime:'2026-10-29T23:00:00Z'}],'2026-10-29','2026-10-29'),'2026-10-29');
 assert.equal(nearestQuotedFootballDay([], '2026-10-29','2026-10-29'),'2026-10-29');
 assert.equal(nearestQuotedFootballDay([{gameTime:'2026-10-25T17:00:00Z'}],'2026-10-29','2026-10-29'),'2026-10-29');
});

const {activeFootballBoardDay}=await loadTs(new URL('../lib/football-slate-rankings.ts',import.meta.url));
test('S02 retains original slate windows across Toronto midnight until the last live game finishes',()=>{
 const games=[{date:'2026-11-01T18:00Z',state:'post'},{date:'2026-11-01T21:25Z',state:'post'},{date:'2026-11-02T01:20Z',state:'in'},{date:'2026-11-02T23:00Z',state:'pre'}];
 const now=new Date('2026-11-02T05:30Z');assert.equal(activeFootballBoardDay(games,now),'2026-11-01');
 const rows=games.map((g,i)=>({gameTime:g.date,playerId:String(i)}));assert.equal(independentFootballRankings(rows,25,activeFootballBoardDay(games,now)).length,3);
 games[2].state='post';assert.equal(activeFootballBoardDay(games,now),'2026-11-02');
});

test('CFB keeps a late live slate before considering today or the next available Saturday',()=>{
 const now=new Date('2026-11-07T05:30Z'),late={date:'2026-11-07T02:00Z',state:'in'},next={date:'2026-11-07T17:00Z',state:'pre'};
 assert.equal(activeFootballBoardDay([late,next],now,true),'2026-11-06');
 assert.equal(activeFootballBoardDay([{...late,state:'post'},next],now,true),'2026-11-07');
 assert.equal(activeFootballBoardDay([{date:'2026-11-14T17:00Z',state:'pre'}],now,true),'2026-11-14');
 assert.equal(activeFootballBoardDay([{date:'2026-11-14T17:00Z',state:'pre'}],now),'2026-11-07');
});
