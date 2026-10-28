import {readFile,writeFile,mkdir} from 'node:fs/promises';import {gunzipSync,gzipSync} from 'node:zlib';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';import {loadTs} from '../tests/load-ts.mjs';
const [source,candidate,audit,output]=process.argv.slice(2);if(!output)throw Error('Provide source, frozen candidate, saved audit and NEW output directory');
const hash=b=>createHash('sha256').update(b).digest('hex');
const compressed=await readFile(source+'/opportunity-observations.json.gz'),manifest=JSON.parse(await readFile(source+'/source-manifest.json','utf8'));assert.equal(hash(compressed),manifest.compressedSha256);const raw=gunzipSync(compressed);assert.equal(hash(raw),manifest.dataSha256);
const modelBytes=await readFile(candidate+'/models.json.gz'),model=JSON.parse(gunzipSync(modelBytes)).find(m=>m.group==='nfl|passing_yards');if(!model)throw Error('No frozen candidate');
const originalBytes=await readFile(audit+'/selection-protocol.json'),selected=JSON.parse(originalBytes).selected;
if(!selected.length||selected.some(r=>r.market!=='passing_yards'||r.line!==r.probability.line||!r.probability.quoteId||!['OVER','UNDER'].includes(r.probability.side)||!Number.isFinite(r.line)||![r.probability.win,r.probability.loss].every(Number.isFinite)||r.probability.win<0||r.probability.loss<0||r.probability.win+r.probability.loss<=0||r.probability.win+r.probability.loss>1+1e-9||![r.probability.calculatedAt,r.gameTime].every(t=>Number.isFinite(Date.parse(t)))||Date.parse(r.probability.calculatedAt)>=Date.parse(r.gameTime)))throw Error('Invalid original saved probability');
if(new Set(selected.map(r=>r.gameId+'|'+r.playerId)).size!==selected.length)throw Error('Duplicate saved target');
await mkdir(output,{recursive:false});
const protocol={createdAt:new Date().toISOString(),candidateSha256:hash(modelBytes),sourceSha256:manifest.dataSha256,originalSelectionSha256:hash(originalBytes),
 selection:'All22 frozen original pregame passing probabilities from the existing independent official-final audit; no side/result filtering. Candidate coefficients/residuals fixed before this replay; no refitting.',
 availability:'Only results older than48h before each original calculation can enter features. Verify exact game/player/season/team and final official result. Current revised data, not archived historical publication vintages.',
 comparison:'Paired conditional OVER Brier and direction at original line. No original two-sided prices available in this audit: no market/EV/ROI conclusion. Candidate direction is diagnostic, never an issued pick.',
 limitations:'This is a disjoint saved-quote cohort from the earlier18-quote candidate comparison, but its outcomes were already inspected in the original audit. NOT an untouched holdout or prospective validation.',livePromotion:false};
await writeFile(output+'/protocol.json',JSON.stringify(protocol,null,2)+'\n');
const {footballModelObservations}=await loadTs(new URL('../lib/football-model-observations.ts',import.meta.url));const {footballMatchupIndex}=await loadTs(new URL('../lib/football-matchup-inputs.ts',import.meta.url));const {predictLinear,distributionValues,outcomeProbabilities,clusteredMeanInterval}=await loadTs(new URL('../lib/probability-forecast.ts',import.meta.url));
const fixtures=[...new Set(selected.map(r=>r.gameId))],responses=[],failures=[];let index=0;
const receiptFile=process.env.MODEL_OFFICIAL_RECEIPTS;
if(receiptFile){
 const cached=JSON.parse(gunzipSync(await readFile(receiptFile)));
 for(const gameId of fixtures){const found=cached.filter(r=>r.gameId===gameId);if(found.length!==1)throw Error('Ambiguous or missing official receipt');const r=found[0];if(String(r.data.header?.id)!==gameId||r.data.header?.competitions?.[0]?.status?.type?.completed!==true||!Number.isFinite(Date.parse(r.retrievedAt)))throw Error('Invalid exact final receipt');responses.push(r);}
}else await Promise.all(Array.from({length:3},async()=>{while(index<fixtures.length){const gameId=fixtures[index++],url='https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event='+encodeURIComponent(gameId);try{
 const r=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('HTTP '+r.status);const data=await r.json();if(String(data.header?.id)!==gameId||data.header?.competitions?.[0]?.status?.type?.completed!==true)throw Error('Exact official final unavailable');responses.push({gameId,url,retrievedAt:new Date().toISOString(),data});
 }catch(e){failures.push({gameId,url,error:e.message})}}}));
