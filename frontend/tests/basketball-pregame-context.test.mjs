import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {basketballPregameContext,playerPregameContext,attachBasketballPregameContext}=await loadTs(new URL('../lib/basketball-pregame-context.ts',import.meta.url));
const start='2026-10-20T23:00:00Z',at='2026-10-20T22:00:00Z';
const source=()=>({header:{id:'g',season:{year:2027},competitions:[{date:start,status:{type:{state:'pre',completed:false}},competitors:[{team:{id:'A'},homeAway:'home'},{team:{id:'B'},homeAway:'away'}]}]},injuries:[{team:{id:'A'},injuries:[{athlete:{id:'p'},status:'Questionable',shortComment:'Ankle; game-time decision',date:at},{athlete:{id:'mate'},status:'Out',shortComment:'Knee'}]},{team:{id:'B'},injuries:[{athlete:{id:'opp'},status:'Out'}]}],boxscore:{players:[{team:{id:'A'},statistics:[{athletes:[{athlete:{id:'p'},starter:true},{athlete:{id:'bench'},starter:false}]}]}]}});
const row={gameId:'g',gameTime:start,teamId:'A',playerId:'p'};
test('pregame evidence retains exact source, season, starter flag and team-scoped reports',()=>{
 for(const sport of ['nba','wnba','cbb']){
  const context=basketballPregameContext(source(),sport,'g',at),player=playerPregameContext(context,row);
  assert.equal(context.season,'2027');assert.equal(context.sourceSha256.length,64);assert.equal(player.starterConfirmed,true);
  assert.equal(player.availability[0].status,'Questionable');assert.deepEqual(player.teammateInjuryReports.map(i=>i.playerId),['mate']);
  assert.equal(player.expectedMinutes,null);assert.equal(player.usage,null);assert.equal(player.usableForValidatedForecast,false);
  assert.equal(context.providerUpdatedAt,null);
 }
});
test('post-start, live, completed and wrong-fixture summaries cannot become pregame evidence',()=>{
 assert.equal(basketballPregameContext(source(),'nba','wrong',at),null);
 for(const time of [start,'2026-10-21T00:00:00Z','invalid'])assert.equal(basketballPregameContext(source(),'nba','g',time),null);
 for(const patch of [{state:'in'},{state:'post',completed:true},{state:'pre',completed:true},{}]){
  const payload=source();payload.header.competitions[0].status.type=patch;assert.equal(basketballPregameContext(payload,'nba','g',at),null);
 }
 const payload=source();payload.header.competitions[0].competitors[1].team.id='A';assert.equal(basketballPregameContext(payload,'nba','g',at),null);
});
test('missing injury sections and unlisted players stay unknown; false starter flags do not establish a role',()=>{
 const payload=source();delete payload.injuries;const context=basketballPregameContext(payload,'nba','g',at);
 const player=playerPregameContext(context,{...row,playerId:'bench'});
 assert.equal(player.injurySectionPresent,false);assert.equal(player.availabilityConfirmed,false);assert.deepEqual(player.availability,[]);
 assert.equal(player.starterConfirmed,false);assert.ok(player.missingInputs.includes('complete_availability'));
});
test('player joins reject another fixture, team or scheduled time; source digest tracks evidence revisions',()=>{
 const payload=source(),context=basketballPregameContext(payload,'nba','g',at);
 for(const patch of [{gameId:'other'},{teamId:'other'},{gameTime:'2026-10-21T23:00:00Z'},{playerId:''}])assert.equal(playerPregameContext(context,{...row,...patch}),null);
 assert.equal(playerPregameContext(context,{...row,gameTime:'2026-10-20T23:00:00.000Z'}).playerId,'p');
 payload.injuries[0].injuries[0].status='Out';assert.notEqual(basketballPregameContext(payload,'nba','g',at).sourceSha256,context.sourceSha256);
 assert.equal(context.teams[0].reportedInjuries[0].status,'Questionable');
});
test('concurrent markets share one official read; failures preserve cards with unknown context',async()=>{
 const original=globalThis.fetch;let calls=0;
 const future=new Date(Date.now()+86400000).toISOString();
 globalThis.fetch=async url=>{calls++;if(String(url).includes('failed-source'))return new Response('unavailable',{status:500});
  const payload=source();payload.header.id='shared-read';payload.header.competitions[0].date=future;return Response.json(payload)};
 try{
  const payload={market:'points',rows:[{...row,gameId:'shared-read',gameTime:future,gameState:'pre'}]};
  const [a,b]=await Promise.all([attachBasketballPregameContext(payload,'nba'),attachBasketballPregameContext({...payload,market:'assists'},'nba')]);
  assert.equal(calls,1);assert.equal(a.pregameContextCount,1);assert.deepEqual(a.rows[0].pregameContext,b.rows[0].pregameContext);
  assert.equal(a.rows[0].lineupConfirmed,true);assert.equal(a.rows[0].availabilityEvidence.gameId,'shared-read');
  assert.match(a.rows[0].availabilityEvidence.text,/Questionable.*Ankle/);
  const failure=await attachBasketballPregameContext({rows:[{...payload.rows[0],gameId:'failed-source'}]},'nba');
  assert.equal(failure.rows.length,1);assert.equal(failure.rows[0].pregameContext,null);assert.equal(failure.pregameContextCount,0);
  assert.equal(payload.rows[0].pregameContext,undefined);
 }finally{globalThis.fetch=original}
});
