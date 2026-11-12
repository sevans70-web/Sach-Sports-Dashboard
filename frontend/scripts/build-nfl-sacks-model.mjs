import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {loadTs} from '../tests/load-ts.mjs';

const [input,teamInput,asOf,output]=process.argv.slice(2);
if(!input||!teamInput||!output||!Number.isFinite(Date.parse(asOf)))throw Error('Provide normalized observations, ESPN teams, ISO capture time and output path');
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const [raw,teamsRaw]=await Promise.all([readFile(input),readFile(teamInput)]);
const teams=new Map(JSON.parse(teamsRaw).sports[0].leagues[0].teams.map(({team})=>[team.abbreviation,team.id]));
teams.set('LA',teams.get('LAR'));
teams.set('WAS',teams.get('WSH'));
const cutoff=Date.parse(asOf)-48*3600000;
const rows=JSON.parse(raw).filter(row=>Date.parse(row.gameTime)<cutoff).map(row=>{
 const teamId=teams.get(row.teamId),opponentId=teams.get(row.opponentId);
 if(!teamId||!opponentId||row.sport!=='nfl'||row.market!=='sacks'||row.actual<0||!Number.isInteger(row.actual*2))throw Error('Invalid defensive observation');
 return {...row,teamId,opponentId,retrievedAt:asOf};
});
const {evaluateProbabilityModels}=await loadTs(new URL('../lib/probability-forecast.ts',import.meta.url));
const {models,reports:[report]}=evaluateProbabilityModels(rows,[],{pointPolicy:'direct'});
if(models.length!==1||report.forecasts<100||!(report.pairedCrpsImprovement?.lower95>0))throw Error('Sacks model failed held-out evaluation');
const observations=rows.filter(row=>row.season==='2026');
const artifact={version:1,asOf,sources:{observations:sha256(raw),teams:sha256(teamsRaw)},models,observations,report};
await writeFile(output,gzipSync(JSON.stringify(artifact),{level:9}));
console.log(JSON.stringify({forecasts:report.forecasts,crps:report.crps,baselineCrps:report.baselineCrps}));