responses.sort((a,b)=>a.gameId.localeCompare(b.gameId));
const key=g=>[g.sport,g.market,g.gameId,g.playerId].join('|'),merged=new Map(JSON.parse(raw).map(g=>[key(g),g]));
for(const r of responses)for(const g of footballModelObservations(r.data,{sport:'nfl',season:String(r.data.header.season.year),gameId:r.gameId,source:r.url,retrievedAt:r.retrievedAt},'game',0))merged.set(key(g),g);
const observations=[...merged.values()],inputs=footballMatchupIndex(observations),decisions=[],unresolved=[];
for(const r of selected){
 const g=merged.get(['nfl','passing_yards',r.gameId,r.playerId].join('|'));if(!g||!responses.some(f=>f.gameId===r.gameId)||Date.parse(g.gameTime)!==Date.parse(r.gameTime)){unresolved.push({gameId:r.gameId,playerId:r.playerId,reason:'exact_final_unavailable'});continue;}
 const at=r.probability.calculatedAt;if(Date.parse(at)-48*3600000<=Date.parse(model.calibratedThrough))throw Error('Candidate not available');const f=inputs(g,at);if(!f.features){unresolved.push({gameId:r.gameId,playerId:r.playerId,reason:f.reason});continue;}
 const projection=predictLinear(model.direct,f.features),p=outcomeProbabilities(distributionValues(model,projection),r.line),over=p.over/(p.over+p.under);
 const original=r.probability.side==='OVER'?r.probability.win/(r.probability.win+r.probability.loss):r.probability.loss/(r.probability.win+r.probability.loss),push=g.actual===r.line,outcome=Number(g.actual>r.line),side=over>.5?'OVER':over<.5?'UNDER':null;
 decisions.push({...r,actual:g.actual,projection,originalOver:original,candidateOver:over,push,originalBrier:push?null:(original-outcome)**2,candidateBrier:push?null:(over-outcome)**2,originalWon:push?null:r.probability.side==='OVER'?outcome===1:outcome===0,candidateDirection:side,candidateDirectionWon:push||!side?null:side==='OVER'?outcome===1:outcome===0});
}
const settled=decisions.filter(r=>!r.push),average=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
const summary={selected:selected.length,paired:settled.length,independentGames:new Set(settled.map(r=>r.gameId)).size,originalBrier:average(settled.map(r=>r.originalBrier)),candidateBrier:average(settled.map(r=>r.candidateBrier)),
 pairedBrierImprovement:clusteredMeanInterval(settled.map(r=>({gameId:r.gameId,value:r.originalBrier-r.candidateBrier}))),
 originalSides:['OVER','UNDER'].map(side=>{const rs=settled.filter(r=>r.probability.side===side);return {side,count:rs.length,hits:rs.filter(r=>r.originalWon).length}}),candidateDirections:['OVER','UNDER'].map(side=>{const rs=settled.filter(r=>r.candidateDirection===side);return {side,count:rs.length,hits:rs.filter(r=>r.candidateDirectionWon).length}}),unresolved,failures};
const receipts=gzipSync(JSON.stringify(responses)+'\n',{level:9});await writeFile(output+'/official-responses.json.gz',receipts);
await writeFile(output+'/evaluation.json',JSON.stringify({protocol,officialResponsesSha256:hash(receipts),summary,decisions,livePromotion:false},null,2)+'\n');console.log(JSON.stringify(summary,null,2));
