// Authentic preserved sources/prices; retrospective implementation tests only.
// Original provider timestamps and all failed model-validation policies stay intact.
import{readFileSync}from'node:fs';import{gunzipSync}from'node:zlib';import{loadTs}from'../load-ts.mjs';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url))),readGz=p=>JSON.parse(gunzipSync(readFileSync(new URL(p,import.meta.url))));
export const source=readGz('./nfl-official-finals-2026-11-24.json.gz'),boards=readGz('./nfl-nov26-recorded-rows.json.gz').boards;
export const snapshot=readGz('../../model-runtime/snapshot.json.gz'),td=readGz('../../model-runtime/nfl-passing-tds.json.gz'),manifest=read('../../model-runtime/manifest.json'),giStatus=read('../../model-runtime/gi-status.json');
const{nflFinalObservation}=await loadTs(new URL('../../lib/nfl-final-history.ts',import.meta.url)),{espnOpportunityGames}=await loadTs(new URL('../../lib/opportunity-backtest.ts',import.meta.url)),{fittedResearchForecast}=await loadTs(new URL('../../lib/live-model-forecast.ts',import.meta.url));
const fields=['passingAttempts','passingYards','passingTouchdowns','passingInterceptions','rushingAttempts','rushingYards','rushingTouchdowns','receivingTargets','receivingYards','receivingTouchdowns','receptions'],logs=new Map();
for(const[url,r]of Object.entries(source.records)){if(!url.includes('/summary?'))continue;for(const box of r.payload.boxscore.players){const team=String(box.team.id),g=nflFinalObservation(r.payload,String(r.payload.header.id),team,2026,r.observedAt);for(const[id,p]of Object.entries(g.players)){
 const k=id+'|'+team;let log=logs.get(k);if(!log){log={names:fields,events:{},seasonTypes:[{type:2,categories:[{type:'event',events:[]}]}]};logs.set(k,log);}log.events[g.gameId]={gameDate:g.gameTime,gameResult:g.result,team:{id:g.teamId},opponent:{id:g.opponentId}};log.seasonTypes[0].categories[0].events.push({eventId:g.gameId,stats:p.stats});
}}}
export function replay(market){const board=boards[market],now=Date.parse(board.updatedAt),bundle=market==='passing_tds'?td:{...snapshot,asOf:manifest.asOf};return{now,rows:board.rows.map(original=>{
 const observations=espnOpportunityGames(logs.get(original.playerId+'|'+original.teamId),{sport:'nfl',season:'2026',playerId:original.playerId,playerName:original.playerName,source:'retrospective_official_final_replay',retrievedAt:board.updatedAt});
 const researchForecast=fittedResearchForecast(original,'nfl',market,{...bundle,observations,gi:{},giStatus,digest:market==='passing_tds'?'supplemental-unmodified':manifest.sha256},now);
 return{...original,officialHistoryUnavailable:false,officialHistoryReason:null,researchForecast};})};}
