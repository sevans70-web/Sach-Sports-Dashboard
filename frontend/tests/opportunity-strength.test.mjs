import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {fitOpportunityStrength,opportunityStrength,giCalibrationRow,researchOpportunityDecision}=await loadTs(new URL('../lib/opportunity-strength.ts',import.meta.url));
const row=(i,extra={})=>({observationId:'q'+i,gameId:'g'+i,decisionAt:'2025-01-01T00:00:00Z',settledAt:'2025-01-02T00:00:00Z',expectedReturn:i/1000,unitReturn:i<100?-1:i<200?.5:1,...extra});
test('GI learns opportunity return order separately from probability, using earlier fixture-weighted outcomes',()=>{
 const rows=Array.from({length:300},(_,i)=>row(i)),{artifact}=fitOpportunityStrength(rows,'2025-02-01');assert.ok(artifact);
 assert.equal(opportunityStrength(artifact,.01,'2026-01-01').score,0);
 const positive=opportunityStrength(artifact,.2,'2026-01-01');assert.ok(positive.score>0);assert.equal(positive.estimatedUnitReturn,1);
 assert.deepEqual(opportunityStrength(JSON.parse(JSON.stringify(artifact)),.2,'2026-01-01'),positive);
 assert.equal(artifact.validatedForBetting,false);
});
test('few fixtures, insufficient exact-price samples and unavailable results cannot fit GI',()=>{
 assert.equal(fitOpportunityStrength(Array.from({length:100},(_,i)=>row(i)),'2025-02-01').artifact,null);
 assert.equal(fitOpportunityStrength(Array.from({length:300},(_,i)=>row(i,{gameId:'one'})),'2025-02-01').artifact,null);
 assert.throws(()=>fitOpportunityStrength([row(0,{settledAt:'2026-01-01'})],'2025-02-01'),/unavailable/);
 assert.throws(()=>fitOpportunityStrength([row(0),row(0)],'2025-02-01'),/duplicate/);
 const {artifact}=fitOpportunityStrength(Array.from({length:300},(_,i)=>row(i)),'2025-02-01');
 assert.equal(opportunityStrength(artifact,.2,'2025-01-01').score,null);
});
test('tied edges stay together and nonmonotone observed returns are pooled',()=>{
 const rows=Array.from({length:300},(_,i)=>row(i,{expectedReturn:Math.floor(i/100)/10,unitReturn:i<100?.8:i<200?-.5:1}));
 const {artifact}=fitOpportunityStrength(rows,'2025-02-01');
 assert.ok(artifact.blocks.every((b,i)=>!i||b.estimatedUnitReturn>=artifact.blocks[i-1].estimatedUnitReturn));
 assert.equal(artifact.blocks.length,2);
});
test('GI calibration derives actual payouts from the same quote, not saved hit flags or supplied ROI',()=>{
 const target={sport:'nfl',market:'passing_yards',playerId:'p',gameId:'g',gameTime:'2026-09-01T13:00:00Z',actual:220};
 const quote={sport:'nfl',market:'passing_yards',period:'game',gameId:'g',playerId:'p',bookmaker:'Book',quoteId:'q',line:200.5,overPrice:150,underPrice:-170,updatedAt:'2026-09-01T11:55:00Z',capturedAt:'2026-09-01T11:56:00Z',decisionAt:'2026-09-01T12:00:00Z',mainLine:true};
 const r=giCalibrationRow({...target,status:'miss',giScore:99,unitReturn:-1},quote,[210,220,230],'2026-09-02');assert.equal(r.unitReturn,1.5);
 assert.equal(giCalibrationRow(target,{...quote,gameId:'wrong'},[210,220,230],'2026-09-02'),null);
 assert.equal(giCalibrationRow(target,quote,[210,220,230],'2026-09-01T12:00:00Z'),null);
 assert.equal(giCalibrationRow({...target,actual:200.5},quote,[210,220,230],'2026-09-02').unitReturn,0);
});
test('the decision engine requires both forecast value and earlier GI calibration from the same exact quote',()=>{
 const linear=constant=>({means:Array(10).fill(0),scales:Array(10).fill(1),coefficients:[constant,...Array(10).fill(0)]});
 const model={version:1,group:'nfl|passing_yards',trainedThrough:'2025-01-01',calibratedThrough:'2025-03-01',workload:linear(30),rate:linear(8),residuals:[-10,0,10],minimum:null,integer:true,validatedForBetting:false};
 const history=Array.from({length:6},(_,i)=>({sport:'nfl',market:'passing_yards',season:'2026',playerId:'p',playerName:'P',teamId:'A',opponentId:'B',gameId:'prior'+i,gameTime:new Date(Date.UTC(2026,0,1+i*7)).toISOString(),actual:240,workload:30}));
 const target={...history[0],gameId:'g',gameTime:'2026-09-01T13:00:00Z'};
 const quote={sport:'nfl',market:'passing_yards',period:'game',gameId:'g',playerId:'p',bookmaker:'Book',quoteId:'q',line:200.5,overPrice:-110,underPrice:-110,updatedAt:'2026-09-01T11:55:00Z',capturedAt:'2026-09-01T11:56:00Z',decisionAt:'2026-09-01T12:00:00Z',mainLine:true};
 const {artifact}=fitOpportunityStrength(Array.from({length:300},(_,i)=>row(i)),'2025-02-01');
 const result=researchOpportunityDecision(model,history,target,quote,artifact);assert.equal(result.candidatePick,'OVER');assert.ok(result.candidateGi>0);assert.equal(result.forecast.projection,240);assert.equal(result.validatedForBetting,false);
 assert.equal(researchOpportunityDecision(model,history,target,quote,null).reason,'GI_exact_price_calibration_missing');
 assert.equal(researchOpportunityDecision(model,history,target,{...quote,line:240},artifact).candidatePick,null);
 assert.equal(researchOpportunityDecision(model,history,target,{...quote,gameId:'wrong'},artifact).reason,'wrong_identity');
});

