import {readFile,writeFile,mkdir} from 'node:fs/promises';import {gunzipSync,gzipSync} from 'node:zlib';import {resolve} from 'node:path';import {createHash} from 'node:crypto';import {loadTs} from '../tests/load-ts.mjs';
const {probabilityInputs,predictLinear,distributionValues,outcomeProbabilities,quoteProblem}=await loadTs(new URL('../lib/probability-forecast.ts',import.meta.url));
const F=resolve(import.meta.dirname,'..'),D=resolve(F,'model-research/cw08-nhl-v3'),W=resolve(F,'../work/cw08-v3'),hash=b=>createHash('sha256').update(b).digest('hex');await mkdir(W,{recursive:true});
const read=async p=>JSON.parse(await readFile(p,'utf8')),gz=async p=>JSON.parse(gunzipSync(await readFile(p)));
const old=await gz(resolve(F,'model-research/cw08-nhl-expanded/player-games.json.gz')),recent=await gz(D+'/november-records.json.gz'),models=await read(D+'/models.json'),original=new Set((await read(resolve(F,'model-research/cw08-nhl-expanded/feature-receipt.json'))).originalPlayers);
const finals=await gz(D+'/official-finals.json.gz'),officialGames=new Map(finals.flatMap(r=>r.payload.games||[]).map(g=>[String(g.id),g]));
const records=[...old,...recent],byKey=new Map(records.map(r=>[[r.gameId,r.playerId].join('|'),r])),players=new Map();for(const r of records){const k=String(r.playerId);if(!players.has(k))players.set(k,[]);players.get(k).push(r);}for(const h of players.values())h.sort((a,b)=>a.gameDate.localeCompare(b.gameDate));
const runtime=await gz(resolve(F,'model-runtime/snapshot.json.gz')),output=[],rejections=[];
function augment(x,player,market,decisionAt){const m=models[market],p=m.skillPrior,cutoff=Date.parse(decisionAt)-48*3600000,h=(players.get(player)||[]).filter(r=>Date.parse(r.gameDate)<cutoff).slice(-60),q=(h.filter(r=>r[market]>0).length+20*p.event)/(h.length+20),rate=(h.reduce((s,r)=>s+r[market],0)+20*p.minutes*p.rate)/(h.reduce((s,r)=>s+r.timeOnIcePerGame/60,0)+20*p.minutes);return [...x,Math.log(q/(1-q)),Math.log(rate),x[0]*rate,Math.log1p(h.length)];}
function evaluate(r,market,gameTime,decisionAt){
 const history=(players.get(String(r.playerId))||[]).map(g=>({sport:'nhl',market,season:g.season,playerId:String(g.playerId),teamId:g.teamAbbrev,opponentId:g.opponentTeamAbbrev,gameId:String(g.gameId),gameTime:g.gameDate+'T00:00:00.000Z',actual:g[market],workload:g.timeOnIcePerGame/60}));
 const target={sport:'nhl',market,season:r.season,playerId:String(r.playerId),teamId:r.teamAbbrev,opponentId:r.opponentTeamAbbrev,gameId:String(r.gameId),gameTime};
 const input=probabilityInputs(history,target,decisionAt);if(!input.features)return {reason:input.reason};
 const model=runtime.models.find(m=>m.group==='nhl|'+market),x=input.features,mu=Math.max(0,Math.max(0,predictLinear(model.workload,x))*predictLinear(model.rate,x));
 return {target,x,features:augment(x,String(r.playerId),market,decisionAt),legacyMean:mu,legacyValues:distributionValues(model,mu)};
}
const previous=await gz(resolve(F,'../work/cw08-nhl-expanded/features.json.gz'));
for(const r of previous.filter(r=>r.season==='20252026'))output.push({...r,kind:'inspected_diagnostic',features:augment(r.x,r.player,r.market,r.date+'T00:00:00.000Z')});
for(const r of recent.filter(r=>r.gameDate<='2026-11-08'))for(const market of ['goals','assists']){
 const official=officialGames.get(String(r.gameId));if(!official||!['OFF','FINAL'].includes(official.gameState))throw Error('Fresh evaluation final not verified');
 const at=r.gameDate+'T00:00:00.000Z',f=evaluate(r,market,at,at);if(f.reason){rejections.push({kind:'fresh',game:r.gameId,player:r.playerId,market,reason:f.reason});continue;}
 output.push({kind:'fresh',market,game:String(r.gameId),player:String(r.playerId),date:r.gameDate,y:r[market],x:f.x,features:f.features,legacyMean:f.legacyMean,legacyP05:outcomeProbabilities(f.legacyValues,.5).over,originalPlayer:original.has(String(r.playerId))});
}
const archive=await read(D+'/archived-quotes.json');
for(const a of archive.rows){
 const p=a.payload,r=byKey.get([a.game_id,a.player_id].join('|'));if(a.game_date>'2026-11-12'||!r){rejections.push({kind:'priced_diagnostic',game:a.game_id,player:a.player_id,market:a.market,reason:'final_record_not_available'});continue;}
 const official=officialGames.get(a.game_id);if(!official||!['OFF','FINAL'].includes(official.gameState)||Date.parse(official.startTimeUTC)!==Date.parse(p.gameTime))throw Error('Archived quote fixture final/time mismatch');
 const q={sport:'nhl',market:a.market,period:p.quote.quotePeriod,gameId:a.game_id,playerId:a.player_id,bookmaker:p.quote.sportsbookKey,quoteId:p.quote.quoteId,line:p.quote.line,overPrice:p.quote.overPrice,underPrice:p.quote.underPrice,updatedAt:p.quote.quoteUpdatedAt,capturedAt:p.capturedAt,decisionAt:p.capturedAt,mainLine:p.quote.lineType==='main'};
 const target={sport:'nhl',market:a.market,gameId:a.game_id,playerId:a.player_id,gameTime:p.gameTime};let reason=quoteProblem(q,target);if(p.quote.quoteMarket!==a.market)reason='wrong_quote_market';if(p.teamName!==r.teamAbbrev)reason='official_team_mismatch';if(reason){rejections.push({kind:'priced_diagnostic',game:a.game_id,player:a.player_id,market:a.market,reason});continue;}
 const f=evaluate(r,a.market,p.gameTime,p.capturedAt);if(f.reason){rejections.push({kind:'priced_diagnostic',game:a.game_id,player:a.player_id,market:a.market,reason:f.reason});continue;}
 const probs=outcomeProbabilities(f.legacyValues,q.line);
 output.push({kind:'priced_diagnostic',market:a.market,game:a.game_id,player:a.player_id,date:a.game_date,y:r[a.market],x:f.x,features:f.features,quote:q,sourceOriginalChecksum:a.checksum,legacyMean:f.legacyMean,legacyP05:probs.over,legacyProbabilities:probs,originalPlayer:original.has(a.player_id)});
}
const bytes=gzipSync(JSON.stringify(output));await writeFile(W+'/evaluation-inputs.json.gz',bytes);await writeFile(D+'/evaluation-input-receipt.json',JSON.stringify({candidateFrozenCommit:'007c02b',modelsSha256:hash(await readFile(D+'/models.json')),inputSha256:hash(bytes),kinds:output.reduce((c,r)=>(c[r.kind]=(c[r.kind]||0)+1,c),{}),rejections},null,2)+'\n');console.log(output.length,'rows',rejections.length,'rejections');
