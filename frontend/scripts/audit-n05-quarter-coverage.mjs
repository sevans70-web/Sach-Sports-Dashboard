import {readFile,writeFile} from 'node:fs/promises';import {gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';import {loadTs} from '../tests/load-ts.mjs';
const {footballQuarterRows}=await loadTs(new URL('../lib/football-quarter-stats.ts',import.meta.url));
const {basketballQ1Actual}=await loadTs(new URL('../lib/basketball-period-settlement.ts',import.meta.url));
const sources={nfl:'model-research/2026-10-27/p01-matchup-saved-replay/official-responses.json.gz',cfb:'docs/n05-quarter-coverage/cfb-official-finals.json.gz',nba:'model-research/2026-10-29-p01-nba-scored/official-results.json.gz'};
const report={generatedAt:new Date().toISOString(),note:'Read-only settlement coverage audit. Counts establish available reconciled observations, not independent model accuracy or proof that an unavailable provider quote exists.',sports:{}};
for(const [sport,path]of Object.entries(sources)){
 const bytes=await readFile(new URL('../'+path,import.meta.url));const parsed=JSON.parse(gunzipSync(bytes));
 const list=Array.isArray(parsed)?parsed:Object.values(parsed);const games=[];
 for(const item of list){const p=item.data||item.payload||item.summary||item;const id=String(p?.header?.id||'');if(!id||p.header?.competitions?.[0]?.status?.type?.completed!==true)continue;
  if(sport!=='nba'){
   const rows=footballQuarterRows(p),markets=['passing_yards','rushing_yards','receiving_yards'];
   const counts=Object.fromEntries(markets.map(m=>[m,{known:rows.filter(r=>r.stats['q1_'+m]!=null).length,unknown:rows.filter(r=>r.stats[m]!=null&&r.stats['q1_'+m]==null).length}]));
   const examples=markets.map(m=>{const r=rows.find(r=>r.stats['q1_'+m]!=null&&r.stats['q1_'+m]!==r.stats[m]);return r?{market:'q1_'+m,playerId:r.playerId,playerName:r.playerName,quarter:r.stats['q1_'+m],fullGame:r.stats[m],audit:r.quarterAudit[m]}:null}).filter(Boolean);
   games.push({gameId:id,counts,examples});
  }else{
   const players=new Map();for(const t of p.boxscore?.players||[])for(const g of t.statistics||[])for(const a of g.athletes||[])if(a.athlete?.id)players.set(String(a.athlete.id),{playerId:String(a.athlete.id),playerName:a.athlete.displayName});
   const markets=['q1_points','q1_rebounds','q1_assists','q1_threes_made','q1_pts_rebs_asts'];const counts=Object.fromEntries(markets.map(m=>[m,{known:[...players.values()].filter(a=>basketballQ1Actual(p,a,m)!=null).length}]));games.push({gameId:id,counts});
  }
 }
 report.sports[sport]={source:path,sha256:createHash('sha256').update(bytes).digest('hex'),completedFixtures:games.length,games};
}
const out=process.argv[2];if(!out)throw Error('Provide a new output path');await writeFile(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(Object.fromEntries(Object.entries(report.sports).map(([k,v])=>[k,{fixtures:v.completedFixtures,known:Object.fromEntries([...new Set(v.games.flatMap(g=>Object.keys(g.counts)))].map(m=>[m,v.games.reduce((n,g)=>n+(g.counts[m]?.known||0),0)]))}]))));
