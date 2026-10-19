import test from 'node:test';import assert from 'node:assert/strict';
import {loadTs} from './load-ts.mjs';
const {researchIdentities,includedResearchSource}=await loadTs(new URL('../lib/owls-research-source.ts',import.meta.url));
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
