import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {footballPregameAvailability,eligibleFootballPregameRows}=await loadTs(new URL('../lib/football-pregame-availability.ts',import.meta.url));
const now=Date.now(),time=new Date(now+3600000).toISOString();
const rows=Array.from({length:40},(_,i)=>({gameId:'999991',playerId:String(i+1),teamId:'a',gameTime:time,rank:i+1}));
const report={header:{id:'999991',competitions:[{date:time,status:{type:{state:'pre'}},competitors:[{team:{id:'a'}},{team:{id:'b'}}]}]},injuries:[{team:{id:'a'},injuries:rows.slice(0,5).map(r=>({athlete:{id:r.playerId},status:'Out'}))}]};
test('official reports bind exact fixture, start time, team and player; frozen evidence stays untouched',()=>{
 const enriched=footballPregameAvailability(rows,report,'999991',now);assert.equal(enriched[0].availabilityEvidence.text,'Reported Out');assert.equal(enriched[5],rows[5]);
 for(const row of [{...rows[0],teamId:'wrong'},{...rows[0],gameTime:new Date(now+7200000).toISOString()},{...rows[0],frozen:true},{...rows[0],boardFrozen:true}])assert.equal(footballPregameAvailability([row],report,'999991',now)[0],row);
 assert.equal(footballPregameAvailability(rows,report,'other',now),rows);assert.equal(footballPregameAvailability(rows,report,'999991',now+7200000),rows);
 const live=structuredClone(report);live.header.competitions[0].status.type.state='in';assert.equal(footballPregameAvailability(rows,live,'999991',now),rows);
 const wrongTeam=structuredClone(report);wrongTeam.injuries[0].team.id='other';assert.equal(footballPregameAvailability(rows,wrongTeam,'999991',now)[0],rows[0]);
});
test('NFL and CFB fetch official reports before selecting the next 25; provider failures do not invent status',async()=>{
 const old=globalThis.fetch;const urls=[];
 globalThis.fetch=async url=>{urls.push(String(url));return Response.json(report)};
 try{
  for(const sport of ['nfl','cfb']){
   const eligible=await eligibleFootballPregameRows(rows,sport);assert.equal(eligible.length,35);assert.equal(eligible[0].playerId,'6');assert.equal(eligible.slice(0,25).at(-1).playerId,'30');
  }
  assert.ok(urls.some(u=>u.includes('/nfl/summary')));assert.ok(urls.some(u=>u.includes('/college-football/summary')));
  globalThis.fetch=async()=>{throw Error('unavailable')};
  const unknown=rows.map(r=>({...r,gameId:'999992'}));assert.deepEqual(await eligibleFootballPregameRows(unknown,'nfl'),unknown);
 }finally{globalThis.fetch=old}
});
