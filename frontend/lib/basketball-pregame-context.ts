import {createHash} from 'node:crypto';
import {providerFetch} from '@/lib/provider-fetch';

type Sport='nba'|'wnba'|'cbb';
const routes={nba:'nba',wnba:'wnba',cbb:'mens-college-basketball'};
const text=(x:unknown)=>typeof x==='string'||typeof x==='number'?String(x):'';
const list=(x:any):any[]=>Array.isArray(x)?x:[];
export type BasketballPregameContext={
 version:1;sport:Sport;gameId:string;gameTime:string;season:string|null;retrievedAt:string;
 sourceUrl:string;sourceSha256:string;providerUpdatedAt:null;
 teams:{teamId:string;opponentId:string;homeAway:string;injurySectionPresent:boolean;
  reportedInjuries:{playerId:string;status:string;note:string;reportedAt:string|null}[];
  confirmedStarterIds:string[]}[];
};

/** Current source observation only. No post-tipoff data can become pregame
 * evidence, and an absent injury entry never establishes healthy/available. */
export function basketballPregameContext(payload:any,sport:Sport,gameId:string,retrievedAt:string):BasketballPregameContext|null{
 if(!Object.hasOwn(routes,sport))return null;
 const header=payload?.header,competitions=list(header?.competitions);
 if(text(header?.id)!==gameId||competitions.length!==1)return null;
 const competition=competitions[0],gameTime=text(competition.date||header.date);
 const at=Date.parse(retrievedAt),start=Date.parse(gameTime),status=competition.status?.type||header.status?.type;
 if(!Number.isFinite(at)||!Number.isFinite(start)||at>=start||status?.state!=='pre'||status?.completed===true)return null;
 const sides=list(competition.competitors),ids=sides.map(c=>text(c.team?.id));
 if(sides.length!==2||ids.some(id=>!id)||new Set(ids).size!==2)return null;
 const teams=sides.map((side,index)=>{
  const teamId=ids[index],injuries=list(payload.injuries).filter(g=>text(g.team?.id)===teamId);
  const reportedInjuries=injuries.flatMap(g=>list(g.injuries).flatMap(row=>{
   const playerId=text(row.athlete?.id),status=text(row.status||row.athlete?.status?.type);
   if(!playerId||!status)return [];
   return [{playerId,status,note:text(row.shortComment||row.longComment||row.details?.detail||row.details?.type).slice(0,600),reportedAt:text(row.date)||null}];
  }));
  const starters=list(payload.boxscore?.players).filter(g=>text(g.team?.id)===teamId)
   .flatMap(g=>list(g.statistics).flatMap(s=>list(s.athletes)))
   .filter(a=>a.starter===true&&a.didNotPlay!==true).map(a=>text(a.athlete?.id)).filter(Boolean);
  return {teamId,opponentId:ids[1-index],homeAway:text(side.homeAway),injurySectionPresent:injuries.length>0,
   reportedInjuries,confirmedStarterIds:[...new Set(starters)].sort()};
 });
 return {version:1,sport,gameId,gameTime,season:text(header.season?.year)||null,retrievedAt,
  sourceUrl:`https://site.api.espn.com/apis/site/v2/sports/basketball/${routes[sport]}/summary?event=${encodeURIComponent(gameId)}`,
  sourceSha256:createHash('sha256').update(JSON.stringify(payload)).digest('hex'),providerUpdatedAt:null,teams};
}

/** Exact fixture/player/team projection of source evidence; no workload estimate
 * is filled from a season mean or inferred from roster membership. */
export function playerPregameContext(context:BasketballPregameContext|null,row:any){
 if(!context||text(row.gameId)!==context.gameId||Date.parse(row.gameTime)!==Date.parse(context.gameTime))return null;
 const team=context.teams.find(t=>t.teamId===text(row.teamId));
 if(!team||!text(row.playerId))return null;
 const availability=team.reportedInjuries.filter(i=>i.playerId===text(row.playerId));
 return {version:1,sport:context.sport,gameId:context.gameId,playerId:text(row.playerId),teamId:team.teamId,
  opponentId:team.opponentId,gameTime:context.gameTime,season:context.season,retrievedAt:context.retrievedAt,
  sourceUrl:context.sourceUrl,sourceSha256:context.sourceSha256,providerUpdatedAt:null,
  starterConfirmed:team.confirmedStarterIds.includes(text(row.playerId)),availability,
  availabilityConfirmed:false,injurySectionPresent:team.injurySectionPresent,
  teammateInjuryReports:team.reportedInjuries.filter(i=>i.playerId!==text(row.playerId)),
  expectedMinutes:null,usage:null,rotationShare:null,
  missingInputs:['expected_minutes','usage','rotation_share','opponent_context','complete_availability'],
  usableForValidatedForecast:false};
}

const cache=new Map<string,{expires:number;value:BasketballPregameContext|null}>();
const pending=new Map<string,Promise<BasketballPregameContext|null>>();
async function loadContext(sport:Sport,gameId:string){
 const key=sport+'|'+gameId,hit=cache.get(key);
 if(hit&&hit.expires>Date.now())return hit.value&&Date.parse(hit.value.gameTime)>Date.now()?hit.value:null;
 if(pending.has(key))return pending.get(key)!;
 const task=(async()=>{
  try{
   const response=await providerFetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/${routes[sport]}/summary?event=${encodeURIComponent(gameId)}`);
   if(!response.ok)return null;
   const payload=await response.json(),value=basketballPregameContext(payload,sport,gameId,new Date().toISOString());
   if(cache.size>=64)cache.delete(cache.keys().next().value!);
   cache.set(key,{expires:Date.now()+30_000,value});return value;
  }catch{return null}
 })();pending.set(key,task);try{return await task}finally{pending.delete(key)}
}
export async function attachBasketballPregameContext(payload:any,sport:Sport){
 if(!Array.isArray(payload?.rows))return payload;
 const ids=[...new Set<string>(payload.rows.filter((r:any)=>r.gameState==='pre'&&Date.parse(r.gameTime)>Date.now()).map((r:any)=>text(r.gameId)).filter(Boolean))];
 const contexts=new Map<string,BasketballPregameContext|null>();
 for(let i=0;i<ids.length;i+=4){const batch=ids.slice(i,i+4);await Promise.all(batch.map(async id=>contexts.set(id,await loadContext(sport,id))));}
 const rows=payload.rows.map((row:any)=>{
  const context=playerPregameContext(contexts.get(text(row.gameId))||null,row),report=context?.availability[0];
  return {...row,pregameContext:context,...(context?{lineupConfirmed:context.starterConfirmed,starterConfirmed:context.starterConfirmed,
   availabilityEvidence:report?{code:'official_injury_status',text:`Reported ${report.status}${report.note?' · '+report.note:''}`,
    source:'ESPN pregame report',checkedAt:context.retrievedAt,gameId:context.gameId}:undefined}:{})};
 });
 return {...payload,rows,pregameContextCount:rows.filter((row:any)=>row.pregameContext!=null).length};
}
