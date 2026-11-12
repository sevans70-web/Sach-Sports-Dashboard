import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './load-ts.mjs';
const {archivedProgressQuote}=await loadTs(new URL('../lib/recorded-progress.ts',import.meta.url));
const {cardProgressLine,cardObservedProgress}=await loadTs(new URL('../lib/card-results.ts',import.meta.url));
const start='2026-10-20T19:00:00Z',now=Date.parse('2026-10-20T20:00:00Z');
const saved={gameId:'g',playerId:'p',gameTime:start,market:'points',quoteVerified:true,quoteVersion:1,sportsbook:'Book',sportsbookKey:'book',quoteId:'q',lineType:'main',sportsbookLine:10.5,overPrice:-110,underPrice:-110,quoteUpdatedAt:'2026-10-20T18:58:00Z',capturedAt:'2026-10-20T18:59:00Z'};
const snapshot={capturedAt:'2026-10-20T18:59:30Z',payload:{kind:'research_rankings',market:'points',rows:[saved]}};
const live={...saved,gameState:'in',sportsbookLine:null,quoteVerified:false,capturedAt:'2026-10-20T20:00:00Z'};
test('live NBA progress uses a verified archived pregame threshold without restoring a pick or changing current quotes',()=>{
 const before=JSON.stringify(live),progressQuote=archivedProgressQuote(live,[snapshot],now);
 assert.equal(progressQuote.sportsbookLine,10.5);
 assert.equal(JSON.stringify(live),before);
 const line=cardProgressLine({...live,progressQuote},null,'points');
 assert.equal(line,10.5);
 assert.equal(cardObservedProgress(7,line,'points').remaining,3.5);
 assert.equal(cardObservedProgress(0,line,'points').percent,0);
 assert.equal(cardObservedProgress(15,line,'points').percent,100);
 assert.equal(progressQuote.prediction,undefined);
});
test('live, late, stale, unverified, cross-player, cross-fixture and other-market archive rows cannot become progress lines',()=>{
 for(const patch of [{playerId:'other'},{gameId:'other'},{market:'rebounds'},{gameTime:'2026-10-21T19:00:00Z'},{quoteVerified:false},{capturedAt:'2026-10-20T19:01:00Z'},{quoteUpdatedAt:'2026-10-20T18:00:00Z'},{overPrice:null}]){
  assert.equal(archivedProgressQuote(live,[{...snapshot,payload:{...snapshot.payload,rows:[{...saved,...patch}]}}],now),null);
 }
 assert.equal(archivedProgressQuote(live,[{...snapshot,capturedAt:'2026-10-20T19:01:00Z'}],now),null);
 assert.equal(archivedProgressQuote(live,[],now),null);
 const progressQuote=archivedProgressQuote(live,[snapshot],now);
 assert.equal(cardProgressLine({...live,playerId:'other',progressQuote},null,'points'),null);
 assert.equal(cardProgressLine({...live,progressQuote},null,'rebounds'),null);
});

test('NHL progress recovers an immutable pregame quote for the exact player, game and market',async()=>{
 const {originalPregameQuote}=await import('../scripts/worker-pregame-capture.mjs');
 const {immutableNhlProgressQuote}=await loadTs(new URL('../lib/recorded-progress.ts',import.meta.url));
 const row={...saved,market:'shots_on_goal',gameId:'2026020142',playerId:'8478402',playerName:'Player',
  marketBacked:true,sportsbookLine:2.5,quoteUpdatedAt:'2026-10-20T18:56:00Z'};
 const receipt=originalPregameQuote(row,'nhl',row.market,Date.parse('2026-10-20T18:57:00Z'));
 assert.ok(receipt);
 const live={...row,sportsbookLine:null,gameState:'in'};
 const progressQuote=immutableNhlProgressQuote(live,receipt,now);
 assert.equal(progressQuote?.sportsbookLine,2.5);
 assert.equal(progressQuote?.prediction,undefined);
 const line=cardProgressLine({...live,progressQuote},null,live.market);
 assert.equal(cardObservedProgress(null,line,live.market),null);
 assert.equal(cardObservedProgress(0,line,live.market).percent,0);
 assert.equal(cardObservedProgress(1,line,live.market).percent,40);
 assert.equal(cardObservedProgress(3,line,live.market).percent,100);
 assert.equal(immutableNhlProgressQuote({...live,playerId:'8478403'},receipt,now),null);
 assert.equal(immutableNhlProgressQuote({...live,gameId:'2026020143'},receipt,now),null);
 assert.equal(immutableNhlProgressQuote({...live,market:'points'},receipt,now),null);
 assert.equal(immutableNhlProgressQuote(live,{...receipt,checksum:'f'.repeat(64)},now),null);
});
