import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {footballMatchupIndex}=await loadTs(new URL('../lib/football-matchup-inputs.ts',import.meta.url));
const date=i=>new Date(Date.UTC(2025,8,1+i*7)).toISOString();
const row=(i,teamId,opponentId,more={})=>({sport:'nfl',market:'passing_yards',season:'2025',playerId:teamId+'-qb',playerName:teamId,teamId,opponentId,gameId:'g'+i,gameTime:date(i),actual:200+i,workload:30,source:'official',retrievedAt:'2026-10-27',...more});
const history=()=>Array.from({length:6},(_,i)=>[row(i,'A','B'),row(i,'B','A')]).flat();
const target=row(8,'A','B');
test('matchup context excludes target outcomes, future games, other seasons and the 48-hour availability window',()=>{
 const source=history(),original=footballMatchupIndex(source)(target);assert.equal(original.features.length,16);
 const contaminated=[...source,target,row(8,'B','A'),row(9,'A','B',{actual:99999}),row(9,'B','A',{actual:99999}),row(7.9,'A','B',{actual:88888}),row(7.9,'B','A',{actual:88888}),row(5.5,'A','B',{season:'2024',actual:77777}),row(5.5,'B','A',{season:'2024',actual:77777})];
 assert.deepEqual(footballMatchupIndex(contaminated)({...target,actual:-99999,workload:0}),original);
 const earlier=date(4);assert.deepEqual(footballMatchupIndex(source)(target,earlier),footballMatchupIndex(source.filter(r=>Date.parse(r.gameTime)<Date.parse(earlier)-48*3600000))(target,earlier));
});
test('opponent totals include relief players while the starting QB history remains role filtered',()=>{
 const source=history(),base=footballMatchupIndex(source)(target);
 const withRelief=source.concat(row(5,'B','A',{playerId:'B-backup',actual:30,workload:2}));
 const changed=footballMatchupIndex(withRelief)(target);
 assert.deepEqual(changed.features.slice(0,13),base.features.slice(0,13));
 // Target faces B, so A's defense (B's offensive relief) does not alter B's
 // allowed history. A's own relief belongs to the opponent's allowed total.
 assert.deepEqual(changed,base);
 const ownRelief=footballMatchupIndex(source.concat(row(5,'A','B',{playerId:'A-backup',actual:30,workload:2})))(target);
 assert.deepEqual(ownRelief.features.slice(0,10),base.features.slice(0,10));assert.equal(ownRelief.features[10],base.features[10]+6);assert.equal(ownRelief.features[13],base.features[13]+6);
});
test('partial, missing, conflicting and duplicated source evidence cannot silently manufacture a matchup',()=>{
 assert.equal(footballMatchupIndex(history().filter(r=>r.teamId==='A'))(target).reason,'insufficient_prior_football_team_context');
 assert.equal(footballMatchupIndex(history())({...target,opponentId:'C'}).features,null);
 assert.throws(()=>footballMatchupIndex([...history(),history()[0]]),/Duplicate/);
 assert.throws(()=>footballMatchupIndex([...history(),row(5,'A','C',{playerId:'backup'})]),/Conflicting/);
 assert.throws(()=>footballMatchupIndex([row(1,'A','A')]),/Invalid/);
 assert.equal(footballMatchupIndex(history())(target,date(9)).features,null);
 for(const sport of ['nba','nhl','cbb','soccer','wnba','mlb'])assert.equal(footballMatchupIndex(history().map(r=>({...r,sport})))({...target,sport}).features,null);
});
