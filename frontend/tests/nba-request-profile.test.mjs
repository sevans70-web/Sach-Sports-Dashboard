import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {nbaOfficialFetch,nflOfficialFetch}=await loadTs(new URL('../lib/official-history-source.ts',import.meta.url));
const nba=id=>`https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${id}/gamelog?season=2027`;
test('NBA initial request preserves the existing public application profile while NFL and redirect/cancellation safeguards remain unchanged',async()=>{
 const old=globalThis.fetch,calls=[];try{
  globalThis.fetch=async(u,i)=>{calls.push({url:String(u),agent:new Headers(i.headers).get('User-Agent'),redirect:i.redirect,cache:i.cache,signal:i.signal});return Response.json({seasonTypes:[],events:{}});};
  await nbaOfficialFetch(nba(901));await nflOfficialFetch('https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/901/gamelog?season=2026');
  assert.equal(calls[0].agent,'Mozilla/5.0 (compatible; SachSports/1.0)');assert.equal(calls[1].agent,'SachSports/1.0');assert.equal(calls[0].cache,'no-store');assert.ok(calls.every(c=>c.redirect==='manual'&&c.signal));
 }finally{globalThis.fetch=old;}
});
test('NBA genuine403 remains a denial: no profile switch, host switch or second request',async()=>{
 const old=globalThis.fetch,calls=[];try{
  globalThis.fetch=async(u,i)=>{calls.push({url:String(u),agent:new Headers(i.headers).get('User-Agent')});return new Response('{}',{status:403});};
  assert.equal((await nbaOfficialFetch(nba(902))).status,403);assert.equal((await nbaOfficialFetch(nba(902))).status,403);assert.equal(calls.length,1);assert.equal(calls[0].url,nba(902));
 }finally{globalThis.fetch=old;}
});
