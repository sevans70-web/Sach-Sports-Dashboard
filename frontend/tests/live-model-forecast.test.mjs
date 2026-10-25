import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {fittedResearchForecast}=await loadTs(new URL('../lib/live-model-forecast.ts',import.meta.url));
const linear=n=>({means:Array(10).fill(0),scales:Array(10).fill(1),coefficients:[n,...Array(10).fill(0)]});
const model={version:1,group:'nfl|passing_yards',trainedThrough:'2025-01-01',calibratedThrough:'2025-03-01',workload:linear(30),rate:linear(8),residuals:[-10,0,10],minimum:0,integer:true,validatedForBetting:false};
const history=Array.from({length:6},(_,i)=>({sport:'nfl',market:'passing_yards',season:'2026',playerId:'p',playerName:'P',teamId:'A',opponentId:'B',gameId:'prior'+i,gameTime:new Date(Date.UTC(2026,0,1+i*7)).toISOString(),actual:100,workload:30}));
const row={sport:'nfl',market:'passing_yards',season:'2026',playerId:'p',playerName:'P',teamId:'A',opponentId:'B',gameId:'g',gameTime:'2026-09-01T13:00:00Z',modelProjection:100,giScore:null,modelProbability:null,prediction:'NO PICK'};
const data={models:[model],observations:history,digest:'test',asOf:'2026-08-30T00:00:00Z',gi:{}},now=Date.parse('2026-09-01T12:00:00Z');
test('fitted workload and rate produce a projection distinct from the unchanged historical mean',()=>{
 const f=fittedResearchForecast(row,'nfl','passing_yards',data,now);assert.equal(f.projection,240);assert.equal(f.expectedWorkload,30);assert.equal(f.validatedForBetting,false);assert.equal(f.giScore,null);assert.equal(row.modelProjection,100);assert.equal(row.prediction,'NO PICK');
});
test('target outcomes, book line and archived heuristic scores cannot alter the forecast',()=>{
 const f=fittedResearchForecast(row,'nfl','passing_yards',data,now);
 assert.deepEqual(fittedResearchForecast({...row,actual:9999,workload:9999,sportsbookLine:9999,giScore:99},'nfl','passing_yards',data,now),f);
});
test('missing histories, future snapshots, after-start and unsupported markets abstain',()=>{
 for(const r of [{...row,gameTime:'2026-08-31'},{...row,teamId:''},{...row,teamId:'new'},{...row,frozen:true}])assert.equal(fittedResearchForecast(r,'nfl','passing_yards',data,now).status,'unavailable');
 assert.equal(fittedResearchForecast(row,'nfl','passing_yards',{...data,asOf:'2026-09-02'},now).status,'unavailable');
 assert.equal(fittedResearchForecast(row,'nfl','q1_passing_yards',data,now).reason,'market_model_not_fitted');
});
test('an exact official context supplies a missing season; another fixture cannot do so',()=>{
 const context={gameId:row.gameId,playerId:row.playerId,teamId:row.teamId,gameTime:row.gameTime,season:'2026',seasonType:2};
 assert.equal(fittedResearchForecast({...row,season:undefined,pregameContext:context},'nfl','passing_yards',data,now).projection,240);
 assert.equal(fittedResearchForecast({...row,season:undefined,pregameContext:{...context,gameId:'other'}},'nfl','passing_yards',data,now).status,'unavailable');
});
test('WNBA workload models accept playoff fixture identity without borrowing the NBA regular-season context restriction',()=>{
 const wnbaRow={...row,sport:'wnba',market:'points',pregameContext:{gameId:row.gameId,playerId:row.playerId,teamId:row.teamId,gameTime:row.gameTime,season:'2026',seasonType:3}};
 const wnbaData={...data,models:[{...model,group:'wnba|points'}],observations:history.map(g=>({...g,sport:'wnba',market:'points'}))};
 assert.equal(fittedResearchForecast(wnbaRow,'wnba','points',wnbaData,now).status,'available');
 assert.equal(fittedResearchForecast({...wnbaRow,teamId:''},'wnba','points',wnbaData,now).reason,'wrong_pregame_context_identity');
});
test('GI requires exact fresh quote evidence and a prior calibration artifact',()=>{
 const artifact={version:1,trainedThrough:'2026-08-01',calibrationRows:300,fixtures:40,blocks:[{maximumExpectedReturn:.1,estimatedUnitReturn:.05},{maximumExpectedReturn:10,estimatedUnitReturn:.1}],positiveReturnReference:[.05,.1],validatedForBetting:false};
 const withGi={...data,gi:{'nfl|passing_yards':artifact}};
 assert.equal(fittedResearchForecast(row,'nfl','passing_yards',withGi,now).giScore,null);
 const quoted={...row,quoteVersion:1,sportsbookKey:'book',sportsbook:'Book',quoteId:'q',lineType:'main',sportsbookLine:200.5,overPrice:-110,underPrice:-110,quoteUpdatedAt:'2026-09-01T11:59:00Z',capturedAt:'2026-09-01T11:59:30Z'};
 const f=fittedResearchForecast(quoted,'nfl','passing_yards',withGi,now);assert.equal(f.giScore,75);assert.equal(f.candidateSide,'OVER');assert.equal(f.validatedForBetting,false);assert.equal(quoted.prediction,'NO PICK');
 assert.equal(fittedResearchForecast({...quoted,quoteUpdatedAt:'2026-09-01T10:00:00Z'},'nfl','passing_yards',withGi,now).giScore,null);
 assert.equal(fittedResearchForecast(quoted,'nfl','passing_yards',{...withGi,gi:{'nfl|passing_yards':{...artifact,trainedThrough:'2026-09-02'}}},now).giScore,null);
});
test('a model selection can exist without GI while failed, stale and after-start decisions abstain',()=>{
 const quoted={...row,quoteVersion:1,sportsbookKey:'book',sportsbook:'Book',quoteId:'q',lineType:'main',sportsbookLine:200.5,overPrice:-110,underPrice:-110,quoteUpdatedAt:'2026-09-01T11:59:00Z',capturedAt:'2026-09-01T11:59:30Z'};
 const forecast=fittedResearchForecast(quoted,'nfl','passing_yards',data,now);
 assert.equal(forecast.giScore,null);
 assert.equal(forecast.modelSelection.side,'OVER');
 assert.equal(forecast.modelSelection.line,200.5);
 assert.equal(forecast.modelSelection.price,-110);
 assert.equal(forecast.modelSelection.quoteId,'q');
 assert.equal(forecast.modelSelection.validatedForBetting,false);
 assert.equal(quoted.prediction,'NO PICK');
 assert.equal(fittedResearchForecast({...quoted,quoteUpdatedAt:'2026-09-01T10:00:00Z'},'nfl','passing_yards',data,now).modelSelection,null);
 assert.equal(fittedResearchForecast(quoted,'nfl','passing_yards',{...data,giStatus:{'nfl|passing_yards':{reason:'price_validation_failed'}}},now).modelSelection,null);
 assert.equal(fittedResearchForecast({...quoted,gameState:'in'},'nfl','passing_yards',data,now).status,'unavailable');
 assert.equal(fittedResearchForecast({...quoted,sportsbookLine:240,overPrice:-110,underPrice:-110},'nfl','passing_yards',data,now).modelSelection,null);
});
test('combination forecasts sum fitted component expectations without inventing joint probability or GI',()=>{
 const comboRow={...row,sport:'nba',market:'pts_rebs'};
 const models=['points','rebounds'].map((market,i)=>({...model,group:'nba|'+market,rate:linear(i?2:8)}));
 const observations=['points','rebounds'].flatMap(market=>history.map(g=>({...g,sport:'nba',market})));
 const f=fittedResearchForecast(comboRow,'nba','pts_rebs',{...data,models,observations},now);
 assert.equal(f.projection,300);assert.equal(f.modelSelection,null);assert.equal(f.priceComparison,null);assert.equal(f.giScore,null);assert.equal(f.validatedForBetting,false);
 assert.equal(fittedResearchForecast(comboRow,'nba','pts_rebs',{...data,models:models.slice(0,1),observations},now).reason,'component_forecast_unavailable');
 assert.equal(fittedResearchForecast({...comboRow,market:'q1_pts_rebs_asts'},'nba','q1_pts_rebs_asts',{...data,models,observations},now).reason,'market_model_not_fitted');
});
