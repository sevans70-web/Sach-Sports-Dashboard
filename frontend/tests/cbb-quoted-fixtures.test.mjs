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
