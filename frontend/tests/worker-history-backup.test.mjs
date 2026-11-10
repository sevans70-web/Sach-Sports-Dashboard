import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {checksum} from '../scripts/history-cloud.mjs';
import {archiveWorkerHistoryDay,workerHistoryBackupScope} from '../scripts/worker-history-backup.mjs';

const scope={sport:'nba',day:'2026-11-09'};
const env={BACKUP_DRIVE_FOLDER_ID:'staging-folder'};

function fixture(){
 const docs=Array.from({length:30},(_,index)=>{
  const payload=[{rank:index+1,playerName:'Recorded player'}];
  return {stream:'points_'+String(index).padStart(2,'0'),game_date:scope.day,payload,checksum:checksum(payload),source_bytes:100};
 });
 const files=new Map();
 let badReadback=false,changed=false;
 const authenticate=()=>({
  async request(input,options){
   const url=new URL(input);
   if(url.searchParams.get('alt')==='media'){
    const file=[...files.values()].find(item=>url.pathname.endsWith('/'+item.id));
    return new Response(badReadback?'tampered':file.body);
   }
   if(options?.method==='POST'){
    const [,meta,body]=options.body.split('\r\n\r\n');
    const name=JSON.parse(meta.split('\r\n')[0]).name;
    const json=body.split('\r\n')[0];
    const file={id:'file-'+files.size,md5Checksum:createHash('md5').update(json).digest('hex'),body:json};
    files.set(name,file);
    return Response.json(file);
   }
   const name=url.searchParams.get('q').match(/name = '([^']+)'/)[1];
   return Response.json({files:files.has(name)?[files.get(name)]:[]});
  },
 });
 const read=async input=>{
  const url=new URL('https://test.invalid/'+input);
  assert.equal(url.searchParams.get('sport'),'eq.nba');
  assert.equal(url.searchParams.get('game_date'),'eq.2026-11-09');
  const streams=url.searchParams.get('stream');
  if(streams){
   const selected=streams.slice(4,-1).split(',');
   assert(selected.length<=24);
   return docs.filter(doc=>selected.includes(doc.stream)).map(({source_bytes,...row})=>changed?{...row,checksum:'mismatch'}:row);
  }
  return docs.map(({stream,checksum,source_bytes})=>({stream,checksum,source_bytes}));
 };
 return {files,authenticate,read,tamper:()=>{badReadback=true},change:()=>{changed=true}};
}

test('archives every stream, verifies byte-for-byte restores, and reuses a retried archive',async()=>{
 const {files,read,authenticate,tamper}=fixture();
 const restored=[];
 const result=await archiveWorkerHistoryDay(env,scope,read,authenticate,row=>restored.push(row));
 assert.equal(result.documents,30);
 assert.equal(result.parts,1);
 assert.equal(result.restored,30);
 assert.equal(restored[29].stream,'points_29');
 assert.equal(files.size,2);
 const manifest=JSON.parse([...files].find(([name])=>name.includes('-manifest-'))[1].body);
 assert.equal(manifest.documents,30);
 assert.equal(manifest.parts[0].documents,30);
 await archiveWorkerHistoryDay(env,scope,read,authenticate);
 assert.equal(files.size,2);
 tamper();
 await assert.rejects(archiveWorkerHistoryDay(env,scope,read,authenticate),/readback did not match/);
});

test('never publishes a manifest for a changed or corrupt source document',async()=>{
 const {files,read,authenticate,change}=fixture();
 change();
 await assert.rejects(archiveWorkerHistoryDay(env,scope,read,authenticate),/source did not verify/);
 assert.equal(files.size,0);
});

test('the daily schedule rotates each sport and selects Toronto history dates',()=>{
 const start=Date.parse('2026-11-09T09:10:00Z');
 const entries=Array.from({length:8},(_,i)=>workerHistoryBackupScope(start+i*60000));
 assert.equal(new Set(entries.map(item=>item.sport)).size,8);
 assert(entries.every(item=>item.day==='2026-11-03'));
 assert.equal(workerHistoryBackupScope(Date.parse('2026-11-09T04:16:00Z'),true).day,'2026-11-07');
 // Toronto midnight rolls at 05:00Z in November; a morning replay must
 // inspect yesterday, not the day before yesterday.
 assert.equal(workerHistoryBackupScope(Date.parse('2026-11-10T16:00:00Z'),true).day,'2026-11-09');
 assert.equal(workerHistoryBackupScope(Date.parse('2026-11-10T04:59:00Z'),true).day,'2026-11-08');
});

test('the two-minute recent grading replay covers every sport instead of only even indices',()=>{
 const start=Date.parse('2026-11-10T04:00:00Z');
 const scopes=Array.from({length:8},(_,i)=>workerHistoryBackupScope(start+i*120000,true));
 assert.equal(new Set(scopes.map(x=>x.sport)).size,8);
 assert(scopes.every(x=>x.day==='2026-11-08'));
});

test('successive checks of the same sport advance independent replay batches',()=>{
 const start=Date.parse('2026-11-10T04:02:00Z');
 const observations=Array.from({length:4},(_,i)=>{
  const time=start+i*16*60000;
  return {sport:workerHistoryBackupScope(time,true).sport,batch:Math.floor(time/(16*60_000))};
 });
 assert.equal(new Set(observations.map(x=>x.sport)).size,1);
 assert.equal(new Set(observations.map(x=>x.batch)).size,4);
});
