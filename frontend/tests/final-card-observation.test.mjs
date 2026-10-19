import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {finalCardObservation,retainCardFinal}=await loadTs(new URL('../lib/final-card-observation.ts',import.meta.url));
const {researchFinalOutcome}=await loadTs(new URL('../lib/card-results.ts',import.meta.url));
const {publicPropContext}=await loadTs(new URL('../lib/public-prop-context.ts',import.meta.url));
function card(sport='nfl',patch={}){return {playerId:'p',market:sport==='nfl'?'passing_yards':'points',actual:119,gameState:'in',raw:{sport,gameId:'g',playerId:'p'},...patch}}
function official(c,value,at='2026-10-18T21:00:00Z'){return {...c,actual:value,gameState:'post',raw:{...c.raw,market:c.market,actualResult:value,officialFinalObservation:{sport:c.raw.sport,gameId:c.raw.gameId,playerId:c.playerId,market:c.market,value,at}}}}
test('official final corrections survive stale ranking/performance refreshes across all six active sports',()=>{
 for(const sport of ['nfl','cfb','nba','wnba','cbb','nhl']){
  const incoming=card(sport),previous=official(incoming,165),copy=structuredClone(incoming),next=retainCardFinal(incoming,previous);
  assert.equal(next.actual,165);assert.equal(next.gameState,'post');assert.equal(finalCardObservation(next.raw,next.market).value,165);assert.deepEqual(incoming,copy);
  assert.equal(retainCardFinal(incoming,official(incoming,0)).actual,0);
  assert.equal(retainCardFinal(incoming,official(incoming,-3)).actual,-3);
 }
});
test('a final observation cannot cross a player, fixture, market or sport and later official revisions win',()=>{
 const c=card(),old=official(c,165),newer=official(c,166,'2026-10-18T21:01:00Z');assert.equal(retainCardFinal(newer,old),newer);
 for(const next of [card('nfl',{playerId:'other'}),card('nfl',{market:'rushing_yards'}),card('nfl',{raw:{sport:'nfl',gameId:'other',playerId:'p'}}),card('cfb')])assert.equal(retainCardFinal(next,old),next);
 assert.equal(finalCardObservation({...old.raw,gameId:'other'},c.market),null);
 assert.equal(finalCardObservation({...old.raw,officialFinalObservation:{...old.raw.officialFinalObservation,value:null}},c.market),null);
});
test('a newly unreconciled quarter cannot regain an older final from the cache',()=>{
 const c=card('nfl',{market:'q1_passing_yards'}),old=official(c,58),unknown={...c,actual:null,raw:{...c.raw,quarterObservationChecked:true,observedQuarterValue:null}};
 assert.equal(retainCardFinal(unknown,old),unknown);assert.equal(finalCardObservation({...old.raw,...unknown.raw},c.market),null);
});
test('Huntley and McKee official finals correctly miss their frozen UNDER calls; an exact line is a push',()=>{
 const r={quoteVerified:true,frozen:true,originalResearchPick:'UNDER',originalResearchSavedAt:'2026-10-18T03:10:00Z',gameTime:'2026-10-18T17:00:00Z'};
 assert.equal(researchFinalOutcome(r,165,161.5,'passing_yards').detail,'Final 165 yards · saved UNDER 161.5');
 assert.match(researchFinalOutcome(r,165,161.5,'passing_yards').label,/❌.*UNDER MISSED/);
 assert.match(researchFinalOutcome(r,215,198.5,'passing_yards').label,/❌.*UNDER MISSED/);
 assert.match(researchFinalOutcome(r,0,.5,'passing_tds').label,/✅.*UNDER MET/);
 assert.equal(researchFinalOutcome(r,0,0,'passing_yards').label,'➖ RESEARCH PUSH');
});
test('finished card facts foreground the actual result, retain history for expansion and do not call an on-line result above it',()=>{
 const r=publicPropContext({gameState:'post',actualResult:165,quoteVerified:true,sportsbookLine:161.5},'nfl','passing_yards',[201]);
 assert.equal(r.face,'Finished with 165 yards; 3.5 above the 161.5 line.');assert.equal(r.recentAverage,201);assert.ok(r.facts.some(f=>f.includes('Last 1: 201')));
 assert.match(publicPropContext({gameState:'post',actualResult:0,quoteVerified:true,sportsbookLine:0},'nba','points',[10]).face,/on the 0 line/);
 assert.equal(publicPropContext({gameState:'post',actualResult:null},'nhl','shots_on_goal',[5]).face,'Final statistic is not available yet.');
});
