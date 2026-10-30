import test from 'node:test';import assert from 'node:assert/strict';import{loadTs}from './load-ts.mjs';
const {researchFootballOutcome:score}=await loadTs(new URL('../lib/research-football-outcome.ts',import.meta.url));
const target={gameId:'7',gameTime:'2026-10-29T00:00:00Z',teamId:'1',opponentId:'2',playerId:'9',market:'receiving_yards'};
const make=()=>({header:{id:'7',competitions:[{date:target.gameTime,status:{type:{completed:true}},competitors:[{team:{id:'1'}},{team:{id:'2'}}]}]},boxscore:{players:[{statistics:[{athletes:[{athlete:{id:'9'}}]}]}]}});
test('football research settles explicit real zero, preserves missing stat and voids only explicit DNP',()=>{
 const p=make();assert.deepEqual(score(p,target,[{playerId:'9',stats:{receiving_yards:0}}]),{status:'observed',actual:0});
 assert.equal(score(p,target,[]).status,'unresolved');p.boxscore.players[0].statistics[0].athletes[0].didNotPlay=true;
 assert.equal(score(p,target,[]).status,'void');assert.equal(score(p,target,[{playerId:'9',stats:{receiving_yards:0}}]).status,'unresolved');
});
test('football research rejects wrong final, kickoff or team identities',()=>{
 for(const change of [p=>p.header.id='8',p=>p.header.competitions[0].date='2026-10-30T00:00:00Z',p=>p.header.competitions[0].status.type.completed=false,p=>p.header.competitions[0].competitors[0].team.id='3']){const p=make();change(p);assert.equal(score(p,target,[{playerId:'9',stats:{receiving_yards:12}}]).status,'pending');}
});
