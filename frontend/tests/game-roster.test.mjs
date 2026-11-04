import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './load-ts.mjs';
const {gameRosterForSide,gameRosterStarter}=await loadTs(new URL('../lib/game-roster.ts',import.meta.url));
test('all active game details bind rosters to exact teams regardless of response order',()=>{
 for(const sport of ['nba','nfl','nhl','cbb','cfb']){
  const game={sport,awayTeamId:'A',homeTeamId:'B',awayTeam:'Away Team',awayAbbr:'AWY',homeTeam:'Home Team',homeAbbr:'HME'};
  const away={teamId:'A',teamName:'Away Team',teamAbbr:'AWY',side:'away',players:[{playerId:'a'}]};
  const home={teamId:'B',teamName:'Home Team',teamAbbr:'HME',side:'home',players:[{playerId:'b'}]};
  assert.equal(gameRosterForSide([home,away],'away',game),away,sport);
  assert.equal(gameRosterForSide([away,home],'home',game),home,sport);
  assert.equal(gameRosterForSide([home],'away',game),undefined,sport);
  assert.equal(gameRosterForSide([{...away,teamId:'CFB',teamName:'Wrong Team'}],'away',game),undefined,sport);
  assert.equal(gameRosterForSide([away,{...away}],'away',game),undefined,sport);
  assert.equal(gameRosterForSide([{...away,side:'home'}],'away',game),undefined,sport);
  const noIds={...game,awayTeamId:undefined,homeTeamId:undefined};
  assert.equal(gameRosterForSide([home,away],'away',noIds),away,sport);
  assert.equal(gameRosterForSide([{...away,teamName:'Away Team State',teamAbbr:'OTHER'}],'away',noIds),undefined,sport);
  assert.equal(gameRosterForSide([{...away,teamName:'',teamAbbr:''}],'away',noIds),undefined,sport);
 }
});
test('only an explicit current-game starter flag confirms a starter',()=>{
 assert.equal(gameRosterStarter({starter:true},true),true);
 for(const raw of [{gamesStarted:20},{starter:'false'},{starter:false},{battingOrder:1},{}])assert.equal(gameRosterStarter(raw,true),false);
 assert.equal(gameRosterStarter({starter:true,gamesStarted:20},false),false);
});
