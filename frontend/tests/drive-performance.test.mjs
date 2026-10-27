import test from 'node:test';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createDrivePerformanceReader} from '../scripts/drive-performance.mjs';
const folder=(id,name)=>({id,name,mimeType:'application/vnd.google-apps.folder'});
const document=(id,name,payload,time='2026-10-25T12:00:00Z')=>{const bytes=JSON.stringify(payload);return {id,name,mimeType:'application/json',size:String(Buffer.byteLength(bytes)),md5Checksum:createHash('md5').update(bytes).digest('hex'),modifiedTime:time,bytes};};
test('all eight sports recover older exact daily copies without Supabase, choose latest versions and reject altered bytes',async()=>{
 const sports=['nfl','cfb','nba','nhl','cbb','soccer','wnba','mlb'],files=new Map(),folders=new Map([['root',[folder('backup','railway-2026-10-24')]],['backup',[folder('history','sach-history')]],['history',sports.map(s=>folder(s,s))]]);let reads=0;
 for(const sport of sports){
  const payload=[{key:sport+'-original',market:'points',status:'hit',actual:0,sportsbookLine:2.5,pickSide:'UNDER',modelProjection:1.2}];
  const old=document(sport+'-old','points_2026-10-16.json',[], '2026-10-24T12:00Z'),current=document(sport+'-current','points_2026-10-16.json',payload),bad=document(sport+'-bad','rebounds_2026-10-17.json',payload);
  files.set(old.id,old);files.set(current.id,current);files.set(bad.id,{...bad,bytes:bad.bytes+' '});
  const values=[old,current,bad,document(sport+'-derived','performance_view_Season_2026-10-27.json',[])];
  if(sport==='mlb'){folders.set(sport,[folder('mlb-performance','performance')]);folders.set('mlb-performance',values);}else folders.set(sport,values);
 }
 const request=async url=>{const u=new URL(url);assert.equal(u.hostname,'www.googleapis.com');if(u.searchParams.get('alt')==='media'){reads++;const file=files.get(u.pathname.split('/').pop());assert(file);return new Response(file.bytes);}
  const parent=u.searchParams.get('q').match(/^'([^']+)' in parents/)[1];return Response.json({files:folders.get(parent)||[]});};
 const read=createDrivePerformanceReader({folderId:'root',request});
 for(const sport of sports){const result=await read(sport,'2025-10-23');assert.equal(result.rows.length,1);assert.equal(result.rows[0].payload[0].key,sport+'-original');assert.equal(result.rows[0].payload[0].actual,0);assert.equal(result.rows[0].payload[0].modelProjection,1.2);assert.deepEqual(result.errors,['rebounds|2026-10-17:unavailable']);}
 assert.equal(reads,16);await read('nfl','2025-10-23');assert.equal(reads,16);
 const today=await read('nfl','2026-10-27');assert.deepEqual(today,{rows:[],errors:[]});assert.equal(reads,16);
});
test('bounded jobs resume from verified copies and inventory failures retain earlier records',async()=>{
 let clock=1000,reads=0,fail=false;
 const docs=Array.from({length:3},(_,i)=>document('doc'+i,'points_2026-10-'+(16+i)+'.json',[{actual:i}]));
 const request=async url=>{const u=new URL(url);if(u.searchParams.get('alt')==='media'){reads++;clock+=20;return new Response(docs.find(d=>d.id===u.pathname.split('/').pop()).bytes);}if(fail)throw Error('offline');const p=u.searchParams.get('q').match(/^'([^']+)'/)[1];return Response.json({files:p==='root'?[folder('backup','railway-2026-10-24')]:p==='backup'?[folder('history','sach-history')]:p==='history'?[folder('nfl','nfl')]:docs});};
 const read=createDrivePerformanceReader({folderId:'root',request,now:()=>clock,budgetMs:30});
 const first=await read('nfl');assert.equal(first.rows.length,2);assert.deepEqual(first.errors,['points|2026-10-18:checking']);
 clock+=5001;const second=await read('nfl');assert.equal(second.rows.length,3);assert.deepEqual(second.errors,[]);assert.equal(reads,3);
 fail=true;clock+=300001;const outage=await read('nfl');assert.equal(outage.rows.length,3);assert.deepEqual(outage.errors,['unavailable']);
});

test('snapshot archives stream UTF-8 records, deduplicate repeated observations and discard all staged rows if the full checksum fails',async()=>{
 const snapshot={capturedAt:'2026-10-16T10:00Z',payload:[{key:'original',playerName:'José { \\" }',market:'points',status:'hit',actual:0}]};
 const file=document('archive','snapshots_points_2026-10-16.json',[snapshot,snapshot]);let altered=false;
 const request=async url=>{const u=new URL(url);if(u.searchParams.get('alt')==='media'){const bytes=Buffer.from(file.bytes+(altered?' ':''));return new Response(new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=7)c.enqueue(bytes.subarray(i,i+7));c.close();}}));}const p=u.searchParams.get('q').match(/^'([^']+)'/)[1];return Response.json({files:p==='root'?[folder('backup','railway-2026-10-24')]:p==='backup'?[folder('history','sach-history')]:p==='history'?[folder('nba','nba')]:[file]});};
 const options={folderId:'root',request,projectSnapshot:(_s,_m,_d,snapshot)=>snapshot.payload};
 const result=await createDrivePerformanceReader(options)('nba');assert.deepEqual(result.errors,[]);assert.equal(result.rows.length,1);assert.equal(result.rows[0].stream,'archive_records_snapshots_points');assert.deepEqual(result.rows[0].payload,snapshot.payload);
 altered=true;const corrupt=await createDrivePerformanceReader(options)('nba');assert.deepEqual(corrupt.rows,[]);assert.deepEqual(corrupt.errors,['snapshots_points|2026-10-16:unavailable']);
});

test('server continuation finishes bounded recovery without another browser request and does not fast-loop on failed reads',async()=>{
 let clock=1000,downloads=0;const jobs=[],docs=Array.from({length:3},(_,i)=>document('d'+i,'points_2026-10-'+(16+i)+'.json',[{actual:i}]));
 const request=async url=>{const u=new URL(url);if(u.searchParams.get('alt')==='media'){downloads++;clock+=20;return new Response(docs.find(d=>d.id===u.pathname.split('/').pop()).bytes);}const p=u.searchParams.get('q').match(/^'([^']+)'/)[1];return Response.json({files:p==='root'?[folder('backup','railway-2026-10-24')]:p==='backup'?[folder('history','sach-history')]:p==='history'?[folder('nfl','nfl')]:docs});};
 const read=createDrivePerformanceReader({folderId:'root',request,now:()=>clock,budgetMs:30,schedule:job=>jobs.push(job)});
 const first=await read('nfl');assert.equal(first.rows.length,2);assert.equal(jobs.length,1);clock+=5001;await jobs.shift()();assert.equal(downloads,3);assert.equal(jobs.length,0);assert.equal((await read('nfl')).rows.length,3);
 const corrupt=createDrivePerformanceReader({folderId:'root',request:async url=>String(url).includes('alt=media')?new Response('bad'):request(url),schedule:job=>jobs.push(job)});const failed=await corrupt('nfl');assert.equal(failed.rows.length,0);assert.equal(jobs.length,0);
});