test('a single positive calibration level cannot manufacture midpoint GI rankings',()=>{
 const artifact={version:1,trainedThrough:'2025-01-01',calibrationRows:271,fixtures:31,blocks:[{maximumExpectedReturn:.1,estimatedUnitReturn:-.1},{maximumExpectedReturn:1,estimatedUnitReturn:.06}],positiveReturnReference:Array(200).fill(.06),validatedForBetting:false};
 for(const edge of [.01,.2,.8]){const result=opportunityStrength(artifact,edge,'2026-01-01');assert.equal(result.score,null);assert.equal(result.reason,'GI_calibration_has_no_ranking_resolution');assert.equal(result.estimatedUnitReturn,edge<=.1?-.1:.06)}
});
test('different sports and markets cannot inflate GI calibration counts',()=>{
 for(const group of ['nfl|receiving_yards','nba|points','cfb|passing_yards','nhl|shots','cbb|points','wnba|points','soccer|goals','mlb|hits']){const mixed=Array.from({length:300},(_,i)=>row(i,{group:i<150?'nfl|passing_yards':group}));assert.equal(fitOpportunityStrength(mixed,'2025-02-01').reason,'mixed_market_calibration');}
 const legacy=Array.from({length:300},(_,i)=>row(i,{observationId:`nfl|${i<150?'passing_yards':'receiving_yards'}|g${i}`}));assert.equal(fitOpportunityStrength(legacy,'2025-02-01').artifact,null);
});
test('GI cannot cross markets or trust an unscoped legacy calibration',()=>{
 const {artifact}=fitOpportunityStrength(Array.from({length:300},(_,i)=>row(i,{group:'nfl|passing_yards'})),'2025-02-01');assert.equal(artifact.group,'nfl|passing_yards');assert.ok(opportunityStrength(artifact,.2,'2026-01-01','nfl|passing_yards').score>0);assert.equal(opportunityStrength(artifact,.2,'2026-01-01','nba|points').reason,'GI_calibration_scope_unverified');assert.equal(opportunityStrength({...artifact,group:undefined},.2,'2026-01-01','nfl|passing_yards').score,null);
});
