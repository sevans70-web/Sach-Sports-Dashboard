import test from 'node:test';import assert from 'node:assert/strict';import ts from 'typescript';import vm from 'node:vm';import {createRequire} from 'node:module';import {readFile,mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
const nodeRequire=createRequire(import.meta.url);
test('capture publishes a durable local snapshot before slow or failed featured replication and grading',async()=>{
 const root=await mkdtemp(join(tmpdir(),'sach-capture-response-')),deferred=[],snapshots=[],requests=[];let publications=0;
 const archive={historyArchiveStatus:async()=>({ok:true,root}),torontoHistoryDay:()=> '2026-10-25',appendHistorySnapshot:async(sport,market,payload)=>{snapshots.push({sport,market,payload});return {written:true,count:1}}};
 const imports={
  '@/lib/history-lock':{withHistoryLock:async(key,fn)=>fn()},
  '@/lib/research-capture':{publishFeaturedBoards:async()=>{publications++;throw Error('cloud unavailable')},featuredBoardsFromCapture:p=>[p]},
  '@/lib/hidden-sport-game-capture':{captureHiddenSportGames:async()=>({success:true,saved:0,errors:[]})},
  'next/server':{after:fn=>deferred.push(fn),NextResponse:{json:p=>p}},
  '@/lib/internal-app-origin':{internalAppOrigin:()=> 'http://internal'},
  '@/lib/nfl':{NFL_ACTIVE_MARKETS:[['passing_yards']]},'@/lib/cfb':{CFB_MARKETS:[]},'@/lib/mlb':{BATTER_MARKETS:[],PITCHER_MARKETS:[]},'@/lib/history-archive':archive
 };
 const source=await readFile(new URL('../app/api/history/capture/route.ts',import.meta.url),'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const module={exports:{}};vm.runInNewContext(code,{module,exports:module.exports,require:name=>imports[name]||nodeRequire(name),process:{env:{SACH_HISTORY_DIR:root}},console:{log(){},error(){}},AbortController,setTimeout,clearTimeout,Buffer,fetch:async url=>{requests.push(url);return url.includes('/performance')?Response.json({success:false,error:'remote grading unavailable'},{status:503}):Response.json({success:true,market:'passing_yards',rows:[{playerId:'original',sportsbookLine:245.5}]})}});
 try{
 const result=await module.exports.GET({nextUrl:new URL('http://internal/api/history/capture?sport=nfl')});
 assert.equal(result.success,true);assert.equal(result.gradingPending,true);assert.equal(result.saved,1);assert.equal(snapshots.length,1);assert.equal(publications,0);assert.equal(requests.length,1);assert.equal(snapshots[0].payload.rows[0].sportsbookLine,245.5);
 for(const work of deferred)await work();
 assert.equal(publications,1);assert.ok(requests.some(url=>url.includes('/performance')));assert.equal(snapshots.length,1);
 const manifest=JSON.parse(await readFile(join(root,'_system','last-capture.json'),'utf8'));
 assert.equal(manifest.sports.nfl.captureSuccess,true);assert.equal(manifest.sports.nfl.gradingPending,false);assert.equal(manifest.sports.nfl.success,false);
 }finally{await rm(root,{recursive:true,force:true})}
});
