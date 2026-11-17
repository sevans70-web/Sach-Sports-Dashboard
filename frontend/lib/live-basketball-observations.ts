import {boundedValueCache} from '@/lib/bounded-value-cache';
import {nbaSourceFetch} from '@/lib/nba-source-fetch';
import {providerFetch} from '@/lib/provider-fetch';
import {basketballRegularSeasonGroups} from '@/lib/basketball-history-window';
import {basketballModelObservations} from '@/lib/basketball-model-observations';
import type {OpportunityGame} from '@/lib/opportunity-backtest';
import {configuredNbaEvidence} from '@/lib/nba-durable-history';
import {readNbaHistorySource,rethrowNbaEvidenceCancellation,type NbaEvidenceAccess} from '@/lib/nba-history-evidence';
import {assertNbaRankingActive} from '@/lib/nba-ranking-work';
import {dashboardJobContext} from '@/lib/dashboard-job-context';
type SourceReceipt={payload:any;observedAt:string};
type EvidenceReference={source:string;sha256:string;observedAt:string;lastVerifiedAt:string;recovered:boolean};
type Refresh={observations:OpportunityGame[];unavailablePlayers:string[];checkedAt:string;sourceEvidence?:EvidenceReference[];sourceBudget?:{attempted:number;limit:number|null;exhausted:boolean}};
// At most two subrequests per foreground source (durable read + HTTP),
// leaving94 of the Worker's350 for schedules, rosters, odds and history.
const NBA_FOREGROUND_SOURCE_LIMIT=128;
type JsonSource=(url:string)=>Promise<any>;
const cache=boundedValueCache<Refresh>(4*1024*1024,4);
const pending=new Map<string,Promise<Refresh>>();
const sourceCache=boundedValueCache<SourceReceipt>(8*1024*1024,96),sourcePending=new Map<string,Promise<SourceReceipt>>();
async function officialRead(url:string){
 const hit=sourceCache.get(url);if(hit)return hit;
 let work=sourcePending.get(url);if(!work){work=(async()=>{const r=await (url.includes('/basketball/nba/')?nbaSourceFetch(url):providerFetch(url));if(!r.ok)throw Error('Official basketball source unavailable');const value=await r.json();const payload=url.includes('/summary?')?{header:value.header,boxscore:{players:value.boxscore?.players}}:value;const stamp=r.headers.get('x-sach-observed-at'),receipt={payload,observedAt:stamp&&Number.isFinite(Date.parse(stamp))?stamp:new Date().toISOString()};sourceCache.set(url,receipt,15*60000);return receipt;})().finally(()=>sourcePending.delete(url));sourcePending.set(url,work)}return work;
}
async function officialJson(url:string){return (await officialRead(url)).payload;}
/** Refresh the complete two-team census for recent fixtures discovered in each
 * ranked player's official log. Never infer usage from a player's points mean.
 * The research engine's existing 48-hour availability lag remains unchanged. */
