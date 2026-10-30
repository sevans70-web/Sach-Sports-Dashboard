import test from 'node:test';import assert from 'node:assert/strict';
import {directionChanges} from '../scripts/p01-direction-changes.mjs';
const row=(a,b,won,gameId='g')=>({target:{market:'points',gameId},baseline:{direction:a,directionWon:won},candidate:{direction:b,directionWon:a===b?won:!won}});
test('flipping more UNDER calls to OVER can produce no net accuracy gain',()=>{
 const result=directionChanges([row('UNDER','OVER',true),row('UNDER','OVER',false),row('OVER','OVER',true,'h')]);
 const flip=result.find(r=>r.baselineSide==='UNDER');assert.equal(flip.netHits,0);assert.equal(flip.calls,2);assert.equal(flip.independentGames,1);assert.equal(flip.baselineHits,1);assert.equal(flip.candidateHits,1);
});
test('pushes and missing directions are excluded; contradictory paired grades fail',()=>{
 assert.deepEqual(directionChanges([{...row('UNDER','OVER',true),push:true},row(null,null,null)]),[]);
 const bad=row('UNDER','OVER',true);bad.candidate.directionWon=true;assert.throws(()=>directionChanges([bad]),/Inconsistent/);
});
