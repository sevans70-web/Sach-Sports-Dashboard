import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {quarterFeatureIndex,quarterPoint}=await loadTs(new URL('../lib/quarter-forecast.ts',import.meta.url));
const {fittedQuarterForecast,attachQuarterForecasts}=await loadTs(new URL('../lib/live-quarter-forecast.ts',import.meta.url));
const {cardModelPick}=await loadTs(new URL('../lib/saved-model-pick.ts',import.meta.url));
const {estimatedEv}=await loadTs(new URL('../lib/estimated-ev.ts',import.meta.url));
const now=Date.parse('2026-10-29T20:00Z');
const history=Array.from({length:6},(_,i)=>({sport:'nba',market:'q1_points',season:'2026',playerId:'1',teamId:'A',gameId:'prior'+i,gameTime:`2026-04-${String(10+i).padStart(2,'0')}T00:00Z`,actual:i===0?0:4,role:30,starter:true,source:'official',retrievedAt:'2026-10-24T12:00Z'}));
const row={market:'q1_points',gameId:'upcoming',playerId:'1',teamId:'A',gameTime:'2026-10-30T00:00Z',gameState:'pre',quoteVersion:1,lineType:'main',sportsbook:'Book',sportsbookKey:'book',quoteId:'q',sportsbookLine:4.5,overPrice:-110,underPrice:-110,quoteUpdatedAt:'2026-10-29T19:59Z',capturedAt:'2026-10-29T20:00Z',pregameContext:{gameId:'upcoming',playerId:'1',teamId:'A',gameTime:'2026-10-30T00:00Z',season:'2027',seasonType:2,opponentId:'B',availability:[]}};
const model={version:1,group:'nba|q1_points',model:{means:Array(14).fill(0),scales:Array(14).fill(1),coefficients:[5,...Array(14).fill(0)]},trainedThrough:'2025-01-01T00:00Z',calibratedThrough:'2025-04-01T00:00Z',residuals:[],validatedForBetting:false};
const bundle={models:[model],observations:history,digest:'frozen-model-digest',asOf:'2026-10-29T19:00Z'};
test('quarter inputs retain certified zero quarters, same-team prior season and exact evidence; target/future/48h data excluded',()=>{
 const target={...row,sport:'nba',season:'2027'},index=quarterFeatureIndex(history),a=index(target,new Date(now).toISOString());
 assert.equal(a.historyGames,6);assert.equal(a.historyEvidence[0].actual,0);assert.equal(a.features.length,14);
 const poison=[...history,{...history[0],gameId:'future',gameTime:'2026-10-30T00:00Z',actual:999},{...history[0],gameId:'recent',gameTime:'2026-10-29T00:00Z',actual:999},{...history[0],gameId:'other-team',teamId:'B',actual:999}];
 assert.deepEqual(quarterFeatureIndex(poison)(target,new Date(now).toISOString()),a);
 assert.equal(quarterFeatureIndex(history.slice(0,4))(target,new Date(now).toISOString()).features,null);
 assert.equal(index({...target,teamId:'B'},new Date(now).toISOString()).features,null);
});
test('fitted Q1 expectation creates exact saved direction without claiming probabilities, EV or betting validation',()=>{
 const f=fittedQuarterForecast(row,'nba','q1_points',bundle,now);assert.equal(f.projection,5);assert.equal(f.modelSelection.side,'OVER');assert.equal(f.priceComparison.overProbability,undefined);assert.equal(f.validatedForBetting,false);assert.equal(f.historyEvidence.length,6);
 const r={...row,researchForecast:f};assert.equal(cardModelPick(r,now).side,'OVER');assert.equal(estimatedEv(r,now).status,'unavailable');assert.equal(cardModelPick({...r,sportsbookLine:5.5},now),null);
 assert.equal(fittedQuarterForecast({...row,sportsbookLine:5},'nba','q1_points',bundle,now).modelSelection,null);
});
test('milestones retain one-sided contract; target comparison never invents an UNDER wager',()=>{
 const f=fittedQuarterForecast({...row,lineType:'milestone',sportsbookLine:6,underPrice:null},'nba','q1_points',bundle,now);
 assert.equal(f.projection,5);assert.equal(f.modelSelection,null);assert.deepEqual(f.modelTargetForecast,{direction:'BELOW',target:6,quoteId:'q',calculatedAt:new Date(now).toISOString()});
});
test('wrong fixture context, unavailability, future artifact and started row fail closed',()=>{
 for(const patch of [{pregameContext:{...row.pregameContext,gameId:'other'}},{pregameContext:{...row.pregameContext,availability:[{status:'Out'}]}},{pregameContext:null},{frozen:true},{boardFrozen:true},{gameState:'post'},{gameTime:'2026-10-29T18:00Z'}])assert.equal(fittedQuarterForecast({...row,...patch},'nba','q1_points',bundle,now).status,'unavailable');
 assert.equal(fittedQuarterForecast(row,'nba','q1_points',{...bundle,asOf:'2026-10-30T00:00Z'},now).status,'unavailable');
});
test('frozen forecasts are preserved by refresh; NFL negative-yard expectation remains possible',async()=>{
 const saved={...row,boardFrozen:true,researchForecast:{status:'available',projection:3.7,original:true}},p=await attachQuarterForecasts({market:row.market,rows:[saved]},'nba',now);assert.deepEqual(p.rows[0],saved);
 assert.equal(quarterPoint({...model,group:'nfl|q1_rushing_yards',model:{...model.model,coefficients:[-2,...Array(14).fill(0)]}},Array(14).fill(0)),-2);
});
