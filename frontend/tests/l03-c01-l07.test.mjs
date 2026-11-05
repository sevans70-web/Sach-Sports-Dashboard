import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {loadTs} from './load-ts.mjs';
const {gameRankingEvidence}=await loadTs(new URL('../lib/card-intelligence.ts',import.meta.url));
const {savedCfbWindow,savedCfbResult}=await loadTs(new URL('../lib/saved-cfb-results.ts',import.meta.url));
const {publicPropContext}=await loadTs(new URL('../lib/public-prop-context.ts',import.meta.url));
test('C01 all five sports use the fitted projection without replacing the original baseline',()=>{
 for(const sport of ['nba','nfl','nhl','cbb','cfb'])for(const market of ['points','q1_points']){const r={sport,integrityVersion:1,researchOnly:true,gameTime:'2099-01-01',modelProjection:25,researchForecast:{status:'available',projection:7.5},quoteVerified:true,sportsbookLine:8.5};assert.equal(gameRankingEvidence(r,market).modelProjection,7.5);assert.equal(gameRankingEvidence({...r,researchForecast:{status:'unavailable'}},market).modelProjection,null);assert.equal(r.modelProjection,25);}
});
test('L03 saved windows use Toronto time and retain pending, void and unverified result states',()=>{
 assert.equal(savedCfbWindow('2026-11-07T18:00Z'),'12 PM');assert.equal(savedCfbWindow('2026-11-07T21:00Z'),'Afternoon');assert.equal(savedCfbWindow('2026-11-08T00:30Z'),'Evening');assert.equal(savedCfbWindow('invalid'),null);
 for(const [status,label] of [['pending','PENDING RESULT'],['void','VOID'],['unverified','RESULT UNVERIFIED'],['research','HISTORICAL FORECAST']])assert.equal(savedCfbResult({status}),label);assert.equal(savedCfbResult({actual:0}),'RESULT NOT VERIFIED');
});
test('L03 uses a single saved read and cancels obsolete period requests',async()=>{
 const page=await readFile(new URL('../app/cfb/results/page.tsx',import.meta.url),'utf8');assert.match(page,/\/api\/history\/performance\?sport=cfb/);assert.doesNotMatch(page,/\/api\/cfb\/performance|Promise\.all/);assert.match(page,/controller\.abort/);assert.match(page,/payload\.partial/);
});
test('L07 both CFB routes omit invented confidence and explain early historical context',async()=>{
 for(const route of ['rankings','rankings-board']){const source=await readFile(new URL('../app/api/cfb/'+route+'/route.ts',import.meta.url),'utf8');assert.doesNotMatch(source,/earlyConfidence/);assert.match(source,/GI reflects historical evidence depth, not betting hit probability/);}
 const c=publicPropContext({gameTime:'2099-01-01',earlyModel:true,projectionGames:8,researchForecast:{status:'unavailable'},historyLoaded:true},'cfb','passing_yards');assert.ok(c.facts.some(f=>f.includes('8 prior appearances')));assert.equal(c.modelProbability,undefined);assert.equal(c.giScore,undefined);
});
test('L03 recovers persisted board originals without grading calls and preserves zeroes',async()=>{
 const {mkdtemp,mkdir,writeFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
 const {readCfbSavedBoards}=await loadTs(new URL('../lib/cfb-saved-boards.ts',import.meta.url));
 const root=await mkdtemp(join(tmpdir(),'cfb-board-read-'));const row={playerId:'p',gameId:'g',market:'passing_yards',gameTime:'2026-11-04T23:00Z',rank:3,modelProjection:125,sportsbookLine:130.5,actualResult:0,gameState:'post',resultStatus:'miss',lockedAtKickoff:true};
 const state={day:'2026-11-04',market:'passing_yards',slate:'evening',rows:[row,{...row,playerId:'late',recoveredAfterStart:true}],locked:{original:row}};
 try{await mkdir(join(root,'cfb-ranking-boards'));const file=join(root,'cfb-ranking-boards','2026-11-04_passing_yards_evening.json');const original=JSON.stringify(state);await writeFile(file,original);
 const rows=await readCfbSavedBoards('Today',new Date('2026-11-05T03:00Z'),root);assert.equal(rows.length,1);assert.equal(rows[0].projection,125);assert.equal(rows[0].projectionBasis,'historical_baseline');assert.equal(rows[0].actual,0);assert.equal(rows[0].rank,3);assert.equal(rows[0].status,'miss');assert.equal((await readCfbSavedBoards('Yesterday',new Date('2026-11-05T03:00Z'),root)).length,0);assert.equal(await readFile(file,'utf8'),original);
 }finally{await rm(root,{recursive:true,force:true});}
});
