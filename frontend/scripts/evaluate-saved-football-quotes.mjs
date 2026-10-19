import {readFile,writeFile,mkdir} from 'node:fs/promises';import {gunzipSync,gzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
import {loadTs} from '../tests/load-ts.mjs';
const {verifiedPropQuote}=await loadTs(new URL('../lib/prop-integrity.ts',import.meta.url));
const {footballModelObservations}=await loadTs(new URL('../lib/football-model-observations.ts',import.meta.url));
const {evaluateProbabilityModels}=await loadTs(new URL('../lib/probability-forecast.ts',import.meta.url));
const source=process.env.MODEL_OBSERVATIONS_DIR||new URL('../model-research/2026-10-19/nfl-population/',import.meta.url).pathname;
const output=process.argv[2];if(!output)throw Error('Provide a separate output directory');
const period=process.env.MODEL_QUARTERS==='1'?'q1':'game';
const digest=x=>createHash('sha256').update(x).digest('hex');
const compressed=await readFile(source+'/opportunity-observations.json.gz'),manifest=JSON.parse(await readFile(source+'/source-manifest.json','utf8'));
if(digest(compressed)!==manifest.compressedSha256)throw Error('Source digest mismatch');
const bytes=gunzipSync(compressed);if(digest(bytes)!==manifest.dataSha256)throw Error('Observation digest mismatch');
const games=JSON.parse(bytes),byKey=new Map(games.map(g=>[[g.sport,g.market,g.playerId,g.gameId].join('|'),g]));
const base='https://marvelous-wholeness-production-c8d3.up.railway.app',requests=[],rejections={},selected=new Map();
const reject=reason=>{rejections[reason]=(rejections[reason]||0)+1};
for(const group of period==='q1'?['Q1']:['QB','Offense']){
 const url=base+'/api/nfl/performance?period=Today&group='+group,r=await fetch(url,{signal:AbortSignal.timeout(60000)});
 if(!r.ok)throw Error('Saved records returned '+r.status);const data=await r.json(),rows=data.predictions||[];
 requests.push({kind:'saved-quote-records',source:url,retrievedAt:new Date().toISOString(),records:rows.length});
 for(const row of rows){
  if(!(period==='q1'?['q1_passing_yards','q1_rushing_yards','q1_receiving_yards']:['passing_yards','rushing_yards','receiving_yards','receptions']).includes(row.market))continue;
  if(row.withdrawnFromBoard===true){reject('withdrawn');continue}
  if(!verifiedPropQuote(row,Date.now(),true)){reject('unverified_frozen_quote');continue}
  const key=['nfl',row.market,String(row.playerId),String(row.gameId)].join('|');
  const q={sport:'nfl',market:row.market,period,gameId:String(row.gameId),playerId:String(row.playerId),bookmaker:row.sportsbookKey,quoteId:row.quoteId,line:row.sportsbookLine,overPrice:row.overPrice,underPrice:row.underPrice,updatedAt:row.quoteUpdatedAt,capturedAt:row.savedAt,decisionAt:row.savedAt,mainLine:row.lineType==='main'};
  if(selected.has(key))throw Error('Ambiguous saved selected quote '+key);selected.set(key,q);
 }
}
// Independently verify outcomes against completed official summaries. Saved
// hit/miss labels, old projections, sides and GI are never model inputs.
const ids=[...new Set([...selected.values()].map(q=>q.gameId))];
for(const gameId of ids){
 const url='https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event='+gameId;
 const r=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!r.ok){reject('official_summary_'+r.status);continue}
 const payload=await r.json(),retrievedAt=new Date().toISOString();
 const rows=footballModelObservations(payload,{sport:'nfl',season:String(payload.header?.season?.year||''),gameId,source:url,retrievedAt},period,0);
 requests.push({kind:'official-result',source:url,retrievedAt,observations:rows.length,completed:payload.header?.competitions?.[0]?.status?.type?.completed===true});
 for(const g of rows)byKey.set([g.sport,g.market,g.playerId,g.gameId].join('|'),g);
}
const quotes=[...selected].flatMap(([key,q])=>{if(!byKey.has(key)){reject('no_reconciled_official_result');return []}return [q]});
const observations=[...byKey.values()].sort((a,b)=>[a.market,a.playerId,a.season,a.gameTime,a.gameId].join('|').localeCompare([b.market,b.playerId,b.season,b.gameTime,b.gameId].join('|')));
const report=evaluateProbabilityModels(observations,quotes),{models,...metrics}=report;
const raw=JSON.stringify(observations)+'\n',data=gzipSync(raw,{level:9});await mkdir(output,{recursive:true});
await writeFile(output+'/opportunity-observations.json.gz',data);
await writeFile(output+'/selected-quotes.json',JSON.stringify(quotes,null,2)+'\n');
await writeFile(output+'/source-manifest.json',JSON.stringify({population:'Original completed-game population plus independently checked final official outcomes for preserved pregame quotes. Quote selection uses provenance only, never old research side/outcome/GI. Targets may be less than 48 hours old; feature availability retains the 48-hour lag.',observations:observations.length,dataSha256:digest(raw),compressedSha256:digest(data),parentSourceDataSha256:manifest.dataSha256,selectedQuotes:quotes.length,rejections,requests,errors:[]},null,2)+'\n');
console.log(JSON.stringify({selectedQuotes:quotes.length,rejections,groups:metrics.reports.map(({group,exactQuoteSamples,brier,marketBrier,candidateBets,candidateSettled,candidateRoi})=>({group,exactQuoteSamples,brier,marketBrier,candidateBets,candidateSettled,candidateRoi}))},null,2));
// Persist final artifacts through the shared evaluator, not a second writer.
// Run evaluate-probability-models.mjs with this dataset and selected-quotes.json.
