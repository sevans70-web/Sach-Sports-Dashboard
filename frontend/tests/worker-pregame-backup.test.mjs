import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {archiveWorkerPregameDay} from '../scripts/worker-pregame-backup.mjs';

const scope={sport:'nba',day:'2026-11-03'};
const env={BACKUP_DRIVE_FOLDER_ID:'staging-folder'};
const base={sport:'nba',market:'points',game_id:'12345',player_id:'67890',game_date:scope.day,
 game_time:'2026-11-03T23:00:00Z',captured_at:'2026-11-03T22:00:00Z',checksum:'a'.repeat(64),
 prediction_side:'OVER',sportsbook_line:24.5,payload:{quote:{line:24.5},modelSelection:{side:'OVER'}}};
function fixture(){
 const data={
  worker_pregame_originals:[{...base,player_id:'1'}, {...base,player_id:'2'}],
  worker_pregame_picks:[{...base,player_id:'2'}],
  worker_pregame_grades:[{sport:'nba',market:'points',game_id:'12345',player_id:'2',game_date:scope.day,
   source_pick_checksum:'a'.repeat(64),result_status:'hit',actual:27}]
 };
 const files=new Map(),calls=[],state={tamper:false,change:false};
 const requestCloud=async path=>{
  const url=new URL('https://mock.database.test/rest/v1/'+path);
  const table=url.pathname.split('/').at(-1);calls.push(table);
  assert.equal(url.searchParams.get('sport'),'eq.nba');
  assert.equal(url.searchParams.get('game_date'),'eq.2026-11-03');
  const offset=Number(url.searchParams.get('offset')),limit=Number(url.searchParams.get('limit'));
  let rows=data[table].slice(offset,offset+limit);
  if(state.change&&table==='worker_pregame_picks')rows=rows.map(x=>({...x,checksum:'b'.repeat(64)}));
  return rows;
 };
 const authenticate=()=>({request:async(input,options)=>{
  const url=new URL(input);
  if(url.searchParams.get('alt')==='media'){
   const saved=[...files.values()].find(f=>url.pathname.endsWith('/'+f.id));
   return new Response(state.tamper?'tampered':saved.body,{status:200});
  }
  if(options?.method==='POST'){
   const [,meta,body]=options.body.split('\r\n\r\n');
   const name=JSON.parse(meta.split('\r\n')[0]).name;
   const json=body.split('\r\n')[0];
   const f={id:'file-'+files.size,md5Checksum:createHash('md5').update(json).digest('hex'),body:json};
   files.set(name,f);
   return Response.json(f);
  }
  const name=url.searchParams.get('q').match(/name = '([^']+)'/)[1];
  return Response.json({files:files.has(name)?[files.get(name)]:[]});
 }});
 return {files,calls,data,state,requestCloud,authenticate};
}
test('independently backs up quote originals, picks and grades, then verifies exact restoration',async()=>{
 const f=fixture(),restored=[];
 const first=await archiveWorkerPregameDay(env,scope,f.requestCloud,f.authenticate,row=>restored.push(row));
 assert.equal(first.records,4);assert.equal(first.parts,1);assert.equal(first.restored,4);
 assert.deepEqual(new Set(restored.map(r=>r.table)),new Set(['worker_pregame_originals','worker_pregame_picks','worker_pregame_grades']));
 assert.equal(f.files.size,2);
 const second=await archiveWorkerPregameDay(env,scope,f.requestCloud,f.authenticate);
 assert.equal(second.records,4);assert.equal(f.files.size,2,'identical verified parts are reused');
 f.state.tamper=true;
 await assert.rejects(archiveWorkerPregameDay(env,scope,f.requestCloud,f.authenticate),/readback did not match/);
});
test('no manifest is published if source inventory changes while archiving',async()=>{
 const f=fixture();let count=0;
 const read=async path=>{count++;const result=await f.requestCloud(path);if(count>=4&&path.startsWith('worker_pregame_originals'))return result.map(row=>({...row,checksum:'c'.repeat(64)}));return result};
 await assert.rejects(archiveWorkerPregameDay(env,scope,read,f.authenticate),/inventory changed/);
 assert.equal([...f.files.keys()].filter(name=>name.includes('-manifest-')).length,0);
});
test('missing active sport records need no Drive authentication or writes',async()=>{
 const result=await archiveWorkerPregameDay(env,{sport:'cbb',day:scope.day},async()=>[],()=>{throw Error('not called')});
 assert.equal(result.records,0);assert.equal(result.parts,0);
});
test('rejects a source capture that was made after official kickoff',async()=>{
 const f=fixture();
 f.data.worker_pregame_originals[0].captured_at='2026-11-04T01:00:00Z';
 await assert.rejects(archiveWorkerPregameDay(env,scope,f.requestCloud,f.authenticate),/Invalid pregame quote original/);
 assert.equal(f.files.size,0);
});
