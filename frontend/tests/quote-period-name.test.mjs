import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {footballBookRows}=await loadTs(new URL('../lib/football-book-quotes.ts',import.meta.url));
const {mainMarketQuotes}=await loadTs(new URL('../lib/main-market-quotes.ts',import.meta.url));
const now=Date.now();
function payload(prop){return {data:[{awayTeam:'Away',homeTeam:'Home',commenceTime:new Date(now+3600000).toISOString(),books:[{key:'fanduel',props:[{playerName:'Player',category:'points',line:10.5,overPrice:-110,underPrice:-110,lastUpdate:new Date(now).toISOString(),...prop}]}]}]};}
test('named periods cannot leak into full-game basketball or hockey quotes',()=>{
 for(const market of ['points','rebounds','assists','shots_on_goal','goals','goalie_saves']){
  assert.equal(mainMarketQuotes(payload({category:market,periodName:'First Quarter'}),market,()=>true).length,0);
  assert.equal(mainMarketQuotes(payload({category:market,periodName:'Full Game'}),market,()=>true).length,1);
 }
});
test('football accepts named Q1 evidence only for the matching period',()=>{
 const q={category:'q1_passing_yards',line:45.5};
 assert.equal(footballBookRows(payload({...q,periodName:'Second Quarter'}),'q1_passing_yards',['q1_passing_yards'],now).length,0);
 const [r]=footballBookRows(payload({...q,periodName:'First Quarter'}),'q1_passing_yards',['q1_passing_yards'],now);
 assert.equal(r.sourcePeriod,'First Quarter');assert.equal(r.line,45.5);
});
test('alternate scorer contracts cannot masquerade as anytime TD or first basket quotes',()=>{
 for(const flag of [{isAlternate:true},{isMainLine:false},{marketStructure:'milestone'},{lineType:'ladder'}]){
  assert.equal(footballBookRows(payload({category:'anytime_td',underPrice:null,...flag}),'anytime_td',['anytime_td'],now).length,0);
  assert.equal(mainMarketQuotes(payload({category:'first_basket',underPrice:null,...flag}),'first_basket',()=>true).length,0);
 }
 assert.equal(footballBookRows(payload({category:'anytime_td',underPrice:null}),'anytime_td',['anytime_td'],now).length,1);
});
