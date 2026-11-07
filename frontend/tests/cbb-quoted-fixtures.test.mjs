import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {cbbQuotedFixtures}=await loadTs(new URL('../lib/cbb.ts',import.meta.url));
test('roster loading is restricted to exact provider fixtures while rejecting other dates and schools',()=>{
 const game={gameId:'one',awayTeam:'Maryland Terrapins',homeTeam:'Georgetown Hoyas',awayTeamAliases:['Maryland'],homeTeamAliases:['Georgetown'],tipoff:'2026-11-08T00:30Z'};
 const other={...game,gameId:'two',homeTeam:'Other',homeTeamAliases:[]};
 const payload={data:[{awayTeam:'Maryland',homeTeam:'Georgetown',commenceTime:game.tipoff}]};
 assert.deepEqual(cbbQuotedFixtures([game,other],payload),[game]);
 assert.deepEqual(cbbQuotedFixtures([game],{data:[{...payload.data[0],commenceTime:'2026-11-09T00:30Z'}]}),[]);
 assert.deepEqual(cbbQuotedFixtures([game],{data:[]}),[]);
});
const {cbbCurrentRosterPlayers}=await loadTs(new URL('../lib/cbb.ts',import.meta.url));
test('current roster identity includes newcomers without inventing baseline statistics or retaining alumni',()=>{
 const rows=cbbCurrentRosterPlayers([{playerId:1,playerName:'Returning',team:'OLD',pointsPerGame:12},{playerId:2,playerName:'Departed',team:'OLD',pointsPerGame:20}],[{playerId:1,playerName:'Returning',team:'NEW'},{playerId:3,playerName:'Newcomer',team:'NEW'}]);
 assert.equal(rows.length,2);assert.equal(rows[0].pointsPerGame,12);assert.equal(rows[0].team,'NEW');assert.equal(rows[1].pointsPerGame,null);assert.equal(rows[1].gamesPlayed,null);assert.ok(!rows.some(r=>r.playerId===2));
});
