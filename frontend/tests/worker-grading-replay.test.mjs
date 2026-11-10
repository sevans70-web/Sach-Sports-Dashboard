import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './load-ts.mjs';

const {createWorkerGradingReplay}=await loadTs(new URL('../lib/worker-grading-replay.ts',import.meta.url));
const {readWorkerFinals,saveWorkerFinalCorrections}=await loadTs(new URL('../lib/worker-final-observations.ts',import.meta.url));
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
 const corrections=[];
 assert.deepEqual(await replay.verify(async()=>Response.json(corrected),async values=>corrections.push(...values)),{games:1,matched:0,differences:1,unavailable:0});
 assert.deepEqual(corrections,[corrected]);
});

test('staging stores verified corrections separately and keeps the newer official observation',async()=>{
 const memory=new Map();
 const cache={
  get:async key=>JSON.parse(memory.get(key)||'null'),
  put:async (key,value,options)=>{
   assert.match(key,/^sach:staging:official-finals:v1:/);
   assert.equal(options.expirationTtl,604800);
   memory.set(key,value);
  },
 };
 const newest={...final,updatedAt:'2026-11-09T01:05:00Z',rows:[{playerId:'456',stats:{points:13}}]};
 const older={...final,updatedAt:'2026-11-09T01:00:00Z'};
 await saveWorkerFinalCorrections(cache,'nba','2026-11-08',[newest]);
 await saveWorkerFinalCorrections(cache,'nba','2026-11-08',[older]);
 assert.deepEqual((await readWorkerFinals(cache,'nba','2026-11-08')).map(row=>row.payload),[newest]);
 assert.deepEqual(await readWorkerFinals(cache,'nhl','2026-11-08'),[]);
 await assert.rejects(saveWorkerFinalCorrections(cache,'nba','2026-11-08',[{...newest,state:'in'}]),/Invalid staging final/);
});


test('rotates each official final game in bounded two-fixture scheduled batches',async()=>{
 const replay=createWorkerGradingReplay('nba');
 for(const id of ['123','124','125','126','127']){
  const row={...pregame,gameId:id,playerId:String(Number(id)+500)};
  replay.consume({stream:'protected_pregame_'+id+'_points',payload:[{payload:{kind:'pregame_checkpoint',checkpointAt:checkpoint,rows:[row]}}]});
  replay.consume({stream:'protected_final_'+id,payload:[{payload:{kind:'official_final_checkpoint',source:'official_final_boxscore',gameId:id,boxscore:{success:true,gameId:id,state:'post',rows:[{playerId:row.playerId,stats:{points:17}}]}}}]});
 }
 const examined=new Set();
 for(let i=0;i<3;i++){
  const outcome=await replay.verify(async route=>{
   const id=new URL('https://example.invalid'+route).searchParams.get('gameId');
   examined.add(id);
   return Response.json({success:true,gameId:id,state:'post',rows:[{playerId:String(Number(id)+500),stats:{points:17}}]});
  },undefined,i);
  assert.equal(outcome.games,i===2?1:2);
 }
 assert.deepEqual([...examined].sort(),['123','124','125','126','127']);
});
