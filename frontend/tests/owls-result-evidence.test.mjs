import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {inspectOwlsResultEvidence}=await loadTs(new URL('../lib/owls-result-evidence.ts',import.meta.url));
const line={book:'pinnacle',line:220.5,overPrice:-110,underPrice:-110,marketStructure:'over_under',capturePhase:'commence',verdict:'under'};
const row={playerId:'p1',playerName:'Player',category:'passing_yards',actual:218,status:'ok',final:true,lines:[line]};
test('graded evidence distinguishes pregame capture from end-of-game prices and rejects unknown structure',()=>{
 const r=inspectOwlsResultEvidence({data:[{...row,lines:[line,{...line,capturePhase:'archive'},{...line,capturePhase:null},{...line,marketStructure:null},{...line,marketStructure:'milestone',underPrice:null}]}]});
 assert.equal(r.lines,5);assert.equal(r.pregameTwoSidedOverUnder,1);assert.equal(r.archiveLines,1);assert.equal(r.unknownPhaseLines,1);assert.equal(r.unknownStructureLines,1);assert.equal(r.candidates[0].actual,218);assert.equal(r.usableForValidatedForecast,false);
 assert.equal('verdict' in r.candidates[0],false);
});
test('provisional, ungradable, missing-price and missing-player rows cannot supply priced evidence; reported zero remains real',()=>{
 const rows=[{...row,final:false},{...row,status:'dnp',actual:null},{...row,actual:null},{...row,ungradableReason:'ambiguous_player'},{...row,playerId:null},{...row,lines:[{...line,underPrice:''}]},{...row,lines:[{...line,ungradableReason:'multiple_closing_lines'}]},{...row,actual:0}];
 const r=inspectOwlsResultEvidence({data:rows,meta:{linesTruncated:true}});assert.equal(r.pregameTwoSidedOverUnder,1);assert.equal(r.candidates[0].actual,0);assert.equal(r.sourceTruncated,true);
});
