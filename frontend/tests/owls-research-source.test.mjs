import test from 'node:test';import assert from 'node:assert/strict';
import {loadTs} from './load-ts.mjs';
const {researchIdentities,includedResearchSource,officialNbaResearchFixtures,officialNbaResearchIdentities}=await loadTs(new URL('../lib/owls-research-source.ts',import.meta.url));
test('official fallback uses exact UTC fixture dates and identities without outcomes',()=>{
 const event={id:'123',date:'2026-04-01T00:30Z',competitions:[{status:{type:{completed:true}},competitors:[{homeAway:'away',team:{displayName:'A'}},{homeAway:'home',team:{displayName:'B'}}]}]};
 assert.deepEqual([...officialNbaResearchFixtures([{events:[event,event]}],'2026-04-01')],[['nba:A@B-20260401','123']]);
 assert.equal(officialNbaResearchFixtures([{events:[event]}],'2026-03-31').size,0);
 const athlete={athlete:{id:'1',displayName:'Player'},stats:['999'],didNotPlay:true};
 const payload={boxscore:{players:[{statistics:[{athletes:[athlete,athlete]}]}]}};
 const ids=officialNbaResearchIdentities(payload);assert.equal(ids.length,6);
 athlete.stats=['0'];athlete.didNotPlay=false;assert.deepEqual(officialNbaResearchIdentities(payload),ids);
});
test('research sampling uses identities, including losing, zero and provisional results',()=>{
 const data=[{playerId:'2',playerName:'B',category:'rushing_yards',actual:0,final:false},{playerId:'1',playerName:'A',category:'passing_yards',actual:500,final:true},{playerId:'1',playerName:'A',category:'touchdowns'}];
 const first=researchIdentities({data},'nfl');assert.equal(first.length,2);
 assert.deepEqual(first,researchIdentities({data:data.map(r=>({...r,actual:999,final:!r.final})).reverse()},'nfl'));
 assert.throws(()=>researchIdentities({data:[...data,{playerId:'1',playerName:'Different',category:'passing_yards'}]},'nfl'),/Ambiguous/);
});
test('fixed window rejects arbitrary dates before any network request',async()=>{
 await assert.rejects(includedResearchSource('nfl',-1,null,null),/Invalid research day/);
 await assert.rejects(includedResearchSource('nba',99,null,null),/Invalid research day/);
});
test('source requests use included prop routes and retain named quote fields only',async()=>{
 const original=globalThis.fetch,token=process.env.OWLS_INSIGHT_API_KEY;process.env.OWLS_INSIGHT_API_KEY='test';
 const urls=[];globalThis.fetch=async url=>{urls.push(String(url));const u=new URL(url);
  if(u.searchParams.has('date'))return Response.json({success:true,data:[{gameId:'nfl:A@B-20260906'}]});
  if(u.pathname.endsWith('/results'))return Response.json({success:true,data:[{playerId:'1',playerName:'A',category:'passing_yards'}]});
  return Response.json({success:true,data:{gameId:'nfl:A@B-20260906',player:'A',category:'passing_yards',book:'pinnacle',history:[{line:'200.5',overPrice:-110,underPrice:-110,timestamp:'2026-09-06T10:00:00Z',secret:'omit'}]}});
 };
 try{const result=await includedResearchSource('nfl',0,0,0);assert.equal(urls.length,3);assert.ok(urls.every(u=>u.includes('/nfl/props/')));assert.equal(result.history[0].secret,undefined);assert.equal(result.history[0].line,'200.5')}
 finally{globalThis.fetch=original;if(token===undefined)delete process.env.OWLS_INSIGHT_API_KEY;else process.env.OWLS_INSIGHT_API_KEY=token}
});
