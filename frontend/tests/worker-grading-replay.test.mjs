import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './load-ts.mjs';

const {createWorkerGradingReplay}=await loadTs(new URL('../lib/worker-grading-replay.ts',import.meta.url));
const kickoff='2026-11-08T23:00:00Z';
const checkpoint='2026-11-08T22:58:00Z';
const pregame={
 gameId:'123',playerId:'456',market:'points',gameTime:kickoff,
 quoteVerified:true,sportsbookLine:14.5,researchForecast:{status:'available',projection:16},
};
const final={success:true,gameId:'123',state:'post',rows:[{playerId:'456',stats:{points:17}}]};

test('replays only protected pregame decisions against the same official final fixture',async()=>{
 const replay=createWorkerGradingReplay('nba');
 replay.consume({stream:'protected_pregame_123_points',payload:[{payload:{kind:'pregame_checkpoint',checkpointAt:checkpoint,rows:[pregame]}}]});
 replay.consume({stream:'protected_pregame_123_late',payload:[{payload:{kind:'pregame_checkpoint',checkpointAt:kickoff,rows:[{...pregame,playerId:'999'}]}}]});
 replay.consume({stream:'protected_final_123',payload:[{payload:{kind:'official_final_checkpoint',source:'official_final_boxscore',gameId:'123',boxscore:final}}]});
 assert.deepEqual(await replay.verify(async path=>{
  assert.equal(path,'/api/basketball/live-player-stats?sport=nba&gameId=123');
  return Response.json(final);
 }),{games:1,matched:1,differences:0,unavailable:0});
 assert.deepEqual(await replay.verify(async()=>Response.json({...final,gameId:'987'})),{games:0,matched:0,differences:0,unavailable:1});
 const corrected={...final,rows:[{playerId:'456',stats:{points:13}}]};
 assert.deepEqual(await replay.verify(async()=>Response.json(corrected)),{games:1,matched:0,differences:1,unavailable:0});
});
