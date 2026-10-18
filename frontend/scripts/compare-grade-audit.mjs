import fs from 'node:fs/promises';
import {loadTs} from '../tests/load-ts.mjs';
const {footballObservedRows}=await loadTs(new URL('../lib/football-observed-stats.ts',import.meta.url));
const source=process.argv[2];
if(!source)throw Error('Usage: node scripts/compare-grade-audit.mjs input.json [output.json]');
const report=JSON.parse(await fs.readFile(source,'utf8'));
const games=new Map(report.games.map(g=>[g.gameId,g]));
const normalized=new Map(report.games.filter(g=>g.payload).map(g=>[g.gameId,footballObservedRows(g.payload)]));
const findings=[];
for(const row of report.groups.flatMap(g=>g.rows)){
 const game=games.get(String(row.gameId)),final=game?.payload?.header?.competitions?.[0]?.status?.type?.completed===true;
 if(!final||row.market?.startsWith('q1_')||row.market==='first_td')continue;
 const observed=normalized.get(String(row.gameId))?.find(p=>p.playerId===String(row.playerId));
 const actual=observed?.stats[row.market]??null;
 const side=row.archivedOriginal?.prediction||row.pickSide;
 const line=row.archivedOriginal?.sportsbookLine??row.sportsbookLine;
 const expected=actual==null?null:row.market==='anytime_td'?(actual>0?'hit':'miss'):line==null?null:actual===line?'push':side==='UNDER'?(actual<line?'hit':'miss'):side==='OVER'?(actual>line?'hit':'miss'):null;
 findings.push({player:row.playerName,playerId:row.playerId,officialPlayer:observed?.playerName||null,market:row.market,gameId:row.gameId,side,line,savedActual:row.actual,officialActual:actual,savedStatus:row.historicalStatus,expected,withdrawn:row.withdrawnFromBoard===true,actualMismatch:actual!=null&&row.actual!=null&&actual!==row.actual,statusMismatch:expected!=null&&['hit','miss','push'].includes(row.historicalStatus)&&expected!==row.historicalStatus,identityMissing:!observed,gradedAt:row.gradedAt});
}
const result={at:report.at,rows:findings.length,actualMismatches:findings.filter(f=>f.actualMismatch),statusMismatches:findings.filter(f=>f.statusMismatch),identityMissing:findings.filter(f=>f.identityMissing),findings};
await fs.writeFile(process.argv[3]||'/tmp/sach-grade-comparison.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,findings:findings.filter(f=>['Tyler Huntley','Tanner McKee','Aaron Rodgers','Jalon Daniels','Michael Penix Jr.','Jameis Winston','Deshaun Watson','Dameon Pierce','Braelon Allen','Chris Rodriguez Jr.','Roschon Johnson','Rhamondre Stevenson'].includes(f.player)&&['passing_yards','rushing_yards'].includes(f.market))},null,2));
