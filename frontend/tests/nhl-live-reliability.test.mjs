import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {rankingResponse}=await loadTs(new URL('../lib/ranking-response-cache.ts',import.meta.url));
const {refreshNhlObservations}=await loadTs(new URL('../lib/live-nhl-observations.ts',import.meta.url));
const {mergeSavedNhlSlateRows}=await loadTs(new URL('../lib/recorded-progress.ts',import.meta.url));
const {originalPregameQuote}=await import('../scripts/worker-pregame-capture.mjs');
const now=Date.parse('2026-11-14T18:00:00Z');
const quote={sport:'nhl',market:'shots_on_goal',playerId:'1',playerName:'Player',teamName:'A',teamId:'A',gameId:'10',season:'20262027',gameTime:'2026-11-14T17:00:00Z',gameState:'pre',sportsbook:'Book',sportsbookKey:'book',quoteId:'q',quoteVersion:1,marketBacked:true,quoteVerified:true,lineType:'main',sportsbookLine:2.5,overPrice:100,underPrice:100,quoteUpdatedAt:'2026-11-14T16:55:00Z',capturedAt:'2026-11-14T16:56:00Z',researchForecast:{projection:3,modelSelection:{side:'OVER',line:2.5,price:100,quoteId:'q',sportsbookKey:'book',calculatedAt:'2026-11-14T16:56:00Z'},priceComparison:{overProbability:.6,underProbability:.4,pushProbability:0}}};
test('NHL restores saved picks outside a new baseline top25 without altering receipt fields or refitting a started game',()=>{
 const pick=originalPregameQuote(quote,'nhl','shots_on_goal',Date.parse('2026-11-14T16:57:00Z')),before=JSON.stringify(pick);
 const rows=Array.from({length:25},(_,i)=>({...quote,playerId:String(i+20),sportsbookLine:null,rank:i+1}));
 const game={gameId:'10',tipoff:quote.gameTime,state:'in',awayAbbr:'A',homeAbbr:'B'};
 const restored=mergeSavedNhlSlateRows(rows,'shots_on_goal',[game],[],[pick],now);assert.equal(restored.added,1);assert.equal(restored.rows.length,26);const r=restored.rows.at(-1);assert.equal(r.playerId,'1');assert.equal(r.researchForecast.modelSelection.side,'OVER');assert.equal(r.sportsbookLine,2.5);assert.equal(r.boardCapturedAt,'2026-11-14T16:57:00.000Z');assert.equal(r.boardFrozen,true);assert.equal(JSON.stringify(pick),before);
 for(const bad of [{...pick,checksum:'f'.repeat(64)},{...pick,market:'goals'}])assert.equal(mergeSavedNhlSlateRows(rows,'shots_on_goal',[game],[],[bad],now).added,0);
 assert.equal(mergeSavedNhlSlateRows(rows,'shots_on_goal',[{...game,tipoff:'2026-11-14T17:10:00Z'}],[],[pick],now).added,0);
});
test('NHL refresh bounds all player batches by one deadline, rejects failed evidence and skips unpriced/frozen cards',async()=>{
 const future={...quote,gameTime:'2026-11-14T20:00:00Z',quoteUpdatedAt:'2026-11-14T17:59:00Z'};
 const players=Array.from({length:20},(_,i)=>({...future,playerId:String(i+1)}));let calls=0;
 const read=async(_url,{signal})=>{calls++;return new Promise((_,reject)=>{const keep=setTimeout(()=>reject(Error('stalled')),1000);signal.addEventListener('abort',()=>{clearTimeout(keep);reject(Error('timeout'));},{once:true});});};
 const start=Date.now();const r=await refreshNhlObservations([...players,{...future,playerId:'99',sportsbookLine:null},{...future,playerId:'98',boardFrozen:true}],now,read,25);assert.ok(Date.now()-start<250);assert.equal(calls,4);assert.equal(r.requestedPlayers,20);assert.equal(r.unavailablePlayers.length,20);assert.equal(r.budgetExceeded,true);
});
test('NHL cache joins concurrent builds, attaches stale refresh lifetime and recovers after an unresolved build deadline',async()=>{
 const key='nhl|test-'+Math.random();let calls=0;const build=async()=>({success:true,rows:[{gameTime:new Date(Date.now()+3600000).toISOString()}],calls:++calls});
 const [a,b]=await Promise.all([rankingResponse(key,build),rankingResponse(key,build)]);assert.strictEqual(a,b);assert.equal(calls,1);
 const clock=Date.now;let owned=false;try{Date.now=()=>clock()+21000;await rankingResponse(key,build,false,{keepAlive:p=>{owned=true;p.catch(()=>{});}});assert.equal(owned,true);}finally{Date.now=clock;}
 const hung='nhl|hung-'+Math.random();await assert.rejects(rankingResponse(hung,()=>new Promise(()=>{}),false,{timeoutMs:15}),/timed out/);assert.equal((await rankingResponse(hung,build)).success,true);
});
test('NHL rejected feed cannot overwrite a last verified response or renew its receipt timestamp',async()=>{const key='nhl|denied-'+Math.random(),clock=Date.now,base=clock();let work;const original={success:true,rows:[{playerId:'verified',gameTime:new Date(base+3600000).toISOString()}]};try{Date.now=()=>base;await rankingResponse(key,async()=>original);Date.now=()=>base+21000;const failed={success:false,dataState:'unavailable',rows:[],error:'The NHL sportsbook feed denied access (403).',coverageNotice:'Feed denied',sourceCoverage:{bookFeedCoverage:{primary:{code:'provider_http_403'}}}};const immediate=await rankingResponse(key,async()=>failed,false,{keepAlive:p=>work=p});assert.deepEqual(immediate.rows,original.rows);await work;const retained=await rankingResponse(key,async()=>failed);assert.equal(retained.dataState,'stale');assert.equal(retained.observedAt,new Date(base).toISOString());assert.deepEqual(retained.rows,original.rows);Date.now=()=>base+61000;const expired=await rankingResponse(key,async()=>failed);assert.equal(expired.success,false);assert.equal(expired.rows.length,0);}finally{Date.now=clock;}});
