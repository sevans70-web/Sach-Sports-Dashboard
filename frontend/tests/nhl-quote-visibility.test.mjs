import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {loadTs} from './load-ts.mjs';

const {nhlRankingVisible,matchNhlQuotePlayer}=await loadTs(new URL('../lib/nhl-ranking-visibility.ts',import.meta.url));
const {loadNhlOverview}=await loadTs(new URL('../lib/nhl.ts',import.meta.url));
const {completeRankingProp}=await loadTs(new URL('../lib/public-card-metrics.ts',import.meta.url));
const {rankingRowIsPick}=await loadTs(new URL('../lib/ranking-pick-count.ts',import.meta.url));
const {rankingResponse}=await loadTs(new URL('../lib/ranking-response-cache.ts',import.meta.url));
const {boards,at}=JSON.parse(gunzipSync(await readFile(new URL('./fixtures/nhl-ranking-2026-11-21.json.gz',import.meta.url))));
const now=Date.parse(at);

test('authentic quote identities remain visible without promoting held NHL models or changing saved rows',()=>{
 const expected={shots_on_goal:9,points:20,assists:15,goalie_saves:3,goals:0,blocked_shots:0};
 for(const [market,count] of Object.entries(expected)){
  const rows=boards[market].rows,before=JSON.stringify(rows);
  const visible=rows.filter(row=>nhlRankingVisible(row,now));
  assert.equal(visible.length,count,market);
  assert.ok(visible.every(row=>row.market===market&&row.quoteId&&row.gameId));
  if(market==='assists'){
   assert.ok(visible.every(row=>!completeRankingProp(row,now)&&!rankingRowIsPick(row,now)));
  }
  assert.equal(JSON.stringify(rows),before);
 }
 const shot=boards.shots_on_goal.rows.find(row=>nhlRankingVisible(row,now));
 for(const patch of [{quoteId:null},{quotePeriod:'q1'},{quoteMarket:'goals'},{underPrice:null},{quoteVerified:false},{withdrawnFromBoard:true}]){
  assert.equal(nhlRankingVisible({...shot,...patch},now),false);
 }
 const next=new Date(Date.parse(shot.gameTime)+60000).getTime();
 const saved={...shot,boardFrozen:true,boardCapturedAt:shot.quoteUpdatedAt};
 assert.equal(nhlRankingVisible(saved,next),true);
 assert.equal(nhlRankingVisible({...saved,recoveredAfterStart:true},next),false);
});

test('same-name and wrong-fixture quotes are withheld rather than attached to an arbitrary player',()=>{
 const game={gameId:'2026020100',awayTeam:'Toronto Maple Leafs',homeTeam:'Montreal Canadiens',awayAbbr:'TOR',homeAbbr:'MTL',tipoff:'2026-11-21T23:00:00Z'};
 const quote={matchup:'Toronto Maple Leafs @ Montreal Canadiens',gameTime:game.tipoff};
 const a={playerId:123,team:'TOR',position:'G'},b={playerId:456,team:'MTL',position:'C'};
 assert.deepEqual(matchNhlQuotePlayer(quote,[a,b],[game],'goalie_saves'),{player:a,game});
 assert.equal(matchNhlQuotePlayer(quote,[a,b],[game],'points'),null);
 assert.equal(matchNhlQuotePlayer(quote,[a],[game,{...game,gameId:'different'}],'points'),null);
 assert.equal(matchNhlQuotePlayer({...quote,gameTime:'2026-11-22T23:00:00Z'},[a],[game],'points'),null);
 assert.equal(matchNhlQuotePlayer({...quote,matchup:'Montreal Canadiens @ Toronto Maple Leafs'},[a],[game],'points'),null);
});

test('official slate drives 2026–27 player history, with true empty and ambiguous season kept distinct',async()=>{
 const nativeFetch=globalThis.fetch,DateClass=Date;
 const calls=[];
 let mode='current';
 globalThis.Date=class extends DateClass{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};
 const game={id:2026020100,season:20262027,awayTeam:{abbrev:'TOR'},homeTeam:{abbrev:'MTL'},gameState:'FUT',startTimeUTC:'2026-11-21T23:00:00Z'};
 globalThis.fetch=async input=>{
  const url=new URL(input instanceof Request?input.url:input);
  calls.push(url);
  if(url.pathname.includes('/score/')){
   if(mode==='denied')return new Response('{}',{status:503});
   const games=mode==='empty'?[]:mode==='ambiguous'?[game,{...game,id:2026020101,season:null}]:[game];
   return Response.json({games});
  }
  if(url.pathname.includes('/standings/'))return Response.json({standings:[]});
  if(url.pathname.includes('/roster/'))return Response.json({forwards:[{id:url.pathname.includes('/TOR/')?123:456}],defensemen:[],goalies:[]});
  assert.match(url.searchParams.get('cayenneExp'),/^seasonId=20262027 and gameTypeId=2$/);
  if(url.pathname.endsWith('skater/summary'))return Response.json({data:[{playerId:123,skaterFullName:'Fixture skater',teamAbbrevs:'TOR',positionCode:'C',gamesPlayed:2,points:3}]});
  return Response.json({data:[]});
 };
 try{
  const current=await loadNhlOverview();
  assert.equal(current.season,'2026–27 current season');
  assert.equal(current.players[0].pointsPerGame,1.5);
  assert.equal(calls.filter(url=>url.host==='api.nhle.com').length,3);
  for(const [when,schedule,available] of [['empty',true,true],['ambiguous',true,false],['denied',false,false]]){
   mode=when;calls.length=0;
   globalThis.__sachProviderTransportV2.cache.clear();
   globalThis.__sachProviderTransportV2.bytes=0;
   const overview=await loadNhlOverview();
   assert.equal(overview.scheduleAvailable,schedule,when);
   assert.equal(overview.playerSourceAvailable,available,when);
   assert.deepEqual(overview.players,[],when);
   assert.ok(!calls.some(url=>url.host==='api.nhle.com'),when);
  }
 }finally{globalThis.fetch=nativeFetch;globalThis.Date=DateClass;}
});

test('a failed refresh retains the prior NHL timestamp and healthy empty remains distinct after expiry',async()=>{
 const base=Date.now();const clock=Date.now;
 let work;
 const original={success:true,rows:[{playerId:'saved',gameTime:new Date(base+3600000).toISOString()}]};
 const denied={success:false,dataState:'unavailable',rows:[],coverageNotice:'The NHL sportsbook feed denied access.'};
 try{
  Date.now=()=>base;
  const key='nhl|visibility-fixture';
  await rankingResponse(key,async()=>original);
  Date.now=()=>base+21000;
  await rankingResponse(key,async()=>denied,false,{keepAlive:promise=>{work=promise;}});
  await work;
  const retained=await rankingResponse(key,async()=>denied);
  assert.equal(retained.dataState,'stale');
  assert.equal(retained.observedAt,new Date(base).toISOString());
  assert.deepEqual(retained.rows,original.rows);
  Date.now=()=>base+61000;
  assert.equal((await rankingResponse(key,async()=>denied)).success,false);
  const empty={success:true,dataState:'fresh',rows:[],coverageNotice:'No games are scheduled for the selected NHL slate.'};
  assert.deepEqual(await rankingResponse(key,async()=>empty),empty);
 }finally{Date.now=clock;}
});
