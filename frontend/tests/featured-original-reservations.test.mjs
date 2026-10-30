import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {selectFeaturedCandidates}=await loadTs(new URL('../lib/top-plays.ts',import.meta.url));
const p=(id,probability=70,expectedReturn=.2,price=350)=>({row:{playerId:id,market:'points',quoteId:'q-'+id,sportsbookKey:'original',sportsbookLine:10.5,gameTime:'2026-10-30T00:00Z'},probability,expectedReturn,price});
for(const sport of ['nba','nfl','cfb','nhl','cbb','soccer','wnba','mlb'])test(sport+': reserve all original identities before filling earlier/later categories from the full pool',()=>{
 const original=p('locked-value',90,.9),locked=[{key:'value',pick:original}],pool=[p('locked-value',99,1),p('next-play',80,.5),p('next-long',45,.3)];
 const cards=selectFeaturedCandidates(pool,[],sport,locked);
 assert.equal(cards.find(c=>c.key==='play').pick.row.playerId,'next-play');assert.deepEqual(cards.find(c=>c.key==='value').pick,original);assert.equal(cards.find(c=>c.key==='long').pick.row.playerId,'next-long');
 const ids=cards.filter(c=>c.pick).map(c=>c.pick.row.playerId);assert.equal(new Set(ids).size,ids.length);
 assert.deepEqual(selectFeaturedCandidates([],[],sport,locked).find(c=>c.key==='value').pick,original);
});
test('locked first basket identity cannot become a new Play of the Day; another authentic scorer remains available for Long Shot',()=>{
 const first={...p('first'),row:{...p('first').row,market:'first_basket'}},scorers=[first,{...p('other-scorer'),row:{...p('other-scorer').row,market:'first_basket'}}];
 const cards=selectFeaturedCandidates([p('first',90),p('different',75,.3,-110)],scorers,'nba',[{key:'first',pick:first}]);
 assert.equal(cards.find(c=>c.key==='play').pick.row.playerId,'different');assert.equal(cards.find(c=>c.key==='first').pick,first);assert.equal(cards.find(c=>c.key==='long').pick.row.playerId,'other-scorer');assert.equal(cards.find(c=>c.key==='value').pick,null);
});
