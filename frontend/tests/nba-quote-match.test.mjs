import test from 'node:test';import assert from 'node:assert/strict';
import {loadTs} from './load-ts.mjs';
const {nbaQuoteMatchesGame}=await loadTs(new URL('../lib/nba-game-match.ts',import.meta.url));
const {quoteMatchesFixture}=await loadTs(new URL('../lib/main-market-quotes.ts',import.meta.url));
const game={awayTeam:'Philadelphia 76ers',homeTeam:'New York Knicks',tipoff:'2026-10-20T23:00:00Z'};
const quote={matchup:'Philadelphia 76ers @ New York Knicks',gameTime:'2026-10-20T23:10:00Z'};
test('NBA advertised-start and court-tip differences retain the exact teams and date',()=>{
 assert.equal(nbaQuoteMatchesGame(quote,game),true);
 assert.equal(quoteMatchesFixture(quote,game),false);
 for(const change of [{gameTime:'2026-10-21T23:10:00Z'},{gameTime:'2026-10-20T23:16:00Z'},{matchup:'Philadelphia 76ers @ Brooklyn Nets'},{matchup:'New York Knicks @ Philadelphia 76ers'},{gameTime:''}])assert.equal(nbaQuoteMatchesGame({...quote,...change},game),false);
});
