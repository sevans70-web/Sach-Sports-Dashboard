import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm,readFile,readdir} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {loadTs} from './load-ts.mjs';
test('research capture uses existing daily archive, keeps original evidence, and never creates a wager file',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'sach-research-')),old=process.env.SACH_HISTORY_DIR;process.env.SACH_HISTORY_DIR=dir;
 try{
  const {archiveResearchBoards}=await loadTs(new URL('../lib/research-capture.ts',import.meta.url));
  const row={integrityVersion:1,researchOnly:true,prediction:'NO PICK',giScore:null,archivedOriginal:{sportsbookLine:8.8,giScore:84.2}};
  const out=await archiveResearchBoards('nba',[{market:'points',rows:[row]},{market:'first_basket',rows:[]}]);assert.equal(out.researchArchived,true);assert.equal(out.archivedMarkets,1);
  const files=await readdir(path.join(dir,'nba'));assert.deepEqual(files.filter(f=>!f.startsWith('featured_')),['archive']);assert.equal(files.filter(f=>f.startsWith('featured_')).length,2);
  const saved=JSON.parse(await readFile(path.join(dir,'nba',files.find(f=>f.startsWith('featured_points_'))),'utf8'));assert.deepEqual(saved[0].rows,[row]);
  const {readHistorySnapshots,torontoHistoryDay}=await loadTs(new URL('../lib/history-archive.ts',import.meta.url));
  const snapshots=await readHistorySnapshots('nba','points',torontoHistoryDay());
  assert.equal(snapshots[0].payload.kind,'research_rankings');assert.equal(snapshots[0].payload.verifiedPredictions,0);assert.equal(snapshots[0].payload.rows[0].archivedOriginal.sportsbookLine,8.8);
 }finally{if(old===undefined)delete process.env.SACH_HISTORY_DIR;else process.env.SACH_HISTORY_DIR=old;await rm(dir,{recursive:true,force:true})}
});

test('scheduler extracts exact market rows from football, baseball and soccer payloads',async()=>{
 const {featuredBoardsFromCapture}=await loadTs(new URL('../lib/research-capture.ts',import.meta.url));
 const row={playerId:'7',sportsbookLine:12.5,overPrice:-110};
 for(const payload of [{rows:[row],market:'passing_yards'},{rankings:{shots:[row]}},{batter:{hits:[row]},pitcher:{strikeouts:[]}}]){
  const boards=featuredBoardsFromCapture(payload,'dashboard');assert.deepEqual(boards[0].rows,[row]);assert.ok(boards[0].market);assert.equal(boards[0].rows[0].modelProbability,undefined);
 }
 assert.deepEqual(featuredBoardsFromCapture({error:'unavailable'},'dashboard'),[]);
});
test('a failed featured publication cannot prevent immutable research snapshots being saved',async()=>{
 const {default:ts}=await import('typescript'),{default:vm}=await import('node:vm');
 const events=[],mocks={
 '@/lib/protected-history':{protectHistory:async()=>{}},
 '@/lib/history-save-policy':{pregameCheckpointRows:()=>[]},
 '@/lib/featured-selection-capture':{captureFeaturedSelections:async()=>{}},
 '@/lib/durable-history':{writeDurableHistory:async()=>{events.push('publish');throw Error('publication timeout')}},
 '@/lib/dashboard-contract':{dashboardDay:()=> '2026-10-30'},
 '@/lib/top-plays-store':{updateTopPlayMarket:()=>{}},
 '@/lib/history-archive':{appendHistorySnapshot:async()=>{events.push('archive');return {ok:true}}},
 '@/lib/history-lock':{withHistoryLock:async(_,fn)=>fn()}
 };
 const code=ts.transpileModule(await readFile(new URL('../lib/research-capture.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const module={exports:{}};vm.runInNewContext(code,{module,exports:module.exports,require:name=>mocks[name],Date,Map,Set,Error});
 const result=await module.exports.archiveResearchBoards('nhl',[{market:'shots_on_goal',rows:[{integrityVersion:1}]}]);
 assert.equal(result.researchArchived,true);assert.equal(result.archivedMarkets,1);assert.equal(events[0],'archive');assert.equal(result.publicationError,'publication timeout');assert.equal(result.archiveErrors[0].stage,'featured_publication');
});
