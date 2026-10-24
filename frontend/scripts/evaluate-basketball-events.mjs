import fs from 'node:fs/promises';import {gunzipSync} from 'node:zlib';import {loadTs} from '../tests/load-ts.mjs';
const {basketballFeatureIndex}=await loadTs(new URL('../lib/basketball-model-inputs.ts',import.meta.url));
const {basketballModelObservations}=await loadTs(new URL('../lib/basketball-model-observations.ts',import.meta.url));
const {fitLinear,predictLinear}=await loadTs(new URL('../lib/probability-forecast.ts',import.meta.url));
const input=process.argv[2],output=process.argv[3];if(!input||!output)throw Error('Input event JSON and output directory required');await fs.mkdir(output,{recursive:true});
const events=JSON.parse(await fs.readFile(input)),history=[];
const sourceDir=input.slice(0,input.lastIndexOf('/'))+'/sources';
for(const event of events){try{const p=JSON.parse(gunzipSync(await fs.readFile(sourceDir+'/'+event.gameId+'.json.gz')));history.push(...basketballModelObservations(p,{sport:'nba',season:event.season,gameId:event.gameId,source:'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event='+event.gameId,retrievedAt:event.retrievedAt}));}catch{}}
console.log(JSON.stringify({officialCensusObservations:history.length,fixtures:new Set(history.map(r=>r.gameId)).size}));
const quarterHistory=new Map();
for(const g of events.filter(g=>g.q1Complete))for(const p of g.players){const k=p.playerId+'|'+p.teamId;const xs=quarterHistory.get(k)||[];xs.push({...p,gameTime:g.gameTime});quarterHistory.set(k,xs);}
for(const xs of quarterHistory.values())xs.sort((a,b)=>a.gameTime.localeCompare(b.gameTime));
const mean=xs=>xs.reduce((s,n)=>s+n,0)/xs.length;
const index=basketballFeatureIndex(history),lookup=new Map(history.map(g=>[g.gameId+'|'+g.playerId+'|'+g.market,g])),reports=[],artifacts=[];
for(const [market,base,field] of [['q1_points','points','points'],['q1_rebounds','rebounds','rebounds'],['q1_assists','assists','assists'],['q1_threes_made','threes_made','threes']]){
 const rows=[];for(const game of events.filter(g=>g.q1Complete))for(const p of game.players){if(p[field]==null)continue;const target=lookup.get(game.gameId+'|'+p.playerId+'|'+base);if(!target)continue;const prior=index(target);const quarters=(quarterHistory.get(p.playerId+'|'+p.teamId)||[]).filter(r=>Date.parse(r.gameTime)<Date.parse(game.gameTime)-48*3600000&&Date.parse(r.gameTime)>Date.parse(game.gameTime)-366*86400000&&r[field]!=null).slice(-10);
 if(prior.features&&quarters.length>=5)rows.push({x:[...prior.features,...['points','rebounds','assists','threes'].flatMap(f=>[mean(quarters.slice(-3).map(r=>r[f]??0)),mean(quarters.map(r=>r[f]??0))]),quarters.at(-1)[field]],y:p[field],quarterBaseline:mean(quarters.map(r=>r[field])),baseline:prior.baseline/4,gameTime:game.gameTime,gameId:game.gameId,season:game.season});}
 const prior=rows.filter(r=>r.season==='2025').sort((a,b)=>a.gameTime.localeCompare(b.gameTime)),fixtures=[...new Set(prior.map(r=>r.gameId))],split=Math.floor(fixtures.length*.65),trainingIds=new Set(fixtures.slice(0,split));
 const train=prior.filter(r=>trainingIds.has(r.gameId)),cal=prior.filter(r=>!trainingIds.has(r.gameId)),test=rows.filter(r=>r.season==='2026');
 const model=fitLinear(train);if(!model||train.length<100||cal.length<100||!test.length){reports.push({market,status:'insufficient_data',train:train.length,calibration:cal.length,test:test.length});continue;}
 const forecast=r=>Math.max(0,predictLinear(model,r.x));const residuals=cal.map(r=>r.y-forecast(r));
 const mae=mean(test.map(r=>Math.abs(r.y-forecast(r)))),baselineMae=mean(test.map(r=>Math.abs(r.y-r.baseline))),quarterBaselineMae=mean(test.map(r=>Math.abs(r.y-r.quarterBaseline)));
 reports.push({market,trainingRows:train.length,trainingFixtures:split,calibrationRows:cal.length,testRows:test.length,testFixtures:new Set(test.map(r=>r.gameId)).size,mae,baselineMae,quarterBaselineMae,improvementPct:100*(baselineMae-mae)/baselineMae,status:mae<baselineMae?'point_error_improved':'point_error_failed',validatedForBetting:false});
 artifacts.push({market,model,residuals,trainedThrough:train.at(-1).gameTime,calibratedThrough:cal.at(-1).gameTime,featurePolicy:'prior_quarter_history_and_full_game_role_context',validatedForBetting:false});
}
const report={at:new Date().toISOString(),reports,limitations:['Fixture universe comes from the existing runtime census; completeness against a full official season schedule is not certified.','2026 was used for earlier model research and is not a fresh untouched holdout.','Historical official source revisions are observed now, not archived pregame data vintages.','No exact Q1 sportsbook-price evaluation, probability calibration certification, injury/rotation vintage or profitable-return evidence.','Quarter labels are conditional on observed Q1 participation; pregame lineup and bookmaker quarter-participation rules are not historically certified.','These candidate models do not authorize live betting recommendations.']};
await fs.writeFile(output+'/q1-evaluation.json',JSON.stringify(report,null,2));await fs.writeFile(output+'/q1-candidates.json',JSON.stringify(artifacts));console.log(JSON.stringify(report));
