import {providerFetch} from '@/lib/provider-fetch';
import {basketballRegularSeasonGroups} from '@/lib/basketball-history-window';
import {basketballModelObservations} from '@/lib/basketball-model-observations';
import type {OpportunityGame} from '@/lib/opportunity-backtest';
type Refresh={observations:OpportunityGame[];unavailablePlayers:string[];checkedAt:string};
type JsonSource=(url:string)=>Promise<any>;
const cache=new Map<string,{expires:number;value:Refresh}>();
const pending=new Map<string,Promise<Refresh>>();
async function officialJson(url:string){const r=await providerFetch(url);if(!r.ok)throw Error('Official basketball source unavailable');return r.json()}
/** Refresh the complete two-team census for recent fixtures discovered in each
 * ranked player's official log. Never infer usage from a player's points mean.
 * The research engine's existing 48-hour availability lag remains unchanged. */
export async function refreshNbaObservations(rows:any[],now=Date.now(),get:JsonSource=officialJson):Promise<Refresh>{
 const players=[...new Map<string,any>(rows.filter(r=>/^\d+$/.test(String(r.playerId))&&Date.parse(r.gameTime)>now&&!r.frozen&&!r.lockedAtKickoff&&!['in','post'].includes(r.gameState)).map(r=>[String(r.playerId),r])).values()];
 const seasonFor=(r:any)=>String(r.pregameContext?.season||r.season||'');
 const key=players.map(r=>r.playerId+'|'+seasonFor(r)).sort().join(',');
 if(!players.length)return {observations:[],unavailablePlayers:[],checkedAt:new Date(now).toISOString()};
 // Injected source readers are used by deterministic tests; never share their cache.
 if(get===officialJson){const hit=cache.get(key);if(hit&&hit.expires>now)return hit.value;if(pending.has(key))return pending.get(key)!}
 const task=(async()=>{
  const unavailable=new Set<string>(),fixtures=new Map<string,{season:string;players:Set<string>}>();
  const recent=now-21*86400000,cutoff=now-48*3600000;
  for(let i=0;i<players.length;i+=4)await Promise.all(players.slice(i,i+4).map(async row=>{
   const playerId=String(row.playerId),season=seasonFor(row);
   if(!/^\d{4}$/.test(season)){unavailable.add(playerId);return}
   try{
    const p=await get(`https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${playerId}/gamelog?season=${season}`);
    if(!Array.isArray(p?.seasonTypes)||!p.events||typeof p.events!=='object')throw Error('Missing official gamelog');
    for(const group of basketballRegularSeasonGroups(p))for(const category of group.categories||[])if(category.type==='event')for(const event of category.events||[]){
     const id=String(event.eventId||''),meta=p.events[id],time=Date.parse(meta?.gameDate||'');
     if(!/^\d+$/.test(id)||!Number.isFinite(time)||time<recent||time>=cutoff||!['W','L'].includes(String(meta?.gameResult||'')))continue;
     const fixture=fixtures.get(id)||{season,players:new Set<string>()};
     if(fixture.season!==season)throw Error('Conflicting fixture seasons');
     fixture.players.add(playerId);fixtures.set(id,fixture);
    }
   }catch{unavailable.add(playerId)}
  }));
  const observations:OpportunityGame[]=[];
  const jobs=[...fixtures];
  // A bounded request must abstain for omitted evidence, not silently call it fresh.
  for(const [,fixture] of jobs.slice(64))for(const id of fixture.players)unavailable.add(id);
  for(let i=0;i<Math.min(jobs.length,64);i+=4)await Promise.all(jobs.slice(i,Math.min(i+4,64)).map(async([gameId,fixture])=>{
   const source=`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${gameId}`;
   try{
    const p=await get(source),parsed=basketballModelObservations(p,{sport:'nba',season:fixture.season,gameId,source,retrievedAt:new Date(now).toISOString()});
    if(!parsed.length||[...fixture.players].some(id=>!parsed.some(r=>r.playerId===id)))throw Error('Incomplete official fixture census');
    observations.push(...parsed);
   }catch{for(const id of fixture.players)unavailable.add(id)}
  }));
  const value={observations,unavailablePlayers:[...unavailable].sort(),checkedAt:new Date(now).toISOString()};
  if(get===officialJson){if(cache.size>=32)cache.delete(cache.keys().next().value!);cache.set(key,{expires:now+(unavailable.size?30_000:15*60_000),value})}
  return value;
 })();
 if(get===officialJson)pending.set(key,task);
 try{return await task}finally{if(get===officialJson)pending.delete(key)}
}
