import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {availablePregameRankings,excludeUnavailablePregame}=await loadTs(new URL('../lib/ranking-availability.ts',import.meta.url));
const now=Date.parse('2026-10-29T12:00Z');
for(const sport of ['nba','nfl','cfb','nhl','cbb','soccer','wnba','mlb'])test(sport+' filters unavailable players before ranking without excluding pending lineups or rewriting history',()=>{
 const base={sport,gameId:'g',playerId:'p',teamId:'t',gameTime:'2026-10-29T20:00Z'};
 for(const status of ['OUT','inactive','scratched','Healthy Scratch','injured_list','10-day IL','60-day injured list','assigned to minors','optioned to minors']){
  const row={...base,availabilityStatus:status};assert.equal(excludeUnavailablePregame(row,now),true,status);
  const result=availablePregameRankings({rows:[{...row,rank:1},{...base,playerId:'next',rank:2,availabilityStatus:'Pending'}]},now);
  assert.deepEqual(result.rows.map(r=>[r.playerId,r.rank]),[['next',1]]);assert.equal(result.excludedUnavailable,1);
  assert.equal(excludeUnavailablePregame({...row,boardFrozen:true},now),false);
  assert.equal(excludeUnavailablePregame({...row,participationConfirmed:true,participationGameId:'g'},now),false);
  assert.equal(excludeUnavailablePregame({...row,participationConfirmed:true,participationGameId:'other'},now),true);
 }
 for(const status of ['Questionable','Probable','Day-to-day','Pending','Active','Available',''])assert.equal(excludeUnavailablePregame({...base,availabilityStatus:status},now),false,status);
 assert.equal(excludeUnavailablePregame({...base,pregameContext:{gameId:'other',playerId:'p',teamId:'t',availability:[{status:'Out'}]}},now),false);
});

test('eligibility examines the full pool before limiting and preserves frozen history',async()=>{
 const {limitAvailablePregameRankings}=await loadTs(new URL('../lib/ranking-availability.ts',import.meta.url));
 for(const sport of ['nba','nfl','cfb','nhl','cbb','soccer','wnba','mlb']){
  const rows=Array.from({length:40},(_,i)=>({sport,playerId:String(i),gameId:'g',gameTime:'2026-10-29T20:00Z',rank:i+1,availabilityStatus:i<5?'Out':'Pending'}));
  const board=limitAvailablePregameRankings({rows},25,now);
  assert.equal(board.rows.length,25);assert.equal(board.rows[0].playerId,'5');assert.equal(board.rows[24].playerId,'29');assert.equal(board.rows[24].rank,25);
  assert.equal(limitAvailablePregameRankings({rows:rows.slice(0,12)},25,now).rows.length,7);
  const frozen={boardFrozen:true,rows};assert.equal(limitAvailablePregameRankings(frozen,25,now),frozen);
 }
});
