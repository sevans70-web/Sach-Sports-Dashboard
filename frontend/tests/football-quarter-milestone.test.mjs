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

const at=Date.parse('2026-10-25T18:00Z');
const offer=(market,book,props)=>({data:[{homeTeam:'Home',awayTeam:'Away',commenceTime:'2026-10-25T20:25Z',books:[{key:book,props:props.map(p=>({playerName:'Player',category:market+'_1q',lastUpdate:'2026-10-25T17:59Z',...p}))}]}]});
test('each football quarter yardage market prefers a main pair over a preferred-book milestone',()=>{
 for(const market of ['passing_yards','rushing_yards','receiving_yards']){
  const milestone=offer(market,'fanduel',[{line:5,overPrice:-400,marketStructure:'milestone',propId:'target'}]);
  const main=offer(market,'caesars',[{line:10.5,overPrice:-115,underPrice:-105,propId:'main'}]);
  const payload={data:[...milestone.data,...main.data]};
  for(const data of [payload.data,[...payload.data].reverse()]){
   const [r]=footballBookRows({data},'q1_'+market,[market+'_1q'],at,true);
   assert.equal(r.lineType,'main');assert.equal(r.line,10.5);assert.equal(r.sportsbookKey,'caesars');assert.equal(r.overPrice,-115);assert.equal(r.underPrice,-105);
  }
 }
});
test('milestone fallback chooses lowest target before timestamp; main contract counts exclude milestones',()=>{
 const p=offer('receiving_yards','betmgm',[
  {line:40,overPrice:150,marketStructure:'milestone',propId:'higher',lastUpdate:'2026-10-25T18:00Z'},
  {line:5,overPrice:-300,marketStructure:'milestone',propId:'lowest'},
 ]);
 const [r]=footballBookRows(p,'q1_receiving_yards',['receiving_yards_1q'],at,true);
 assert.equal(r.line,5);assert.equal(r.quoteId,'lowest');assert.equal(r.underPrice,null);
 const main=offer('receiving_yards','caesars',[{line:5,overPrice:-110,underPrice:-110,propId:'main'}]);
 const [paired]=footballBookRows({data:[...p.data,...main.data]},'q1_receiving_yards',['receiving_yards_1q'],at,true);
 assert.equal(paired.lineType,'main');assert.equal(paired.bookmakerCount,1);
});
test('invalid main pairs never displace a valid milestone or manufacture under prices',()=>{
 for(const extra of [{underPrice:null},{underPrice:0},{lastUpdate:'2026-10-25T16:00Z'},{suspended:true},{periodID:'game'}]){
  const main=offer('receiving_yards','fanduel',[{line:10.5,overPrice:-110,underPrice:-110,...extra}]);
  const milestone=offer('receiving_yards','betmgm',[{line:5,overPrice:-300,marketStructure:'milestone',propId:'valid'}]);
  const [r]=footballBookRows({data:[...main.data,...milestone.data]},'q1_receiving_yards',['receiving_yards_1q'],at,true);
  assert.equal(r.lineType,'milestone');assert.equal(r.quoteId,'valid');assert.equal(r.underPrice,null);
 }
});
