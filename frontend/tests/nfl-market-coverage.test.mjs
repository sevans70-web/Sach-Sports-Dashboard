import test from'node:test';import assert from'node:assert/strict';import{loadTs}from'./load-ts.mjs';
const{footballObservedRows}=await loadTs(new URL('../lib/football-observed-stats.ts',import.meta.url)),{footballHistoryValues,footballResearchSample}=await loadTs(new URL('../lib/football-history.ts',import.meta.url)),{NFL_MARKETS}=await loadTs(new URL('../lib/nfl.ts',import.meta.url)),{nflPredictionProbability}=await loadTs(new URL('../lib/nfl-prediction.ts',import.meta.url));
const payload={boxscore:{players:[{team:{id:'1'},statistics:[{name:'passing',labels:['C/ATT','YDS','TD','INT'],athletes:[{athlete:{id:'qb',displayName:'QB'},stats:['20/30','250','2','0']}]},{name:'rushing',labels:['CAR','YDS'],athletes:[{athlete:{id:'qb'},stats:['2','10']}]},{name:'defensive',labels:['SOLO','TOT','SACKS','INT'],athletes:[{athlete:{id:'db',displayName:'DB'},stats:['4','7','0.5','2']}]}]}]}};
test('NFL passing interceptions are listed and read from passing only; defensive stats keep their separate units',()=>{
 assert.ok(NFL_MARKETS.some(m=>m[0]==='passing_interceptions'));
 const rs=footballObservedRows(payload),qb=rs.find(r=>r.playerId==='qb').stats,db=rs.find(r=>r.playerId==='db').stats;
 assert.equal(qb.passing_interceptions,0);assert.equal(qb.passing_yards,250);assert.equal(qb.passing_tds,2);assert.equal(qb.passing_rushing_yards,260);
 assert.equal(db.tackles,4);assert.equal(db.tackles_assists,7);assert.equal(db.sacks,.5);assert.equal(db.passing_interceptions,undefined);
 assert.equal(nflPredictionProbability('passing_interceptions',.8,.5,70),null);
});
test('combined history requires every component, preserves a real zero and never treats missing receiving yards as zero',()=>{
 const aliases=[['rushingyards'],['receivingyards']],log={names:['rushingYards','receivingYards'],seasonTypes:[{categories:[{type:'event',events:[{eventId:'1',stats:['10',null]},{eventId:'2',stats:['0','20']}]}]}]};
 assert.deepEqual(footballHistoryValues(log,aliases),[20]);assert.deepEqual(footballHistoryValues({...log,names:['rushingYards']},aliases),[]);
 const absent=structuredClone(payload);absent.boxscore.players[0].statistics=absent.boxscore.players[0].statistics.filter(g=>g.name!=='rushing');
 assert.equal(footballObservedRows(absent).find(r=>r.playerId==='qb').stats.passing_rushing_yards,null);
});
test('passing interception baseline excludes low-attempt roles and future games using the existing passing cohort policy',()=>{
 const log={names:['passingInterceptions','passingAttempts'],events:{a:{gameDate:'2026-10-01'},b:{gameDate:'2026-10-10'}},seasonTypes:[{categories:[{type:'event',events:[{eventId:'a',stats:['0','2']},{eventId:'b',stats:['1','30']}]}]}]};
 const r=footballResearchSample(log,['passinginterceptions'],'passing_interceptions','2026-10-08',2026);assert.equal(r.games,0);assert.equal(r.observations.find(o=>o.eventId==='a').reason,'limited_passing_role');assert.equal(r.observations.find(o=>o.eventId==='b').reason,'not_pregame');
});

test('full-game progress preserves official defense and offense totals without requiring a quarter tape',async()=>{
 const {footballRowsForMarket}=await loadTs(new URL('../lib/football-quarter-stats.ts',import.meta.url));
 for(const market of ['passing_yards','passing_tds','passing_interceptions','passing_rushing_yards','rushing_yards','receiving_yards','receptions','rushing_receiving_yards','sacks','tackles','tackles_assists'])assert.deepEqual(footballRowsForMarket(payload,market),footballObservedRows(payload));
 assert.equal(footballRowsForMarket(payload,'q1_passing_yards').find(r=>r.playerId==='qb').stats.q1_passing_yards,null);
 const {cardObservedProgress,cardStatUnit}=await loadTs(new URL('../lib/card-results.ts',import.meta.url));
 assert.equal(cardStatUnit('passing_interceptions'),'interceptions thrown');assert.equal(cardStatUnit('tackles'),'solo tackles');
 assert.equal(cardObservedProgress(.5,1.5,'sacks').actual,.5);
});