export async function refreshBasketballObservations(sport:'nba'|'cbb',rows:any[],now=Date.now(),get:JsonSource=officialJson,options:{evidence?:NbaEvidenceAccess}={}):Promise<Refresh>{
 const league=sport==='cbb'?'mens-college-basketball':'nba';
 const players=[...new Map<string,any>(rows.filter(r=>/^\d+$/.test(String(r.playerId))&&Date.parse(r.gameTime)>now&&!r.frozen&&!r.lockedAtKickoff&&!['in','post'].includes(r.gameState)).map(r=>[String(r.playerId),r])).values()];
 const seasonFor=(r:any)=>String(r.pregameContext?.season||r.season||'');
 const key=sport+'|'+players.map(r=>r.playerId+'|'+seasonFor(r)).sort().join(',');
 if(!players.length)return {observations:[],unavailablePlayers:[],checkedAt:new Date(now).toISOString()};
 const evidence=sport==='nba'?(options.evidence||(get===officialJson?configuredNbaEvidence():undefined)):undefined;
 // Injected source readers are used by deterministic tests; never share their cache.
 if(get===officialJson&&!options.evidence&&!evidence?.write){const hit=cache.get(key);if(hit)return hit;if(pending.has(key))return pending.get(key)!}
 const task=(async()=>{
  const sourceEvidence:EvidenceReference[]=[];
  const requestedSources=new Set<string>();let sourceBudgetExhausted=false;
  const resumableNbaCapture=sport==='nba'&&Boolean(dashboardJobContext()?.writeNbaEvidence);
  const read=async(source:string)=>{
   if(sport==='nba')assertNbaRankingActive();
   if(sport==='nba'&&!requestedSources.has(source)){
    if(!resumableNbaCapture&&requestedSources.size>=NBA_FOREGROUND_SOURCE_LIMIT){sourceBudgetExhausted=true;throw Error('nba_history_source_budget');}
    requestedSources.add(source);
   }
   if(!evidence)return {payload:await get(source),observedAt:new Date(now).toISOString()};
   const loaded=await readNbaHistorySource(source,now,()=>get===officialJson?officialRead(source):get(source).then(payload=>({payload,observedAt:new Date(now).toISOString()})),evidence);
   if(sport==='nba')assertNbaRankingActive();
   sourceEvidence.push({source,sha256:loaded.evidence.sha256,observedAt:loaded.evidence.observedAt,lastVerifiedAt:loaded.evidence.lastVerifiedAt,recovered:loaded.recovered});
   return {payload:loaded.evidence.payload,observedAt:loaded.evidence.observedAt};
  };
  const unavailable=new Set<string>(),fixtures=new Map<string,{season:string;players:Set<string>}>();
  let gamelogFailures=0,fixtureFailures=0;
  const recent=now-21*86400000,cutoff=now-48*3600000;
  for(let i=0;i<players.length;i+=4)await Promise.all(players.slice(i,i+4).map(async row=>{
   const playerId=String(row.playerId),season=seasonFor(row);
   if(!/^\d{4}$/.test(season)){unavailable.add(playerId);return}
   try{
    const {payload:p}=await read(`https://site.web.api.espn.com/apis/common/v3/sports/basketball/${league}/athletes/${playerId}/gamelog?season=${season}`);
    if(!Array.isArray(p?.seasonTypes)||!p.events||typeof p.events!=='object')throw Error('Missing official gamelog');
    for(const group of basketballRegularSeasonGroups(p))for(const category of group.categories||[])if(category.type==='event')for(const event of category.events||[]){
     const id=String(event.eventId||''),meta=p.events[id],time=Date.parse(meta?.gameDate||'');
     if(!/^\d+$/.test(id)||!Number.isFinite(time)||time<recent||time>=cutoff||!['W','L'].includes(String(meta?.gameResult||'')))continue;
     const fixture=fixtures.get(id)||{season,players:new Set<string>()};
     if(fixture.season!==season)throw Error('Conflicting fixture seasons');
     fixture.players.add(playerId);fixtures.set(id,fixture);
    }
   }catch(error){if(sport==='nba')rethrowNbaEvidenceCancellation(error);gamelogFailures++;unavailable.add(playerId)}
  }));
  const observations:OpportunityGame[]=[];
  const jobs=[...fixtures];
  // NBA capture's existing request/deadline guard checkpoints and resumes the
  // full census. A fixed fixture slice would omit the same game on every run.
  // Foreground has the separate bounded source budget above. College retains
  // its existing policy; no unrelated model or collection behavior changes.
  const fixtureLimit=sport==='nba'?jobs.length:Math.min(jobs.length,64);
  for(const [,fixture] of jobs.slice(fixtureLimit))for(const id of fixture.players)unavailable.add(id);
  for(let i=0;i<fixtureLimit;i+=4)await Promise.all(jobs.slice(i,Math.min(i+4,fixtureLimit)).map(async([gameId,fixture])=>{
   const source=`https://site.api.espn.com/apis/site/v2/sports/basketball/${league}/summary?event=${gameId}`;
   try{
    const receipt=await read(source),parsed=basketballModelObservations(receipt.payload,{sport,season:fixture.season,gameId,source,retrievedAt:receipt.observedAt});
    if(!parsed.length||[...fixture.players].some(id=>!parsed.some(r=>r.playerId===id)))throw Error('Incomplete official fixture census');
    observations.push(...parsed);
   }catch(error){if(sport==='nba')rethrowNbaEvidenceCancellation(error);fixtureFailures++;for(const id of fixture.players)unavailable.add(id)}
  }));
  console.info('[basketball refresh audit]',JSON.stringify({sport,players:players.length,discoveredFixtures:jobs.length,omittedFixtures:jobs.length-fixtureLimit,gamelogFailures,fixtureFailures,unavailablePlayers:unavailable.size,observations:observations.length,sourceBudgetExhausted}));
  const value={observations,unavailablePlayers:[...unavailable].sort(),checkedAt:new Date(now).toISOString(),...(sport==='nba'?{sourceBudget:{attempted:requestedSources.size,limit:resumableNbaCapture?null:NBA_FOREGROUND_SOURCE_LIMIT,exhausted:sourceBudgetExhausted}}:{}),...(evidence?{sourceEvidence:sourceEvidence.sort((a,b)=>a.source.localeCompare(b.source))}:{})};
  if(get===officialJson&&!options.evidence){cache.set(key,value,unavailable.size?30_000:15*60_000,now)}
  return value;
 })();
 if(get===officialJson)pending.set(key,task);
 try{return await task}finally{if(get===officialJson)pending.delete(key)}
}

export function refreshNbaObservations(rows:any[],now=Date.now(),get:JsonSource=officialJson,options:{evidence?:NbaEvidenceAccess}={}){return refreshBasketballObservations('nba',rows,now,get,options)}
export function refreshCbbObservations(rows:any[],now=Date.now(),get:JsonSource=officialJson){return refreshBasketballObservations('cbb',rows,now,get)}
