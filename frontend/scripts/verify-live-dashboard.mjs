import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.argv[2]||'https://marvelous-wholeness-production-c8d3.up.railway.app';
const report={base,startedAt:new Date().toISOString(),summaries:[],markets:[],checks:[]};
async function request(path,method='GET'){
 const start=Date.now();try{const r=await fetch(base+path,{method,signal:AbortSignal.timeout(60000),cache:'no-store'});const data=await r.json();return {path,http:r.status,ms:Date.now()-start,data}}catch(e){return {path,http:0,ms:Date.now()-start,error:e.message}}
}
async function pool(items,work,workers=3){let index=0;await Promise.all(Array.from({length:workers},async()=>{while(index<items.length)await work(items[index++])}));}
const sports=['nfl','cfb','nba','wnba','nhl','cbb'];
await pool(sports,async sport=>{
 const result=await request('/api/dashboard-summary?sport='+sport),d=result.data;
 try{assert.equal(result.http,200);assert.equal(d.scheduleAvailable,true);assert.equal(d.games,d.previewGames.length);assert.equal(d.lineups,d.games*2);assert.ok(d.confirmedLineups<=d.lineups);assert.equal(d.pendingLineups+d.confirmedLineups,d.lineups);assert.equal(d.predictions,d.verifiedRows.length);assert.equal(new Set(d.previewGames.map(g=>g.id)).size,d.games);result.contract='pass'}catch(e){result.contract=e.message}
 const summary={...result,data:undefined,sport,games:d?.games,predictions:d?.predictions,playerProps:d?.playerProps,ranked:d?.rankedPlayers,rankingsAvailable:d?.rankingsAvailable,warning:d?.warning};report.summaries.push(summary);console.log(JSON.stringify(summary));
});
const paths=[];
for(const sport of ['nfl','cfb','nba','wnba','nhl','cbb']){
 const source=await readFile(new URL('../lib/'+sport+'.ts',import.meta.url),'utf8');
 const definitions=source.slice(source.indexOf('MARKETS =')+9).split('as const')[0];
 const markets=[...definitions.matchAll(/\["([a-z0-9_]+)"\s*,/g)].map(m=>m[1]);
 for(const market of markets.filter(m=>sport!=='nfl'||!m.startsWith('q1_')||['q1_passing_yards','q1_rushing_yards','q1_receiving_yards'].includes(m)))paths.push(`/api/${sport}/rankings?market=${market}`);
}
// Paused sports keep their APIs/history but are not part of active dashboard checks.
await pool(paths,async path=>{
 const r=await request(path),d=r.data||{},rows=Array.isArray(d.rows)?d.rows:path.includes('/soccer/')?Object.values(d.rankings||{}).flat():Object.values(d.batter||{}).concat(Object.values(d.pitcher||{})).flat();
 const ids=rows.map(x=>[x.playerId||x.player_id||x.playerName,x.gameId||x.game_pk||x.gameTime,x.market||''].join('|'));
 // MLB/soccer combine independent market boards; uniqueness belongs within a board.
 const unique=path.includes('/mlb/')||path.includes('/soccer/')?null:new Set(ids).size===ids.length;
 const issues=[];
 for(const row of rows){
  if(row.integrityVersion!==1)issues.push('missing integrity contract');
  if(row.recommendationEligible!==true&&(row.prediction!=='NO PICK'||row.giScore!=null||row.modelProbability!=null))issues.push('unsupported recommendation exposed');
  if(!row.quoteVerified&&row.sportsbookLine!=null)issues.push('unverified main betting line exposed');
  if(row.researchOnly&&path.includes('market=q1_')&&row.modelProjection!=null)issues.push('unvalidated quarter projection exposed');
  for(const game of row.researchCohort?.observations||[])if(game.included){
   if(Date.parse(game.date)>=Date.parse(row.gameTime))issues.push('research sample leaks game result');
   if(game.reason!=null)issues.push('excluded appearance included');
  }
 }
 const result={path,http:r.http,ms:r.ms,success:d.success,semanticIssues:[...new Set(issues)],rows:rows.length,backed:rows.filter(x=>(x.sportsbookLine??x.marketLine)!=null).length,unique,error:r.error||d.error||null};report.markets.push(result);console.log(JSON.stringify(result));
});
await pool(['/api/health','/api/history/status','/api/platform-performance',...sports.filter(s=>s!=='mlb').map(s=>`/api/${s}/performance?period=Week`)],async path=>{
 const r=await request(path),d=r.data||{},check={path,http:r.http,ms:r.ms,success:d.success,connected:d.connected,storageOk:d.storage?.ok,hits:d.hits,settled:d.settled,pending:d.pending,total:d.total,error:r.error||d.error||null};report.checks.push(check);console.log(JSON.stringify(check));
},2);
await pool(['nba','wnba','nhl','cbb'],async sport=>{
 const r=await request(`/api/${sport}/capture${sport==='soccer'?'?league=eng.1':''}`,'POST'),d=r.data||{},check={path:r.path,http:r.http,ms:r.ms,success:d.success,verifiedPredictions:d.verifiedPredictions,markets:d.markets,leagues:d.leagues,warning:d.warning,error:r.error||d.error||null};report.checks.push(check);console.log(JSON.stringify(check));
},2);
report.finishedAt=new Date().toISOString();
report.pass=report.summaries.every(s=>s.contract==='pass')&&report.markets.every(r=>r.http===200&&r.success!==false&&r.unique!==false&&r.semanticIssues.length===0)&&report.checks.every(r=>r.http===200);
if(process.argv[3])await writeFile(process.argv[3],JSON.stringify(report,null,2));
console.log(JSON.stringify({pass:report.pass,markets:report.markets.length,httpErrors:report.markets.filter(r=>r.http!==200),summaryFailures:report.summaries.filter(s=>s.contract!=='pass')}));
if(!report.pass)process.exitCode=1;
