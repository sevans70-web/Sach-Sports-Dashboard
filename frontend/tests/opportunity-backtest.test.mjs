import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {espnOpportunityGames,opportunityFeatures,evaluateOpportunityModels}=await loadTs(new URL('../lib/opportunity-backtest.ts',import.meta.url));
const identity={sport:'nfl',season:'2025',playerId:'1',playerName:'Player',source:'https://official.test/log',retrievedAt:'2026-10-18T12:00:00Z'};
function game(i,more={}){return {...identity,gameId:String(i),gameTime:new Date(Date.UTC(2025,8,i*7+1)).toISOString(),teamId:'A',opponentId:'B',market:'passing_yards',actual:200+i,workload:30,...more}}
test('dated official passing logs retain low-volume zero appearances, skip missing data and preseason',()=>{
 const event=(id,stats)=>({eventId:id,stats}),meta=(date)=>({gameDate:date,gameResult:'W',team:{id:'A'},opponent:{id:'B'}});
 const p={names:['passingYards','passingAttempts'],events:{a:meta('2025-09-01'),b:meta('2025-09-08'),c:meta('2025-09-15')},seasonTypes:[{type:2,categories:[{type:'event',events:[event('a',[0,2]),event('b',['',30])]}]},{type:1,categories:[{type:'event',events:[event('c',[500,40])]}]}]};
 const rows=espnOpportunityGames(p,identity);assert.equal(rows.length,1);assert.equal(rows[0].actual,0);assert.equal(rows[0].workload,2);
});
test('features ignore target outcome/workload, future games, earlier seasons and previous teams',()=>{
 const history=Array.from({length:5},(_,i)=>game(i)),target=game(6),base=opportunityFeatures(history,target);
 assert.ok(base.features);assert.deepEqual(opportunityFeatures([...history,game(9,{actual:99999})],{...target,actual:99999,workload:1}),base);
 assert.equal(opportunityFeatures(history.map(g=>({...g,teamId:'OLD'})),target).features,null);
 assert.equal(opportunityFeatures(history.map(g=>({...g,season:'2024'})),target).features,null);
});
test('prior role uncertainty abstains while low workload in the future target does not disappear from evaluation',()=>{
 const history=Array.from({length:5},(_,i)=>game(i));assert.equal(opportunityFeatures(history,game(6,{actual:0,workload:2})).reason,null);
 history[4].workload=2;assert.equal(opportunityFeatures(history,game(6)).reason,'prior_workload_role_uncertain');
});
test('reports never enable GI or certify betting validation, including empty input',()=>{
 const r=evaluateOpportunityModels([]);assert.equal(r.giEnabled,false);assert.equal(r.validatedForBetting,false);assert.ok(r.limitations.some(x=>x.includes('selection bias')));
 assert.throws(()=>evaluateOpportunityModels([game(1),game(1)]),/Duplicate/);
});
test('NHL goalie saves use observed shots minus goals, never skater goals as a goalie market',async()=>{
 const {nhlOpportunityGames}=await loadTs(new URL('../lib/opportunity-backtest.ts',import.meta.url));
 const rows=nhlOpportunityGames({gameLog:[{gameId:10,gameDate:'2025-10-01',teamAbbrev:'A',opponentAbbrev:'B',toi:'28:06',shotsAgainst:13,goalsAgainst:4,goals:0,assists:0}]},{...identity,sport:'nhl'});
 assert.equal(rows.length,1);assert.equal(rows[0].market,'goalie_saves');assert.equal(rows[0].actual,9);assert.equal(rows[0].workload,28.1);
});
test('real fitting uses previous seasons; target relief appearances remain in held-out scores',()=>{
 const rows=[];
 for(const season of ['2025','2026'])for(let p=0;p<12;p++)for(let i=0;i<14;i++)rows.push(game(i,{season,playerId:String(p),gameId:season+'-'+p+'-'+i,gameTime:new Date(Date.UTC(Number(season),0,1+i*7)).toISOString(),workload:season==='2026'&&i===13?2:30,actual:season==='2026'&&i===13?0:180+p+i}));
 const r=evaluateOpportunityModels(rows).groups[0];assert.equal(r.trainingExamples,132);assert.equal(r.forecasts,132);assert.equal(r.lowWorkloadTargetAppearances,12);assert.ok(Number.isFinite(r.modelMae));
 assert.throws(()=>evaluateOpportunityModels([...rows,game(0,{playerId:'overlap',gameId:'overlap',gameTime:'2027-01-01'})]),/overlap/);
});
