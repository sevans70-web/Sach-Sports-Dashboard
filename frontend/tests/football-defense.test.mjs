import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {footballObservedRows}=await loadTs(new URL('../lib/football-observed-stats.ts',import.meta.url));
const {footballBookRows}=await loadTs(new URL('../lib/football-book-quotes.ts',import.meta.url));
const {NFL_ACTIVE_MARKETS}=await loadTs(new URL('../lib/nfl.ts',import.meta.url));
test('defense markets retain exact two-way book quotes and official fractional or zero sacks',()=>{
 for(const key of ['sacks','tackles','tackles_assists'])assert.ok(NFL_ACTIVE_MARKETS.some(m=>m[0]===key));
 const p={boxscore:{players:[{team:{abbreviation:'A'},statistics:[{name:'defensive',labels:['TOT','SOLO','SACKS'],athletes:[{athlete:{id:'1',displayName:'A Defender'},stats:['7','4','0.5']},{athlete:{id:'2',displayName:'B Defender'},stats:['0','0','0']},{athlete:{id:'3',displayName:'C Defender'},stats:['3','2','--']}]}]}]}};
 const rows=footballObservedRows(p);assert.equal(rows[0].stats.sacks,.5);assert.equal(rows[0].stats.tackles,4);assert.equal(rows[0].stats.tackles_assists,7);assert.equal(rows[1].stats.sacks,0);assert.equal(rows[2].stats.sacks,null);
 const now=Date.parse('2026-10-25T12:00Z'),stamp=new Date(now).toISOString();
 const feed={data:[{gameId:'g',awayTeam:'A',homeTeam:'B',commenceTime:'2026-10-25T20:00Z',books:[{key:'draftkings',title:'DraftKings',lastUpdate:stamp,props:[{category:'sacks',playerName:'A Defender',line:.5,overPrice:120,underPrice:-140,propId:'sack-main'}]}]}]};
 const quotes=footballBookRows(feed,'sacks',['sacks'],now);assert.equal(quotes.length,1);assert.equal(quotes[0].line,.5);assert.equal(quotes[0].overPrice,120);assert.equal(quotes[0].underPrice,-140);
});
