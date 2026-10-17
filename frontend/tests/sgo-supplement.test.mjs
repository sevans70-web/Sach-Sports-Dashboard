import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {getSgoSupplement,sgoNbaGames}=await loadTs(new URL('../lib/sgo-supplement.ts',import.meta.url));
const {nbaPropMatchesGame}=await loadTs(new URL('../lib/nba-game-match.ts',import.meta.url));
test('all football markets share one authenticated league request and honor rate-limit cooldown',async()=>{
 const old=globalThis.fetch,key=process.env.SPORTSGAMEODDS_API_KEY;process.env.SPORTSGAMEODDS_API_KEY='test-only';let calls=0;
 try{globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({data:[{eventID:'1'}]}),{status:200})};
 const results=await Promise.all(Array.from({length:14},()=>getSgoSupplement('NFL')));assert.equal(calls,1);assert.ok(results.every(x=>x.data[0].eventID==='1'));
 globalThis.fetch=async()=>{calls++;return new Response('{}',{status:429,headers:{'retry-after':'120'}})};
 const limited=await getSgoSupplement('NBA');assert.match(limited.warning,/429/);const waiting=await getSgoSupplement('NCAAF');assert.match(waiting.warning,/retry window/);assert.equal(calls,2);
 }finally{globalThis.fetch=old;if(key==null)delete process.env.SPORTSGAMEODDS_API_KEY;else process.env.SPORTSGAMEODDS_API_KEY=key}
});
test('supplement resolves player dictionary and structured quarter odds without changing the period',()=>{
 const games=sgoNbaGames({data:[{teams:{away:{names:{long:'LA Clippers'}},home:{names:{long:'Phoenix Suns'}}},players:{player:{name:'Example Player'}},odds:{one:{playerID:'player',statID:'points',periodID:'1q',sideID:'over',bookOverUnder:5.5,bookOdds:'-110'}}}]});
 assert.equal(games[0].awayTeam,'LA Clippers');assert.equal(games[0].books[0].props[0].playerName,'Example Player');assert.equal(games[0].books[0].props[0].periodID,'1q');
});
test('NBA props require the correct opponent and day, never the nearest scheduled game',()=>{
 const game={awayTeam:'LA Clippers',homeTeam:'Phoenix Suns',tipoff:'2026-10-17T23:00:00Z'},prop={matchup:'Los Angeles Clippers @ Phoenix Suns',gameTime:'2026-10-17T23:00:00Z'};
 assert.equal(nbaPropMatchesGame(prop,game),true);assert.equal(nbaPropMatchesGame({...prop,gameTime:'2026-10-19T23:00:00Z'},game),false);assert.equal(nbaPropMatchesGame({...prop,matchup:'LA Clippers @ Los Angeles Lakers'},game),false);
});
