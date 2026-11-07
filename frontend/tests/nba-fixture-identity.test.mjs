import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './load-ts.mjs';
const {nbaQuotePlayerFixtureKey,nbaOfficialPlayerFixtureKey}=await loadTs(new URL('../lib/nba-fixture-identity.ts',import.meta.url));
test('NBA same-player back-to-back quotes remain distinct while same-game books dedupe',()=>{
 const today={playerName:'Nikola Jokic',gameTime:'2026-11-07T23:00Z',matchup:'Denver Nuggets @ LA Lakers'};
 const sameGame={...today};
 const nextDay={...today,gameTime:'2026-11-08T23:00Z',matchup:'Denver Nuggets @ Golden State Warriors'};
 assert.equal(nbaQuotePlayerFixtureKey(today),nbaQuotePlayerFixtureKey(sameGame));
 assert.notEqual(nbaQuotePlayerFixtureKey(today),nbaQuotePlayerFixtureKey(nextDay));
 assert.equal(nbaQuotePlayerFixtureKey({...today,playerName:'Nikola Jokić'}),nbaQuotePlayerFixtureKey(today));
});
test('Official roster selection never collapses two separate fixtures for the same player',()=>{
 assert.equal(nbaOfficialPlayerFixtureKey({gameId:'a',playerId:'123'}),nbaOfficialPlayerFixtureKey({gameId:'a',playerId:'123'}));
 assert.notEqual(nbaOfficialPlayerFixtureKey({gameId:'a',playerId:'123'}),nbaOfficialPlayerFixtureKey({gameId:'b',playerId:'123'}));
 assert.notEqual(nbaOfficialPlayerFixtureKey({gameId:'a',playerId:'123'}),nbaOfficialPlayerFixtureKey({gameId:'a',playerId:'456'}));
});
