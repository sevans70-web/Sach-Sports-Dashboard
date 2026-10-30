import {providerFetch} from '@/lib/provider-fetch';
import {basketballQuarterObservations} from '@/lib/basketball-quarter-observations';
import {footballModelObservations} from '@/lib/football-model-observations';
import {basketballRegularSeasonGroups} from '@/lib/basketball-history-window';
import type {QuarterObservation} from '@/lib/quarter-forecast';
type Source=(url:string)=>Promise<any>;
const sources=new Map<string,{until:number;data:any}>(),pending=new Map<string,Promise<any>>();
async function official(url:string){
 const hit=sources.get(url);if(hit&&hit.until>Date.now())return hit.data;
 if(pending.has(url))return pending.get(url)!;
 const task=(async()=>{const r=await providerFetch(url);if(!r.ok)throw Error('Official quarter source unavailable');const data=await r.json();if(sources.size>=256)sources.delete(sources.keys().next().value!);sources.set(url,{until:Date.now()+15*60000,data});return data})().finally(()=>pending.delete(url));pending.set(url,task);return task;
}
/** Share official fixture reads across markets. Only completed prior fixtures
 * older than 48h may refresh inputs. No current/future result is a feature. */
export async function refreshQuarterObservations(rows:any[],sport:'nba'|'nfl',now=Date.now(),get:Source=official){
 const players=[...new Map<string,any>(rows.filter(r=>/^\d+$/.test(String(r.playerId))&&Date.parse(r.gameTime)>now&&!r.frozen&&!r.boardFrozen&&!r.lockedAtKickoff&&!['in','post'].includes(r.gameState)).map(r=>[String(r.playerId),r])).values()];
 const unavailable=new Set<string>(),latest=new Map<string,string>(),fixtures=new Map<string,{season:string;players:Set<string>}>();
 const route=sport==='nba'?'basketball/nba':'football/nfl';
 for(let i=0;i<players.length;i+=4)await Promise.all(players.slice(i,i+4).map(async row=>{
  const id=String(row.playerId),season=String(row.pregameContext?.season||row.season||'');
  if(!/^\d{4}$/.test(season)){unavailable.add(id);return}
  try{
   const log=await get(`https://site.web.api.espn.com/apis/common/v3/sports/${route}/athletes/${id}/gamelog?season=${season}`);
   if(!Array.isArray(log?.seasonTypes)||!log.events)throw Error('Incomplete official log');
   const groups=sport==='nba'?basketballRegularSeasonGroups(log):log.seasonTypes.filter((g:any)=>Number(g.type)===2||/regular season/i.test(String(g.displayName||'')));
   const events=groups.flatMap((g:any)=>(g.categories||[]).filter((c:any)=>c.type==='event').flatMap((c:any)=>c.events||[])).map((e:any)=>({id:String(e.eventId||''),meta:log.events[e.eventId]})).filter((e:any)=>/^\d+$/.test(e.id)&&['W','L','T'].includes(String(e.meta?.gameResult))&&Date.parse(e.meta?.gameDate)<now-48*3600000&&Date.parse(e.meta?.gameDate)>now-366*86400000).sort((a:any,b:any)=>String(b.meta.gameDate).localeCompare(String(a.meta.gameDate))).slice(0,10);
   if(events[0])latest.set(id,events[0].id);
   for(const event of events){const f=fixtures.get(event.id)||{season,players:new Set<string>()};if(f.season!==season)throw Error('Conflicting fixture season');f.players.add(id);fixtures.set(event.id,f)}
  }catch{unavailable.add(id)}
 }));
 const jobs=[...fixtures],observations:QuarterObservation[]=[];
 for(const [,f] of jobs.slice(64))for(const id of f.players)unavailable.add(id);
 for(let i=0;i<Math.min(jobs.length,64);i+=4)await Promise.all(jobs.slice(i,Math.min(i+4,64)).map(async([gameId,f])=>{
  const url=`https://site.api.espn.com/apis/site/v2/sports/${route}/summary?event=${gameId}`;
  try{
   const p=await get(url),at=new Date(now).toISOString();
   if(String(p.header?.season?.year)!==f.season)throw Error('Wrong official season');
   const parsed:QuarterObservation[]=sport==='nba'?basketballQuarterObservations(p,gameId,url,at):footballModelObservations(p,{sport:'nfl',season:f.season,gameId,source:url,retrievedAt:at},'q1').map(g=>({...g,role:g.roleWorkload!}));
   for(const id of f.players)if(latest.get(id)===gameId&&!parsed.some(g=>g.playerId===id&&g.market===players.find(r=>String(r.playerId)===id)?.market))unavailable.add(id);
   observations.push(...parsed);
  }catch{for(const id of f.players)if(latest.get(id)===gameId)unavailable.add(id)}
 }));
 return {observations,unavailablePlayers:[...unavailable],checkedAt:new Date(now).toISOString()};
}
