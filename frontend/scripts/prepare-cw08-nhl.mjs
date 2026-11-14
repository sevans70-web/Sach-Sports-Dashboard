import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {gunzipSync,gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {loadTs} from '../tests/load-ts.mjs';
const {probabilityInputs,predictLinear,distributionValues,outcomeProbabilities}=await loadTs(new URL('../lib/probability-forecast.ts',import.meta.url));
const root='model-research/cw08-nhl-expanded/',hash=x=>createHash('sha256').update(x).digest('hex');
const bytes=await readFile(root+'player-games.json.gz'),manifest=JSON.parse(await readFile(root+'source-manifest.json','utf8'));
assert.equal(hash(bytes),manifest.compressedSha256);
const records=JSON.parse(gunzipSync(bytes)),runtimeBytes=await readFile('model-runtime/snapshot.json.gz'),runtime=JSON.parse(gunzipSync(runtimeBytes));
const original=JSON.parse(gunzipSync(await readFile('model-research/2026-10-18/opportunity-observations.json.gz')));
const originalPlayers=new Set(original.filter(g=>g.sport==='nhl'&&['goals','assists'].includes(g.market)).map(g=>String(g.playerId)));
const rows=[],coverage={};
for(const market of ['goals','assists']){
 const model=runtime.models.find(m=>m.group==='nhl|'+market),groups=new Map();
 for(const r of records){
  const g={sport:'nhl',market,season:r.season,playerId:String(r.playerId),playerName:r.skaterFullName,gameId:String(r.gameId),gameTime:r.gameDate+'T00:00:00.000Z',teamId:r.teamAbbrev,opponentId:r.opponentTeamAbbrev,actual:r[market],workload:r.timeOnIcePerGame/60,source:'Official NHL Stats REST',retrievedAt:'2026-11-14T00:00:00Z'};
  const key=[g.playerId,g.teamId,g.season].join('|');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(g);
 }
 for(const history of groups.values())for(const g of history){
  const key=market+'|'+g.season;if(!coverage[key])coverage[key]={observations:0,forecasts:0,abstentions:{}};coverage[key].observations++;
  const input=probabilityInputs(history,g);
  if(!input.features){coverage[key].abstentions[input.reason]=(coverage[key].abstentions[input.reason]||0)+1;continue;}
  const x=input.features,workload=Math.max(0,predictLinear(model.workload,x)),mu=Math.max(0,workload*predictLinear(model.rate,x));
  const values=distributionValues(model,mu);
  rows.push({market,season:g.season,player:g.playerId,game:g.gameId,date:g.gameTime.slice(0,10),y:g.actual,x,legacyMean:mu,legacyP05:outcomeProbabilities(values,.5).over,legacyP15:outcomeProbabilities(values,1.5).over,originalPlayer:originalPlayers.has(g.playerId)});
  coverage[key].forecasts++;
 }
}
rows.sort((a,b)=>a.date.localeCompare(b.date)||a.game.localeCompare(b.game)||a.player.localeCompare(b.player)||a.market.localeCompare(b.market));
const output=gzipSync(JSON.stringify(rows));
const work=process.env.CW08_WORK_DIR||resolve('../work/cw08-nhl-expanded');
await mkdir(work,{recursive:true});
await writeFile(resolve(work,'features.json.gz'),output);
await writeFile(root+'feature-receipt.json',JSON.stringify({sourceSha256:hash(bytes),runtimeSha256:hash(runtimeBytes),protocolSha256:hash(await readFile(root+'protocol.json')),featureSha256:hash(output),rows:rows.length,originalPlayers:[...originalPlayers].sort(),coverage},null,2)+'\n');
console.log(JSON.stringify({rows:rows.length,coverage}));
