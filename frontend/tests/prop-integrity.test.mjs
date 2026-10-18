import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const api=await loadTs(new URL('../lib/prop-integrity.ts',import.meta.url));
const quotes=await loadTs(new URL('../lib/main-market-quotes.ts',import.meta.url));
const now=Date.parse('2026-10-18T15:00:00Z');
const quote={playerId:'1',gameId:'a',gameTime:'2026-10-18T17:00:00Z',quoteVersion:1,sportsbook:'FanDuel',sportsbookKey:'fanduel',sportsbookLine:204.5,lineType:'main',overPrice:-112,underPrice:-112,quoteUpdatedAt:'2026-10-18T14:59:00Z',modelProjection:144.6,giScore:88,prediction:'UNDER'};
test('an exact book quote does not validate a history-average prediction or heuristic GI',()=>{
 assert.equal(api.verifiedPropQuote(quote,now),true);
 const row=api.integrityRow(quote,'nfl','passing_yards',now);
 assert.equal(row.sportsbookLine,204.5);assert.equal(row.quoteVerified,true);assert.equal(row.prediction,'NO PICK');assert.equal(row.giScore,null);assert.equal(row.modelProbability,null);assert.equal(row.modelProjection,144.6);
 assert.equal(api.eligiblePropPrediction({...quote,forecastModelId:'invented',forecastValidation:{passed:true}},now),false);
});
test('legacy low lines are archived, not actionable; old data are never mutated',()=>{
 const old={...quote,quoteVersion:undefined,sportsbookLine:150,resultStatus:'hit'};const before=structuredClone(old);
 const row=api.integrityRow(old,'cfb','passing_yards',now);
 assert.equal(row.sportsbookLine,null);assert.equal(row.archivedOriginal.sportsbookLine,150);assert.equal(row.archivedOriginal.resultStatus,'hit');assert.equal(row.resultStatus,null);assert.deepEqual(old,before);
});
test('same safeguards apply to every active sport and every Q1 baseline',()=>{
 for(const sport of ['nfl','cfb','nba','wnba','cbb','nhl']){
  const row=api.integrityRow(quote,sport,'q1_points',now);assert.equal(row.modelProjection,null);assert.equal(row.giScore,null);assert.equal(row.prediction,'NO PICK');
 }
});
test('pregame evidence survives final whistle, but stale, missing-timing and late captures fail closed',()=>{
 const final={...quote,gameTime:'2026-10-18T14:59:30Z',savedAt:'2026-10-18T14:59:10Z'};
 assert.equal(api.verifiedPropQuote(final,now,true),true);
 for(const row of [{...final,savedAt:undefined},{...final,savedAt:'2026-10-18T15:00:00Z'},{...final,recoveredAfterStart:true},{...quote,quoteUpdatedAt:'2026-10-18T14:00:00Z'},{...quote,underPrice:null}])assert.equal(api.verifiedPropQuote(row,now),false);
});
test('legacy results remain inspectable but never count as verified wins or pending picks',()=>{
 const payload=api.guardPerformancePayload({predictions:[{...quote,status:'hit'},{...quote,status:'pending'}],hits:1,total:2,hitRate:100},'nfl');
 assert.equal(payload.total,0);assert.equal(payload.hitRate,null);assert.equal(payload.pending,0);assert.equal(payload.historicalEntries,2);assert.equal(payload.predictions[0].historicalStatus,'hit');assert.equal(payload.predictions[0].status,'research');
});
test('basketball and hockey select one real book quote, never a median or 8.8 points',()=>{
 const updated=new Date().toISOString(),kickoff=new Date(Date.now()+3600000).toISOString();
 const prop={playerName:'Player',category:'points',line:8.5,overPrice:-110,underPrice:-110,lastUpdate:updated};
 const payload={data:[{awayTeam:'A',homeTeam:'B',commenceTime:kickoff,books:[{key:'fanduel',props:[prop]},{key:'draftkings',props:[{...prop,line:9.5}]}]}]};
 const rows=quotes.mainMarketQuotes(payload,'points',p=>p.category==='points');assert.equal(rows.length,1);assert.equal(rows[0].line,8.5);assert.equal(rows[0].sportsbookKey,'fanduel');assert.equal(rows[0].bookmakerCount,1);
 payload.data[0].books=[{key:'fanduel',props:[{...prop,line:8.8}]}];assert.equal(quotes.mainMarketQuotes(payload,'points',()=>true).length,0);
});
test('basketball and hockey reject wrong fixture, wrong period, milestones, stale and one-sided O/U',()=>{
 const kickoff=new Date(Date.now()+3600000).toISOString(),stamp=new Date().toISOString();
 const prop={playerName:'P',category:'points',line:10.5,overPrice:-110,underPrice:-110,lastUpdate:stamp};
 const payload=p=>({data:[{awayTeam:'A',homeTeam:'B',commenceTime:kickoff,books:[{key:'book',props:[p]}]}]});
 for(const p of [{...prop,period:'q1'},{...prop,marketStructure:'milestone'},{...prop,underPrice:null},{...prop,lastUpdate:'2020-01-01'}])assert.equal(quotes.mainMarketQuotes(payload(p),'points',()=>true).length,0);
 const q=quotes.mainMarketQuotes(payload(prop),'points',()=>true)[0];assert.equal(quotes.quoteMatchesFixture(q,{awayTeam:'A',homeTeam:'C',tipoff:kickoff}),false);assert.equal(quotes.quoteMatchesFixture(q,{awayTeam:'A',homeTeam:'B',tipoff:kickoff}),true);
});
