import {readFile,writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {loadTs} from '../tests/load-ts.mjs';
const {evaluateProbabilityModels}=await loadTs(new URL('../lib/probability-forecast.ts',import.meta.url));
const [input,asOf,output]=process.argv.slice(2);
if(!input||!asOf||!output||!Number.isFinite(Date.parse(asOf)))throw Error('Provide source directory, ISO capture time and output path');
const cutoff=Date.parse(asOf)-48*3600000;
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const sources={};
const rows=[];
for(const season of ['20242025','20252026','20262027']){
 const source='https://api.nhle.com/stats/rest/en/goalie/summary';
 const bytes=await readFile(resolve(input,season+'.json'));
 const payload=JSON.parse(bytes);
 sources[season]=sha256(bytes);
 if(payload.data.length!==payload.total)throw Error('Incomplete source season');
 for(const r of payload.data){
  if(r.gamesStarted!==1||!Number.isInteger(r.saves)||r.timeOnIce<=0||!r.teamAbbrev||!r.opponentTeamAbbrev||!r.playerId||!r.gameId)continue;
  const gameTime=r.gameDate+'T23:59:59Z';
  if(!Number.isFinite(Date.parse(gameTime))||Date.parse(gameTime)>=cutoff)continue;
  rows.push({sport:'nhl',market:'goalie_saves',season,playerId:String(r.playerId),playerName:r.goalieFullName,gameId:String(r.gameId),gameTime,teamId:r.teamAbbrev,opponentId:r.opponentTeamAbbrev,actual:r.saves,workload:r.timeOnIce/60,source,retrievedAt:asOf});
 }
}
const r=evaluateProbabilityModels(rows,[],{calibration:'workload'});
const d=r.reports[0];
if(r.models.length!==1||d.forecasts<100||d.pairedCrpsImprovement?.lower95<=0||!Number.isFinite(d.pairedCrpsImprovement?.lower95))throw Error('Goalie saves model failed held-out evaluation');
const observations=rows.filter(r=>r.season==='20262027');
const artifact={version:1,asOf,sources,models:r.models,observations,report:d};
await writeFile(output,gzipSync(JSON.stringify(artifact),{level:9}));
console.log(JSON.stringify({total:rows.length,report:d},null,2));
