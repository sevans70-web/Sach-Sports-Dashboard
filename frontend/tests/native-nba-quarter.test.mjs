import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {nativeNbaQuarterRows:rows}=await loadTs(new URL('../lib/native-nba-quarter.ts',import.meta.url));
const now=Date.parse('2026-10-29T18:00:00Z'),overview={games:[{gameId:'g',tipoff:'2026-10-30T02:00:00Z',awayTeam:'Memphis Grizzlies',homeTeam:'Portland Trail Blazers',awayAbbr:'MEM',homeAbbr:'POR'}],players:[{playerId:'1',playerName:'Jaylen Wells',team:'MEM'},{playerId:'2',playerName:'Donovan Clingan',team:'POR'}]};
const runner=(name,handicap,price)=>({runnerName:name,runnerStatus:'ACTIVE',handicap,winRunnerOdds:{americanDisplayOdds:{americanOdds:price}}});
const main={marketId:'m',eventId:'e',marketType:'PLAYER_I_1ST_QUARTER_POINTS',marketStatus:'OPEN',bettingType:'MOVING_HANDICAP',runners:[runner('Jaylen Wells Over',2.5,-118),runner('Jaylen Wells Under',2.5,-112)]};
const payload=markets=>({meta:{ageSeconds:3},data:{events:[{eventId:'e',name:'Memphis Grizzlies @ Portland Trail Blazers',openDate:'2026-10-30T02:10:00Z'}],markets}});
test('native NBA Q1 main quote preserves exact pair and unique official fixture/player',()=>{
 const [r]=rows(payload([main]),now,overview,'q1_points',now);assert.equal(r.playerId,'1');assert.equal(r.gameId,'g');assert.equal(r.sportsbookLine,2.5);assert.equal(r.overPrice,-118);assert.equal(r.underPrice,-112);assert.equal(r.lineType,'main');assert.equal(r.modelProjection,null);assert.equal(r.modelProbability,null);assert.equal(r.quotePeriod,'q1');
 for(const o of [{...overview,players:[]},{...overview,games:[...overview.games,...overview.games]},{...overview,players:[{...overview.players[0],team:'LA'}]}])assert.equal(rows(payload([main]),now,o,'q1_points',now).length,0);
});
test('stale, missing-age, suspended, mismatched line/name, full-game and other-period quotes fail closed',()=>{
 for(const p of [{...payload([main]),meta:{}},{...payload([main]),meta:{ageSeconds:901}}])assert.equal(rows(p,now,overview,'q1_points',now).length,0);
 for(const patch of [{marketStatus:'SUSPENDED'},{marketType:'PLAYER_I_TOTAL_POINTS'},{marketType:'PLAYER_I_2ND_QUARTER_POINTS'},{runners:[main.runners[0],runner('Jaylen Wells Under',3.5,-112)]},{runners:[main.runners[0],runner('Donovan Clingan Under',2.5,-112)]},{runners:[main.runners[0]]}])assert.equal(rows(payload([{...main,...patch}]),now,overview,'q1_points',now).length,0);
 assert.equal(rows(payload([main]),now,overview,'q1_points',Date.parse(overview.games[0].tipoff)).length,0);
});
test('quarter milestones keep N+ target and one-sided price for each supported statistic',()=>{
 for(const [type,market]of [['POINTS','q1_points'],['REBOUNDS','q1_rebounds'],['ASSISTS','q1_assists'],['MADE_THREES','q1_threes_made']]){
 const m={...main,marketType:'1ST_QUARTER_-_TO_RECORD_2+_'+type,bettingType:'ODDS',runners:[runner('Donovan Clingan',0,220)]};const [r]=rows(payload([m]),now,overview,market,now);assert.equal(r.sportsbookLine,2);assert.equal(r.overPrice,220);assert.equal(r.underPrice,null);assert.equal(r.lineType,'milestone');assert.equal(r.playerId,'2');
 }
 assert.deepEqual(rows(payload([main]),now,overview,'q1_pts_rebs_asts',now),[]);
});
test('main pair wins stable preference over milestones and duplicate native copies do not duplicate a player',()=>{
 const m={...main,marketId:'ladder',marketType:'1ST_QUARTER_-_TO_SCORE_4+_POINTS',bettingType:'ODDS',runners:[runner('Jaylen Wells',0,100)]};
 const r=rows(payload([m,main,main]),now,overview,'q1_points',now);assert.equal(r.length,1);assert.equal(r[0].lineType,'main');assert.equal(r[0].sportsbookLine,2.5);
});
const {publicPropContext}=await loadTs(new URL('../lib/public-prop-context.ts',import.meta.url));
test('milestone history treats the exact target as reached, without calling it an O/U push',()=>{
 const c=publicPropContext({quoteVerified:true,lineType:'milestone',sportsbookLine:2},'nba','q1_rebounds',[1,2,3]);assert.match(c.face,/2 of the last 3 reached 2\+/);assert.doesNotMatch(c.face,/on the line/);
});
const {publicNbaRanking}=await loadTs(new URL('../lib/public-card-metrics.ts',import.meta.url));
const {integrityRow}=await loadTs(new URL('../lib/prop-integrity.ts',import.meta.url));
test('authentic quarter quote cards remain public with no model or selection; invalid evidence stays hidden',()=>{
 const [row]=rows(payload([main]),now,overview,'q1_points',now);const guarded=integrityRow(row,'nba','q1_points',now);assert.equal(guarded.quoteVerified,true);assert.equal(guarded.modelProjection,null);assert.equal(guarded.recommendationEligible,false);assert.equal(publicNbaRanking(guarded,now),true);
 assert.equal(publicNbaRanking({...guarded,quoteVersion:0},now),false);assert.equal(publicNbaRanking({...guarded,withdrawnFromBoard:true},now),false);
});
test('large unrelated runner trees do not exhaust discovery before another fixture market',()=>{
 const irrelevant={...main,marketId:'unrelated',marketType:'FULL_GAME_TEAM_TOTAL',runners:Array.from({length:100100},()=>({nested:{unneeded:1}}))};
 const result=rows(payload([main,irrelevant]),now,overview,'q1_points',now);assert.equal(result.length,1);assert.equal(result[0].sportsbookLine,2.5);
});
