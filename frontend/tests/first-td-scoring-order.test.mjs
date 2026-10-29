import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './load-ts.mjs';
const {firstTouchdownResult,verifiedFirstTouchdownScorerId}=await loadTs(new URL('../lib/first-td-scoring-order.ts',import.meta.url));
const mk=(text,period,clock)=>({text,period:{number:period},clock:{displayValue:clock},scoringType:{name:'Touchdown'}});
test('first TD uses earliest official touchdown, not a passer mentioned in the play',()=>{
 const report={scoringPlays:[mk('J. Hurts 3 Yd Run',2,'13:22'),mk('S. Barkley 8 Yd Pass from J. Hurts',1,'07:43')]};
 assert.equal(firstTouchdownResult(report,'Saquon Barkley'),1);
 assert.equal(firstTouchdownResult(report,'Jalen Hurts'),0);
});
test('missing order, no scores and unparseable first scorer remain unverified',()=>{
 assert.equal(firstTouchdownResult({scoringPlays:[]},'Saquon Barkley'),null);
 assert.equal(firstTouchdownResult({scoringPlays:[{text:'S. Barkley TD',scoringType:{name:'Touchdown'}}]},'Saquon Barkley'),null);
 assert.equal(firstTouchdownResult({scoringPlays:[mk('Touchdown, team',1,'08:00')]},'Saquon Barkley'),null);
});

test('official first-TD settlement requires one exact athlete ID',()=>{
 const p={scoringPlays:[mk('S. Barkley 8 Yd Run',1,'07:43')]};
 assert.equal(verifiedFirstTouchdownScorerId(p,[{playerId:'10',playerName:'Saquon Barkley'},{playerId:'11',playerName:'Jalen Hurts'}]),'10');
 assert.equal(verifiedFirstTouchdownScorerId(p,[{playerId:'10',playerName:'Saquon Barkley'},{playerId:'12',playerName:'Sam Barkley'}]),null);
 assert.equal(verifiedFirstTouchdownScorerId({scoringPlays:[]},[{playerId:'10',playerName:'Saquon Barkley'}]),null);
});
