import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {footballBookRows}=await loadTs(new URL('../lib/football-book-quotes.ts',import.meta.url));
const {verifiedPropQuote,eligiblePropPrediction}=await loadTs(new URL('../lib/prop-integrity.ts',import.meta.url));
test('Q1 milestones retain their exact target and single price without becoming O/U or a validated pick',()=>{
 const now=Date.parse('2026-10-25T18:00Z');const payload={data:[{homeTeam:'Home',awayTeam:'Away',commenceTime:'2026-10-25T20:25Z',books:[{key:'betmgm',props:[{playerName:'Player',category:'passing_yards_1q',line:100,overPrice:550,marketStructure:'milestone',propId:'q',lastUpdate:'2026-10-25T17:59Z'}]}]}]};
 assert.equal(footballBookRows(payload,'q1_passing_yards',['passing_yards_1q'],now).length,0);
 const row=footballBookRows(payload,'q1_passing_yards',['passing_yards_1q'],now,true)[0];assert.equal(row.line,100);assert.equal(row.underPrice,null);assert.equal(row.lineType,'milestone');
 const quoted={...row,market:'q1_passing_yards',playerId:'p',gameId:'g',sportsbookLine:row.line};assert.equal(verifiedPropQuote(quoted,now),true);assert.equal(eligiblePropPrediction(quoted,now),false);
 assert.equal(verifiedPropQuote({...quoted,market:'passing_yards'},now),false);
});
