import test from 'node:test';
import assert from 'node:assert/strict';
import {gradeCapturedModelPick,gradingSportForTick,gradeSavedWorkerPicks} from '../scripts/worker-pregame-grade.mjs';

const gradeTime=Date.parse('2026-11-10T12:00:00Z');
const sport=gradingSportForTick(gradeTime);
function saved(patch={}){
 return {sport,market:'points',game_id:'12345',player_id:'67890',game_date:'2026-11-09',
  game_time:'2026-11-09T20:00:00Z',captured_at:'2026-11-09T19:00:00Z',
  prediction_side:'OVER',sportsbook_line:22.5,checksum:'a'.repeat(64),
  payload:{quote:{quoteId:'Q1',sportsbookKey:'book-one',overPrice:-110,underPrice:-110},
   modelSelection:{side:'OVER',line:22.5,quoteId:'Q1',sportsbookKey:'book-one',price:-110,calculatedAt:'2026-11-09T18:59:00Z'}},...patch};
}
const final=(value=24)=>({success:true,state:'post',gameId:'12345',rows:[{playerId:'67890',stats:{points:value}}]});
test('grades saved line and side, not later live book prices',()=>{
 assert.equal(gradeCapturedModelPick(saved(),final(24),gradeTime).result_status,'hit');
 assert.equal(gradeCapturedModelPick(saved(),final(22.5),gradeTime).result_status,'push');
 assert.equal(gradeCapturedModelPick(saved(),final(19),gradeTime).result_status,'miss');
 assert.equal(gradeCapturedModelPick(saved({prediction_side:'UNDER',payload:{...saved().payload,modelSelection:{...saved().payload.modelSelection,side:'UNDER',price:-110}}}),final(19),gradeTime).result_status,'hit');
});
test('rejects wrong game, player, live game, late receipt and modified original quote',()=>{
 for(const [row,result] of [
  [saved(),{...final(),state:'in'}],
  [saved(),{...final(),gameId:'54321'}],
  [saved(),{...final(),rows:[{playerId:'00000',stats:{points:25}}]}],
  [saved({captured_at:'2026-11-09T20:30:00Z'}),final()],
  [saved({payload:{...saved().payload,modelSelection:{...saved().payload.modelSelection,line:23.5}}}),final()],
  [saved({payload:{...saved().payload,modelSelection:{...saved().payload.modelSelection,calculatedAt:'2026-11-09T20:01:00Z'}}}),final()],
  [saved(),{...final(),rows:[{playerId:'67890',stats:{points:null}}]}],
 ])assert.equal(gradeCapturedModelPick(row,result,gradeTime),null);
});
test('grade scheduling is bounded, UTC-based, and one sport per 30 minutes',()=>{
 assert.equal(gradingSportForTick(gradeTime+5*60000),null);
 assert.ok(['nba','nhl','nfl','cfb','cbb'].includes(sport));
 assert.notEqual(gradingSportForTick(gradeTime),gradingSportForTick(gradeTime+30*60000));
});
test('one official final writes only first grade; subsequent runs never modify originals or grades',async()=>{
 const captures=[saved()],gradeMap=new Map(),traffic=[];
 const env={SUPABASE_URL:'https://mock.database.test',SUPABASE_SECRET_KEY:'sb_secret_unit_only'};
 const fetchImpl=async(url,init={})=>{
  const parsed=new URL(url),table=parsed.pathname.split('/').at(-1);
  traffic.push({table,method:init.method||'GET'});
  if(table==='worker_pregame_picks')return new Response(JSON.stringify(captures),{status:200});
  assert.equal(table,'worker_pregame_grades');
  if(init.method==='POST'){
   assert.match(init.headers.Prefer,/ignore-duplicates/);
   for(const item of JSON.parse(init.body)){const key=[item.market,item.game_id,item.player_id].join('|');if(!gradeMap.has(key))gradeMap.set(key,item)}
   return new Response(null,{status:201});
  }
  return new Response(JSON.stringify([...gradeMap.values()]),{status:200});
 };
 const worker={fetch:async request=>{
  assert.match(request.url,/\/api\//);
  return new Response(JSON.stringify(final()),{status:200});
 }};
 const first=await gradeSavedWorkerPicks(env,worker,{},gradeTime,fetchImpl);
 assert.equal(first.gradesVerified,1);
 assert.equal(first.officialFinals,1);
 assert.equal(captures[0].sportsbook_line,22.5);
 const immutable=[...gradeMap.values()][0];
 const second=await gradeSavedWorkerPicks(env,worker,{},gradeTime,fetchImpl);
 assert.equal(second.gradesVerified,0);
 assert.deepEqual([...gradeMap.values()][0],immutable);
 assert.equal(traffic.filter(x=>x.method==='POST').length,1);
});
