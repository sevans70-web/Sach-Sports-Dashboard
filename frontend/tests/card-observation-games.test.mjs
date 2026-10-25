import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {cardObservationGames}=await loadTs(new URL('../lib/card-observation-games.ts',import.meta.url));
test('archived cards request their exact official boxscores even when the current slate omits yesterday',()=>{
 for(const sport of ['nfl','cfb','nba','nhl','cbb','soccer','wnba','mlb']){
 const current={id:'200',date:'2026-10-25T23:00:00Z',state:'pre'};
 const cards=[{raw:{sport,gameId:'100'},gameTime:'2026-10-24T23:00:00Z',gameState:'final'},{raw:{gameId:'100'},gameTime:'2026-10-24T23:00:00Z',gameState:'final'}];
 assert.deepEqual(cardObservationGames([current],cards),[current,{id:'100',date:'2026-10-24T23:00:00Z',state:'post'}]);
 assert.equal(cardObservationGames([],cards).length,1);
 }
});
test('observation discovery keeps current authoritative status and never guesses IDs or results',()=>{
 const existing={id:'100',date:'2026-10-25T23:00:00Z',state:'in'};
 const cards=[{raw:{gameId:'100'},gameTime:existing.date,gameState:'pre'},{raw:{gameId:'not-official'},gameTime:existing.date},{raw:{gameId:'101'},gameTime:'bad'},{raw:{gameId:'102'},gameTime:'2026-10-24T23:00:00Z',gameState:'pre'}];
 assert.deepEqual(cardObservationGames([existing],cards),[existing,{id:'102',date:'2026-10-24T23:00:00Z',state:'pre'}]);
});
