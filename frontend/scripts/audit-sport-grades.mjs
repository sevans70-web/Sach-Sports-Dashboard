// Reads normal performance APIs (which may settle/reconcile) and official feeds.
// Never submits replacement grades or alters the saved call/line.
import fs from 'node:fs/promises';
import {loadTs} from '../tests/load-ts.mjs';
const {reconcileOfficialGrade}=await loadTs(new URL('../lib/grade-reconciliation.ts',import.meta.url));
const origin=process.argv[2]||'https://marvelous-wholeness-production-c8d3.up.railway.app';
const sport=process.argv[3]||'nfl',period=process.argv[4]||'Week';
const output=process.argv[5]||`/tmp/sach-${sport}-grade-audit.json`;
const leagues={nfl:'football/nfl',cfb:'football/college-football',nba:'basketball/nba',wnba:'basketball/wnba',cbb:'basketball/mens-college-basketball'};
if(!leagues[sport]&&sport!=='nhl')throw Error('Unknown sport');
const get=async url=>{const r=await fetch(url,{signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error(`${r.status} ${url}`);return r.json()};
const rows=[];
for(const group of sport==='nfl'?['QB','Offense','Q1']:['']){
 const p=await get(`${origin}/api/${sport}/performance?period=${period}${group?'&group='+group:''}`);
 rows.push(...(p.predictions||p.results||[]));
}
const saved=[...new Map(rows.map(r=>[r.key,r])).values()].filter(r=>['hit','miss','push'].includes(r.historicalStatus||r.status)&&!r.withdrawnFromBoard);
const payloads=new Map(),findings=[];
for(const r of saved){
 if(!r.gameId||String(r.market).startsWith('q1_')||['first_td','first_basket'].includes(r.market))continue;
 const url=sport==='nhl'?`https://api-web.nhle.com/v1/gamecenter/${r.gameId}/boxscore`:`https://site.api.espn.com/apis/site/v2/sports/${leagues[sport]}/summary?event=${r.gameId}`;
 try{
  if(!payloads.has(r.gameId))payloads.set(r.gameId,await get(url));
  const original={...r,status:r.historicalStatus||r.status,pickSide:r.archivedOriginal?.prediction||r.pickSide,sportsbookLine:r.archivedOriginal?.sportsbookLine??r.sportsbookLine};
  const corrected=reconcileOfficialGrade(original,payloads.get(r.gameId),sport);
  if(corrected!==original)findings.push({key:r.key,player:r.playerName,market:r.market,gameId:r.gameId,side:original.pickSide,line:original.sportsbookLine,savedActual:r.actual,officialActual:corrected.actual,savedStatus:original.status,officialStatus:corrected.status,source:url});
 }catch(e){findings.push({key:r.key,error:e.message})}
}
const report={at:new Date().toISOString(),sport,period,records:rows.length,settledRecords:saved.length,fixturesFetched:payloads.size,findings,scope:'Full-game settled records only. Unavailable or incomplete evidence does not prove a grade correct; Q1 and first-scorer sequences are excluded.'};
await fs.writeFile(output,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
