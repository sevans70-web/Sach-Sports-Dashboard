import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {uniqueQuoteFixture,fixtureQuoteRows}=await loadTs(new URL('../lib/main-market-quotes.ts',import.meta.url));
const game={gameId:'g',awayAbbr:'A',homeAbbr:'B',awayTeam:'Away',homeTeam:'Home',tipoff:'2026-10-30T20:00Z'};
const quote={playerName:'Player',matchup:'Away @ Home',gameTime:game.tipoff,line:10.5,overPrice:110,underPrice:-130,quoteId:'original',bookmakerCount:1};
for(const sport of ['nhl','cbb','wnba'])test(sport+': exact quote matching rejects ambiguous fixtures and never chooses a nearby opponent',()=>{
 assert.equal(uniqueQuoteFixture(quote,[game],'A'),game);
 assert.equal(uniqueQuoteFixture(quote,[game,{...game,gameId:'other'}],'A'),null);
 assert.equal(uniqueQuoteFixture(quote,[{...game,homeTeam:'Other'}],'A'),null);
 assert.equal(uniqueQuoteFixture({...quote,gameTime:'2026-10-31T20:00Z'},[game],'A'),null);
 assert.equal(uniqueQuoteFixture(quote,[game],''),null);
 assert.equal(uniqueQuoteFixture(quote,[game,game],'A'),game);
});
test('fixture resolution precedes player deduplication and preserves exact per-game quote evidence',()=>{
 const next={...game,gameId:'next',tipoff:'2026-10-31T20:00Z'},later={...quote,gameTime:next.tipoff,quoteId:'later',bookmakerCount:4};
 const rows=fixtureQuoteRows([later,quote],[game],()=> 'A',s=>s.toLowerCase());
 assert.equal(rows.length,1);assert.equal(rows[0].quote,quote);assert.equal(rows[0].game,game);
 const both=fixtureQuoteRows([later,quote],[game,next],()=> 'A',s=>s.toLowerCase());assert.equal(both.length,2);
 assert.deepEqual(both.map(r=>r.quote.quoteId),['later','original']);
});
