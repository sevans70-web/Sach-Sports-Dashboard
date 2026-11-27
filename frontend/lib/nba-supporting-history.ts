import type {OpportunityGame} from '@/lib/opportunity-backtest';

const markets=new Set(['points','rebounds','assists','threes_made','pts_rebs_asts','pts_rebs','pts_asts']);
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const mean=(xs:number[])=>xs.reduce((a,b)=>a+b,0)/xs.length;
const close=(a:number,b:number)=>Math.abs(a-b)<1e-8;
// ESPN's existing NBA team identities; statistics always retain the source ID.
const abbreviations:Record<string,string>=Object.fromEntries('ATL BOS NOP CHI CLE DAL DEN DET GSW HOU IND LAC LAL MIA MIL MIN BKN NYK ORL PHI PHX POR SAC SAS OKC UTA WAS TOR MEM CHA'.split(' ').map((abbr,i)=>[String(i+1),abbr]));
/** Read-only evidence from the SAME observation set used to fit this forecast.
 * No provider calls, synthetic results, historical receipt backfills or changes
 * to model calculations. The final ten games obey basketballFeatureIndex's
 * team/season/window/48-hour availability rules, including explicit zeroes. */
export function nbaSupportingHistory(row:any,market:string,observations:OpportunityGame[],receipt:any){
 if(!markets.has(market)||receipt?.group!=='nba|'+market)return null;
 const decision=Date.parse(receipt.decisionAt),start=Date.parse(row.gameTime),season=Number(row.pregameContext?.season||row.season);
 if(!Number.isFinite(decision)||decision>=start)return null;
 const selected=observations.filter(g=>g.sport==='nba'&&g.market===market&&g.playerId===String(row.playerId)&&g.teamId===String(row.teamId)&&g.basketballContext&&
  Date.parse(g.gameTime)<decision-48*3600000&&Date.parse(g.gameTime)>start-366*86400000&&Number(g.season)<=season&&Number(g.season)>=season-1)
  .sort((a,b)=>a.gameTime.localeCompare(b.gameTime)).slice(-20);
 if(new Set(selected.map(g=>g.gameId)).size!==selected.length)return null;
 const last=selected.slice(-10),modelIds=new Set(last.map(g=>g.gameId));
 const history={version:1,playerId:String(row.playerId),teamId:String(row.teamId),gameId:String(row.gameId),gameTime:row.gameTime,market,
  inputReceiptSha256:receipt.sha256,decisionAt:receipt.decisionAt,availabilityLagHours:48,modelGameIds:last.map(g=>g.gameId),
  points:selected.map(g=>({gameId:g.gameId,date:g.gameTime,season:Number(g.season),opponent:abbreviations[g.opponentId]||'Team '+g.opponentId,opponentAbbr:abbreviations[g.opponentId]||'',opponentId:g.opponentId,
   atVs:g.basketballContext!.home?'vs':'@',value:g.actual,minutes:g.workload,fieldGoalAttempts:g.basketballContext!.fieldGoalAttempts,
   freeThrowAttempts:g.basketballContext!.freeThrowAttempts,source:g.source,retrievedAt:g.retrievedAt,usedInProjection:modelIds.has(g.gameId)}))};
 return validatedNbaSupportingHistory({...row,researchForecast:{inputReceipt:receipt,supportingHistory:history}},market)?history:null;
}

/** Client-safe identity and feature-vector cross-check. Reject unrelated or
 * stale cached chart data rather than describing it as the forecast's inputs. */
export function validatedNbaSupportingHistory(row:any,market:string){
 const f=row?.researchForecast,h=f?.supportingHistory,r=f?.inputReceipt;
 if(!markets.has(market)||h?.version!==1||!(/^[a-f0-9]{64}$/.test(r?.sha256||''))||h.inputReceiptSha256!==r.sha256||r.group!=='nba|'+market||h.market!==market||
  h.playerId!==String(row.playerId)||h.teamId!==String(row.teamId)||h.gameId!==String(row.gameId)||Date.parse(h.gameTime)!==Date.parse(row.gameTime)||h.decisionAt!==r.decisionAt||h.availabilityLagHours!==48)return null;
 const start=Date.parse(row.gameTime),decision=Date.parse(r.decisionAt),season=Number(row.pregameContext?.season||row.season);
 if(!Number.isFinite(decision)||decision>=start||!Array.isArray(h.points)||h.points.length<5||h.points.length>20||!Array.isArray(h.modelGameIds))return null;
 let previous=-Infinity;const ids=new Set<string>();
 for(const p of h.points){if(!p||typeof p!=='object')return null;const time=Date.parse(p.date),retrieved=Date.parse(p.retrievedAt);
  if(!p.gameId||ids.has(p.gameId)||time<previous||!Number.isFinite(time)||time>=decision-48*3600000||time<=start-366*86400000||
   // The existing decision clock is taken when the request starts; a fresh
   // source may arrive milliseconds later. Retain its TRUE receipt time and
   // require it to precede the target game, without restamping the forecast.
   !Number.isFinite(retrieved)||retrieved>=start||!p.source||!p.opponentId||!finite(p.value)||p.value<0||!finite(p.minutes)||p.minutes<0||
   !finite(p.fieldGoalAttempts)||p.fieldGoalAttempts<0||!finite(p.freeThrowAttempts)||p.freeThrowAttempts<0||!Number.isInteger(season)||!Number.isInteger(p.season)||p.season>season||p.season<season-1)return null;
  previous=time;ids.add(p.gameId);
 }
 const last=h.points.slice(-10),recent=last.slice(-3),features=r.features;
 if(!Array.isArray(features)||features.length!==24||!features.every(finite)||JSON.stringify(h.modelGameIds)!==JSON.stringify(last.map((p:any)=>p.gameId))||
  h.points.some((p:any)=>p.usedInProjection!==h.modelGameIds.includes(p.gameId)))return null;
 if(!close(mean(recent.map((p:any)=>p.minutes)),features[0])||!close(mean(last.map((p:any)=>p.minutes)),features[1])||!close(last.at(-1)!.minutes,features[2])||
  !close(mean(recent.map((p:any)=>p.value)),features[14])||!close(mean(last.map((p:any)=>p.value)),features[15]))return null;
 return {success:true,supported:true,points:h.points,inputReceiptSha256:r.sha256,modelGameIds:h.modelGameIds,
  message:'Official model-input history; a 48-hour availability lag applies. Up to ten eligible team appearances feed the model.'};
}
