import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {pregameCheckpointRows,gameSaveAction,isOfficialFinal}=await loadTs(new URL('../lib/history-save-policy.ts',import.meta.url));
const now=Date.parse('2026-10-25T16:57:00Z'),start='2026-10-25T17:00:00Z';
test('pregame protection retains exact evidence and rejects late or future captures',()=>{
 const original={gameId:'one',gameTime:start,boardCapturedAt:'2026-10-25T16:55:00Z',sportsbookLine:68.5,overPrice:-110,researchForecast:{projection:87.8}};
 const rows=pregameCheckpointRows({rows:[original,{...original,boardCapturedAt:start},{...original,boardCapturedAt:'2026-10-25T16:58:00Z'},{...original,gameTime:'2026-10-25T16:56:00Z'}]},now);
 assert.deepEqual(rows,[original]);assert.equal(rows[0],original);assert.equal(pregameCheckpointRows({rows:[original]},now+180000).length,0);
});
test('all sports use five-minute pregame window and delayed-final retries',()=>{
 for(const sport of ['nfl','cfb','nba','nhl','cbb','soccer','wnba','mlb']){const game={sport,gameTime:start};assert.equal(gameSaveAction(game,0,now),'pregame');assert.equal(gameSaveAction(game,now,now+30000),null);assert.equal(gameSaveAction(game,0,now-180000),null);assert.equal(gameSaveAction(game,0,now+5*3600000),'final');assert.equal(gameSaveAction(game,now+5*3600000,now+5*3600000+60000),null);}
});
test('official final requires exact game, final state and populated boxscore',()=>{
 const payload={success:true,gameId:'one',state:'post',rows:[{playerId:'p',stats:{receiving_yards:0}}]};assert.equal(isOfficialFinal(payload,'one'),true);for(const value of [{...payload,state:'in'},{...payload,gameId:'other'},{...payload,success:false},{...payload,rows:[]}])assert.equal(isOfficialFinal(value,'one'),false);
});
test('hidden MLB and Soccer also require authenticated full final evidence',async()=>{
 const {rawOfficialFinal}=await loadTs(new URL('../lib/history-save-policy.ts',import.meta.url));
 const mlb={gamePk:7,gameData:{status:{abstractGameState:'Final'}},liveData:{boxscore:{teams:{home:{players:{a:{}}},away:{players:{b:{}}}}}}};
 assert.equal(rawOfficialFinal('mlb','7',mlb),true);assert.equal(rawOfficialFinal('mlb','8',mlb),false);assert.equal(rawOfficialFinal('mlb','7',{...mlb,gameData:{status:{abstractGameState:'Live'}}}),false);
 const soccer={header:{id:'s',competitions:[{status:{type:{completed:true,state:'post'}}}]},rosters:[{},{}]};assert.equal(rawOfficialFinal('soccer','s',soccer),true);assert.equal(rawOfficialFinal('soccer','s',{...soccer,rosters:[]}),false);
});
