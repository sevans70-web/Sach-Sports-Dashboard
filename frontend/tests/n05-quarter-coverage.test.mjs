import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {getOwlsCfbRows}=await loadTs(new URL('../lib/cfb-owls.ts',import.meta.url));
const {CFB_MARKETS}=await loadTs(new URL('../lib/cfb.ts',import.meta.url));
const {cfbPredictionProbability}=await loadTs(new URL('../lib/cfb-prediction.ts',import.meta.url));
const {mainMarketQuotes}=await loadTs(new URL('../lib/main-market-quotes.ts',import.meta.url));
const {basketballMarketMatches}=await loadTs(new URL('../lib/basketball-markets.ts',import.meta.url));
const {basketballQ1Actual}=await loadTs(new URL('../lib/basketball-period-settlement.ts',import.meta.url));
const markets=['q1_passing_yards','q1_rushing_yards','q1_receiving_yards'];
function feed(props){return {data:[{id:'event',awayTeam:'A',homeTeam:'B',commenceTime:new Date(Date.now()+3600000).toISOString(),books:[{key:'pinnacle',props:props.map(p=>({playerName:'Real Player',line:49.5,overPrice:-110,underPrice:-115,lastUpdate:new Date().toISOString(),...p}))}]}]}}
function source(payload){return {primary:async()=>payload,supplement:async()=>({data:[]})}}
test('CFB exposes the three supported quarter yardage markets and accepts real period-specific prices',async()=>{
 for(const market of markets){
  assert.ok(CFB_MARKETS.some(m=>m[0]===market));
  for(const prop of [{category:market.slice(3),periodID:'1q'},{category:market.slice(3)+'_1q'}]){
   const [r]=await getOwlsCfbRows(market,source(feed([prop])));assert.equal(r.line,49.5);assert.equal(r.overPrice,-110);assert.equal(r.underPrice,-115);assert.equal(r.quoteMarket,market);assert.equal(r.quotePeriod,'q1');assert.equal(r.sourceCategory,prop.category);assert.equal(r.sourcePeriod,prop.periodID||'');
  }
  assert.equal(cfbPredictionProbability(market,80,49.5,51),null);
 }
});
test('CFB quarter feed rejects full-game, half, other-quarter, suspended, stale and incomplete quotes',async()=>{
 for(const market of markets)for(const prop of [{category:market.slice(3)},{category:market,periodID:'game'},{category:market,periodID:'2q'},{category:market,periodID:'1h'},{category:market,underPrice:null},{category:market,suspended:true},{category:market,lastUpdate:'2000-01-01T00:00:00Z'}]){
  assert.equal((await getOwlsCfbRows(market,source(feed([prop])))).length,0,JSON.stringify(prop));
 }
 assert.deepEqual(await getOwlsCfbRows('q1_passing_yards',source({data:[]})),[]);
});
test('NBA period-matched quotes retain original source category and period without borrowing a full-game quote',()=>{
 const payload=feed([{category:'points',periodID:'game',line:24.5},{category:'points',periodID:'1q',line:6.5},{category:'points_1q',periodID:'2q',line:7.5}]);
 const [r]=mainMarketQuotes(payload,'q1_points',p=>basketballMarketMatches(p,'q1_points'));
 assert.equal(r.line,6.5);assert.equal(r.sourceCategory,'points');assert.equal(r.sourcePeriod,'1q');assert.equal(r.quotePeriod,'q1');
});
test('NBA Q1 results bind to exact official player identity and reject ambiguous names or DNP',()=>{
 const p={header:{competitions:[{status:{period:2},competitors:[{linescores:[{value:2}]},{linescores:[{value:0}]}]}]},boxscore:{players:[{statistics:[{athletes:[{athlete:{id:'1',displayName:'Real Player'},starter:true}]}]}]},plays:[{period:{number:1},text:'Real Player makes two point shot',scoringPlay:true,scoreValue:2}]};
 assert.equal(basketballQ1Actual(p,{playerId:'1',playerName:'Wrong Saved Name'},'q1_points'),2);
 assert.equal(basketballQ1Actual(p,{playerId:'9',playerName:'Real Player'},'q1_points'),null);
 p.boxscore.players[0].statistics[0].athletes[0].didNotPlay=true;assert.equal(basketballQ1Actual(p,{playerId:'1',playerName:'Real Player'},'q1_points'),null);
 delete p.boxscore.players[0].statistics[0].athletes[0].didNotPlay;
 p.boxscore.players[0].statistics[0].athletes.push({athlete:{id:'2',displayName:'Real Player'}});assert.equal(basketballQ1Actual(p,{playerId:'1',playerName:'Real Player'},'q1_points'),null);
});

const {readFile}=await import('node:fs/promises');const {gunzipSync}=await import('node:zlib');
const {footballQuarterRows}=await loadTs(new URL('../lib/football-quarter-stats.ts',import.meta.url));
test('official CFB formation/jersey text yields actual Q1 values, never full-game yardage',async()=>{
 const archive=JSON.parse(gunzipSync(await readFile(new URL('../docs/n05-quarter-coverage/cfb-official-finals.json.gz',import.meta.url))));
 const p=archive.find(g=>g.gameId==='401856835').data;
 const qb=footballQuarterRows(p).find(r=>r.playerId==='5141367');
 // Q1 completions are 15 + 11 + 27 yards, versus the official 257 full game.
 assert.equal(qb.stats.q1_passing_yards,53);assert.equal(qb.stats.passing_yards,257);assert.equal(qb.stats.q1_rushing_yards,13);assert.equal(qb.stats.rushing_yards,37);
 const broken=structuredClone(p);for(const drive of broken.drives.previous)drive.plays=drive.plays.filter(play=>!String(play.text).includes('for 27 yards to the UCF00 TOUCHDOWN'));
 assert.equal(footballQuarterRows(broken).find(r=>r.playerId==='5141367').stats.q1_passing_yards,null);
});
test('NCAA sack attempts and negative rushing yards stay separate from NFL rules',()=>{
 const p={header:{league:{id:'23'}},boxscore:{players:[{team:{id:'1'},statistics:[{name:'rushing',labels:['CAR','YDS'],athletes:[{athlete:{id:'10',displayName:'Alex Smith'},stats:['1','-5']}]}]}]},plays:[{id:'start',period:1,clock:{displayValue:'15:00'},type:{text:'Kickoff'}},{id:'sack',period:1,start:{team:{id:'1'}},type:{text:'Sack'},text:'(09:00) No Huddle-Shotgun #10 A.Smith sacked for loss of 5 yards',statYardage:-5},{id:'later',period:2,type:{text:'End Period'}}]};
 assert.equal(footballQuarterRows(p)[0].stats.q1_rushing_yards,-5);
 p.header.league.id='28';assert.equal(footballQuarterRows(p)[0].stats.q1_rushing_yards,null);
});
