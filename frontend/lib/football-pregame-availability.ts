import {providerFetch} from '@/lib/provider-fetch';
import {availablePregameRankings} from '@/lib/ranking-availability';
/** Exact pregame report binding. A missing report never implies Out or healthy. */
export function footballPregameAvailability(rows:any[],payload:any,gameId:string,now=Date.now()){
 const header=payload?.header,competition=header?.competitions?.[0];
 const start=Date.parse(competition?.date||header?.date||'');
 const status=competition?.status?.type||header?.status?.type;
 if(String(header?.id)!==gameId||header?.competitions?.length!==1||competition?.competitors?.length!==2||status?.state!=='pre'||status?.completed===true||!Number.isFinite(start)||start<=now)return rows;
 const teams=new Set((competition.competitors||[]).map((c:any)=>String(c.team?.id||'')).filter(Boolean));
 if(teams.size!==2)return rows;
 const reports=new Map<string,any>();
 for(const group of payload?.injuries||[]){
  const team=String(group.team?.id||'');if(!teams.has(team))continue;
  for(const injury of group.injuries||[]){
   const player=String(injury.athlete?.id||injury.playerId||''),status=String(injury.status||'').trim();
   if(player&&status)reports.set(team+'|'+player,{code:'official_injury_status',text:'Reported '+status,source:'ESPN pregame report',gameId,checkedAt:new Date(now).toISOString(),...(injury.date?{reportedAt:String(injury.date)}:{})});
  }
 }
 return rows.map(row=>{
  if(row.frozen||row.boardFrozen||row.lockedAtKickoff||String(row.gameId)!==gameId||Date.parse(row.gameTime)!==start||!teams.has(String(row.teamId)))return row;
  const report=reports.get(String(row.teamId)+'|'+String(row.playerId));
  return report?{...row,availabilityEvidence:report}:row;
 });
}
/** Shared, bounded public-source reads; transport coalesces concurrent markets. */
export async function eligibleFootballPregameRows(rows:any[],sport:'nfl'|'cfb'):Promise<any[]>{
 const ids=[...new Set<string>(rows.filter(r=>!r.frozen&&!r.boardFrozen&&!r.lockedAtKickoff&&Date.parse(r.gameTime)>Date.now()).map(r=>String(r.gameId||'')).filter(id=>/^\d+$/.test(id)))];
 let enriched=rows;
 for(let i=0;i<ids.length;i+=8){
  const reports=await Promise.all(ids.slice(i,i+8).map(async id=>{
   try{const r=await providerFetch(`https://site.api.espn.com/apis/site/v2/sports/football/${sport==='nfl'?'nfl':'college-football'}/summary?event=${id}`,{signal:AbortSignal.timeout(3000)});return r.ok?{id,payload:await r.json()}:null}catch{return null}
  }));
  for(const report of reports)if(report)enriched=footballPregameAvailability(enriched,report.payload,report.id);
 }
 return availablePregameRankings({rows:enriched}).rows;
}
