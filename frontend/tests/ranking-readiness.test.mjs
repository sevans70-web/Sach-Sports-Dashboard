import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './load-ts.mjs';
const {excludeUnavailablePregame,availablePregameRankings}=await loadTs(new URL('../lib/ranking-availability.ts',import.meta.url));
const {featuredDashboardGames,dashboardCounts}=await loadTs(new URL('../lib/dashboard-contract.ts',import.meta.url));
const {rankingResponse}=await loadTs(new URL('../lib/ranking-response-cache.ts',import.meta.url));
const now=Date.parse('2026-10-21T20:00Z');
const row={playerId:'4396909',teamId:'11',gameId:'401909839',gameTime:'2026-10-22T00:00Z',gameState:'pre',rank:1,
 pregameContext:{gameId:'401909839',playerId:'4396909',teamId:'11',availability:[{status:'Out',reportedAt:'2026-10-20T21:36Z'}]}};
test('exact official Out reports remove pregame candidates; questionable reports and another fixture do not',()=>{
 assert.equal(excludeUnavailablePregame(row,now),true);
 for(const patch of [{pregameContext:{...row.pregameContext,gameId:'other'}},{pregameContext:{...row.pregameContext,playerId:'other'}},{pregameContext:{...row.pregameContext,availability:[{status:'Questionable'}]}}])assert.equal(excludeUnavailablePregame({...row,...patch},now),false);
 const report={gameId:row.gameId,code:'official_injury_status',text:'Reported Out · Hamstring'};
 assert.equal(excludeUnavailablePregame({...row,pregameContext:null,availabilityEvidence:report},now),true);
});
test('participation, lineup confirmation and locked history take precedence over older reports',()=>{
 for(const patch of [{boardFrozen:true},{frozen:true},{lockedAtKickoff:true},{starterConfirmed:true},{lineupConfirmed:true},{gameState:'in'},{gameState:'post'},{participationConfirmed:true,participationGameId:row.gameId}])assert.equal(excludeUnavailablePregame({...row,...patch},now),false);
 const kept={...row,playerId:'other',pregameContext:null,rank:2};
 const payload=availablePregameRankings({rows:[row,kept]},now);assert.equal(payload.rows.length,1);assert.equal(payload.rows[0].rank,1);assert.equal(payload.excludedUnavailable,1);
 const locked={...kept,frozen:true,rank:8};assert.equal(availablePregameRankings({rows:[row,locked]},now).rows[0].rank,8);
});
test('homepage gives NBA, WNBA and NHL separate slots even when NBA has all the earliest games',()=>{
 const games=['nba','nba','nba','wnba','nhl','nfl'].map((sport,i)=>({id:String(i),sport,state:'pre',date:new Date(now+i*60000).toISOString()}));
 assert.deepEqual(featuredDashboardGames(games).map(g=>g.sport),['nba','wnba','nhl']);
 assert.equal(featuredDashboardGames(games.filter(g=>g.sport==='nba')).length,3);
});
test('homepage exposes supported model picks and their real prices while validated counts remain separate',()=>{
 const stamp=new Date().toISOString(),time=new Date(Date.now()+3600000).toISOString();
 const quoted={playerId:'p',gameId:'g',gameTime:time,sportsbookLine:10.5,quoteVersion:1,sportsbook:'Book',sportsbookKey:'book',quoteId:'q',lineType:'main',overPrice:-110,underPrice:-115,quoteUpdatedAt:stamp,capturedAt:stamp,researchForecast:{modelSelection:{side:'UNDER',line:10.5,price:-115,sportsbookKey:'book',quoteId:'q',calculatedAt:stamp}}};
 const counts=dashboardCounts([{id:'g',date:time,state:'pre'}],[quoted]);
 assert.equal(counts.predictions,0);assert.equal(counts.estimatedPicks,1);assert.equal(counts.modelPickRows[0].researchForecast.modelSelection.price,-115);
});
test('concurrent ranking requests share one build; force refresh and crossing tipoff bypass the saved response',async()=>{
 let calls=0;const key='test-'+Math.random(),tip=Date.now()+3600000;
 const build=async()=>{calls++;await Promise.resolve();return {success:true,rows:[{gameTime:new Date(tip).toISOString()}],calls}};
 const [a,b]=await Promise.all([rankingResponse(key,build),rankingResponse(key,build)]);assert.equal(calls,1);assert.strictEqual(a,b);assert.strictEqual(await rankingResponse(key,build),a);
 await rankingResponse(key,build,true);assert.equal(calls,2);
 const original=Date.now;Date.now=()=>tip+1;
 try{await rankingResponse(key,build);assert.equal(calls,3)}finally{Date.now=original}
});
