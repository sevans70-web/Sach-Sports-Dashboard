import {nbaTeamScheduleSource,validatedNbaTeamSchedule} from '@/lib/nba-team-schedule';
import {boundedValueCache} from '@/lib/bounded-value-cache';
import {nbaSourceFetch} from '@/lib/nba-source-fetch';
import {providerFetch} from '@/lib/provider-fetch';
import {basketballRegularSeasonGroups} from '@/lib/basketball-history-window';
import {basketballModelObservations} from '@/lib/basketball-model-observations';
import type {OpportunityGame} from '@/lib/opportunity-backtest';
import {configuredNbaEvidence} from '@/lib/nba-durable-history';
import {readNbaHistorySource,rethrowNbaEvidenceCancellation,checkedNbaHistoryEvidence,NBA_DISCOVERY_FRESH_MS,type NbaEvidenceAccess} from '@/lib/nba-history-evidence';
import {assertNbaRankingActive} from '@/lib/nba-ranking-work';
import {dashboardJobContext} from '@/lib/dashboard-job-context';
type SourceReceipt={payload:any;observedAt:string;lastVerifiedAt?:string};
type EvidenceReference={source:string;sha256:string;observedAt:string;lastVerifiedAt:string;recovered:boolean};
type Refresh={observations:OpportunityGame[];unavailablePlayers:string[];checkedAt:string;sourceEvidence?:EvidenceReference[];sourceBudget?:{attempted:number;limit:number|null;exhausted:boolean};discoveryRecovery?:{deniedPlayers:number;storedDiscoveryPlayers:number;recoveredPlayers:number;scheduleFailures:number}};
// At most two subrequests per foreground source (durable read + HTTP),
// leaving94 of the Worker's350 for schedules, rosters, odds and history.
const NBA_FOREGROUND_SOURCE_LIMIT=128;
type JsonSource=(url:string)=>Promise<any>;
const cache=boundedValueCache<Refresh>(4*1024*1024,4);
const pending=new Map<string,Promise<Refresh>>();
const sourceCache=boundedValueCache<SourceReceipt>(8*1024*1024,96),sourcePending=new Map<string,Promise<SourceReceipt>>();
async function scheduleJson(response:Response){
 const reader=response.body?.getReader();if(!reader)throw Error('nba_schedule_body_missing');
 const parts:Uint8Array[]=[];let bytes=0;
 try{for(;;){const value=await reader.read();if(value.done)break;bytes+=value.value.length;if(bytes>2*1024*1024)throw Error('nba_schedule_size_limit');parts.push(value.value);}}
 catch(error){await reader.cancel(error).catch(()=>{});throw error;}finally{reader.releaseLock();}
 const body=new Uint8Array(bytes);let offset=0;for(const part of parts){body.set(part,offset);offset+=part.length;}return JSON.parse(new TextDecoder().decode(body));
}
async function officialRead(url:string){
 const hit=sourceCache.get(url);if(hit)return hit;
 let work=sourcePending.get(url);if(!work){work=(async()=>{
  const r=await (url.includes('/basketball/nba/')?nbaSourceFetch(url):providerFetch(url));
  if(!r.ok){await r.body?.cancel();throw Object.assign(Error('Official basketball source unavailable'),{status:r.status});}
  const u=new URL(url),schedule=/\/basketball\/nba\/teams\/\d+\/schedule$/.test(u.pathname);
  const value=schedule?await scheduleJson(r):await r.json();
  const payload=schedule?validatedNbaTeamSchedule(value,u.pathname.split('/').at(-2)!,u.searchParams.get('season')!):url.includes('/summary?')?{header:value.header,boxscore:{players:value.boxscore?.players}}:value;
  const stamp=r.headers.get('x-sach-observed-at'),receipt={payload,observedAt:stamp&&Number.isFinite(Date.parse(stamp))?stamp:new Date().toISOString()};
  sourceCache.set(url,receipt,schedule||url.includes('/gamelog')?Math.max(0,NBA_DISCOVERY_FRESH_MS-(Date.now()-Date.parse(receipt.observedAt))):15*60000);return receipt;
 })().finally(()=>sourcePending.delete(url));sourcePending.set(url,work)}return work;
}
async function officialJson(url:string){return (await officialRead(url)).payload;}
/** Refresh the complete two-team census for recent fixtures discovered in each
 * ranked player's official log. Never infer usage from a player's points mean.
 * The research engine's existing 48-hour availability lag remains unchanged. */
export async function refreshBasketballObservations(sport:'nba'|'cbb',rows:any[],now=Date.now(),get:JsonSource=officialJson,options:{evidence?:NbaEvidenceAccess}={}):Promise<Refresh>{
 const league=sport==='cbb'?'mens-college-basketball':'nba';
 const players=[...new Map<string,any>(rows.filter(r=>/^\d+$/.test(String(r.playerId))&&Date.parse(r.gameTime)>now&&!r.frozen&&!r.lockedAtKickoff&&!['in','post'].includes(r.gameState)).map(r=>[String(r.playerId),r])).values()];
 const seasonFor=(r:any)=>String(r.pregameContext?.season||r.season||'');
 const key=sport+'|'+players.map(r=>[r.playerId,seasonFor(r),r.gameId,r.teamId,r.pregameContext?.opponentId].join('|')).sort().join(',');
 if(!players.length)return {observations:[],unavailablePlayers:[],checkedAt:new Date(now).toISOString()};
 const evidence=sport==='nba'?(options.evidence||(get===officialJson?configuredNbaEvidence():undefined)):undefined;
 // Injected source readers are used by deterministic tests; never share their cache.
 if(get===officialJson&&!options.evidence&&!evidence?.write){const hit=cache.get(key);if(hit&&(!hit.sourceEvidence||hit.sourceEvidence.every(e=>e.source.includes('/summary?')||now-Date.parse(e.lastVerifiedAt)<15*60000)))return hit;if(pending.has(key))return pending.get(key)!}
 const task=(async()=>{
  const sourceEvidence:EvidenceReference[]=[];
  const requestedSources=new Set<string>();let sourceBudgetExhausted=false;
  const resumableNbaCapture=sport==='nba'&&Boolean(dashboardJobContext()?.writeNbaEvidence);
  const admit=(source:string)=>{
   if(sport==='nba')assertNbaRankingActive();
   if(sport==='nba'&&!requestedSources.has(source)){
    if(!resumableNbaCapture&&requestedSources.size>=NBA_FOREGROUND_SOURCE_LIMIT){sourceBudgetExhausted=true;throw Error('nba_history_source_budget');}
    requestedSources.add(source);
   }
  };
  const evidenceReads=new Map<string,Promise<Awaited<ReturnType<NbaEvidenceAccess['read']>>>>();
  const access:NbaEvidenceAccess|undefined=evidence?{read:source=>{
   admit(source);let pending=evidenceReads.get(source);if(!pending){pending=Promise.resolve().then(()=>evidence.read(source));evidenceReads.set(source,pending);}return pending;
  },...(evidence.write?{write:async(value)=>{const result=await evidence.write!(value);evidenceReads.delete(value.source);return result;}}:{})}:undefined;
  const read=async(source:string):Promise<SourceReceipt>=>{
   admit(source);
   if(!access)return get===officialJson?officialRead(source):{payload:await get(source),observedAt:new Date(now).toISOString()};
   const loaded=await readNbaHistorySource(source,now,()=>get===officialJson?officialRead(source):get(source).then(payload=>({payload,observedAt:new Date(now).toISOString()})),access);
   if(sport==='nba')assertNbaRankingActive();
   sourceEvidence.push({source,sha256:loaded.evidence.sha256,observedAt:loaded.evidence.observedAt,lastVerifiedAt:loaded.evidence.lastVerifiedAt,recovered:loaded.recovered});
   return {payload:loaded.evidence.payload,observedAt:loaded.evidence.observedAt,lastVerifiedAt:loaded.evidence.lastVerifiedAt};
  };
  const unavailable=new Set<string>(),fixtures=new Map<string,{season:string;players:Set<string>;expectedPlayers:Set<string>;time?:number;teams?:string[]}>();
  let gamelogFailures=0,fixtureFailures=0,scheduleFailures=0,storedDiscoveryPlayers=0,calendarExpires=Infinity;
  const deniedRows:any[]=[];
  const calendarContext=(row:any)=>{
   const c=row.pregameContext,checked=Date.parse(c?.retrievedAt||'');
   return sport==='nba'&&String(c?.gameId)===String(row.gameId)&&String(c?.playerId)===String(row.playerId)&&String(c?.teamId)===String(row.teamId)&&c?.season===seasonFor(row)&&/^\d+$/.test(c?.teamId)&&/^\d+$/.test(c?.opponentId)&&c.teamId!==c.opponentId&&Date.parse(c.gameTime)===Date.parse(row.gameTime)&&Number.isFinite(checked)&&checked<=now&&now-checked<NBA_DISCOVERY_FRESH_MS;
  };
  const recent=now-21*86400000,cutoff=now-48*3600000;
  for(let i=0;i<players.length;i+=4)await Promise.all(players.slice(i,i+4).map(async row=>{
   const playerId=String(row.playerId),season=seasonFor(row);
   if(!/^\d{4}$/.test(season)){unavailable.add(playerId);return}
   try{
    // A fresh, validated official calendar already establishes discovery for
    // this team. Reuse it after restart rather than probing denied logs again.
    if(access&&calendarContext(row)){
     const source=nbaTeamScheduleSource(row.teamId,season),saved=checkedNbaHistoryEvidence(await access.read(source),source,now);
     if(saved&&now-Date.parse(saved.lastVerifiedAt)<NBA_DISCOVERY_FRESH_MS){storedDiscoveryPlayers++;deniedRows.push(row);return;}
    }
    const {payload:p}=await read(`https://site.web.api.espn.com/apis/common/v3/sports/basketball/${league}/athletes/${playerId}/gamelog?season=${season}`);
    if(!Array.isArray(p?.seasonTypes)||!p.events||typeof p.events!=='object')throw Error('Missing official gamelog');
    for(const group of basketballRegularSeasonGroups(p))for(const category of group.categories||[])if(category.type==='event')for(const event of category.events||[]){
     const id=String(event.eventId||''),meta=p.events[id],time=Date.parse(meta?.gameDate||'');
     if(!/^\d+$/.test(id)||!Number.isFinite(time)||time<recent||time>=cutoff||!['W','L'].includes(String(meta?.gameResult||'')))continue;
     const fixture=fixtures.get(id)||{season,players:new Set<string>(),expectedPlayers:new Set<string>()};
     if(fixture.season!==season)throw Error('Conflicting fixture seasons');
     fixture.players.add(playerId);fixture.expectedPlayers.add(playerId);fixtures.set(id,fixture);
    }
   }catch(error){if(sport==='nba')rethrowNbaEvidenceCancellation(error);gamelogFailures++;
    // A separate official team calendar can establish current-team discovery,
    // but only for an explicit athlete-log denial and an exact current fixture.
    // No host/profile retry, no fallback after rate limits or cancellation.
    if((error as {status?:number})?.status===403&&calendarContext(row))deniedRows.push(row);
    else unavailable.add(playerId);
   }
  }));
  const calendars=new Map<string,{season:string;teamId:string;rows:any[]}>();
  for(const row of deniedRows)for(const teamId of [row.pregameContext.teamId,row.pregameContext.opponentId]){
   const season=seasonFor(row),source=nbaTeamScheduleSource(teamId,season),group:{season:string;teamId:string;rows:any[]}=calendars.get(source)||{season,teamId,rows:[]};group.rows.push(row);calendars.set(source,group);
  }
  const invalidFixtures=new Set<string>(),scheduleJobs=[...calendars];
  for(let i=0;i<scheduleJobs.length;i+=4)await Promise.all(scheduleJobs.slice(i,i+4).map(async([source,group])=>{
   try{
    const receipt=await read(source),p=validatedNbaTeamSchedule(receipt.payload,group.teamId,group.season);
    calendarExpires=Math.min(calendarExpires,Date.parse(receipt.lastVerifiedAt||receipt.observedAt)+NBA_DISCOVERY_FRESH_MS);
    if(!Number.isFinite(calendarExpires)||calendarExpires<=now)throw Error('nba_schedule_expired');
    for(const row of group.rows){
     const target=p.events.find((e:any)=>e.id===String(row.gameId)),sides=target?.competitions[0].competitors||[];
     if(!target||Date.parse(target.date)!==Date.parse(row.gameTime)||!sides.some((t:any)=>t.team.id===row.pregameContext.teamId)||!sides.some((t:any)=>t.team.id===row.pregameContext.opponentId))throw Error('nba_schedule_target_mismatch');
    }
    for(const event of p.events){
     const time=Date.parse(event.date);if(time<recent||time>=cutoff||event.competitions[0].status.type.completed!==true)continue;
     const teams=event.competitions[0].competitors.map((t:any)=>t.team.id).sort(),existing=fixtures.get(event.id),fixture=existing||{season:group.season,players:new Set<string>(),expectedPlayers:new Set<string>()};
     if(fixture.season!==group.season||fixture.time!=null&&fixture.time!==time||fixture.teams&&fixture.teams.join('|')!==teams.join('|'))invalidFixtures.add(event.id);
     fixture.time=time;fixture.teams=teams;for(const row of group.rows)fixture.players.add(String(row.playerId));fixtures.set(event.id,fixture);
    }
   }catch(error){rethrowNbaEvidenceCancellation(error);scheduleFailures++;for(const row of group.rows)unavailable.add(String(row.playerId));}
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
    if(invalidFixtures.has(gameId)||!parsed.length||[...fixture.expectedPlayers].some(id=>!parsed.some(r=>r.playerId===id))||fixture.time!=null&&parsed.some(r=>Date.parse(r.gameTime)!==fixture.time)||fixture.teams&&parsed.some(r=>!fixture.teams!.includes(r.teamId)))throw Error('Incomplete official fixture census');
    observations.push(...parsed);
   }catch(error){if(sport==='nba')rethrowNbaEvidenceCancellation(error);fixtureFailures++;for(const id of fixture.players)unavailable.add(id)}
  }));
  console.info('[basketball refresh audit]',JSON.stringify({sport,players:players.length,discoveredFixtures:jobs.length,omittedFixtures:jobs.length-fixtureLimit,gamelogFailures,scheduleFailures,calendarRecovered:deniedRows.filter(r=>!unavailable.has(String(r.playerId))).length,fixtureFailures,unavailablePlayers:unavailable.size,observations:observations.length,sourceBudgetExhausted}));
  const value={observations,unavailablePlayers:[...unavailable].sort(),checkedAt:new Date(now).toISOString(),...(sport==='nba'?{sourceBudget:{attempted:requestedSources.size,limit:resumableNbaCapture?null:NBA_FOREGROUND_SOURCE_LIMIT,exhausted:sourceBudgetExhausted}}:{}),...(deniedRows.length?{discoveryRecovery:{deniedPlayers:deniedRows.length-storedDiscoveryPlayers,storedDiscoveryPlayers,recoveredPlayers:deniedRows.filter(r=>!unavailable.has(String(r.playerId))).length,scheduleFailures}}:{}),...(evidence?{sourceEvidence:sourceEvidence.sort((a,b)=>a.source.localeCompare(b.source))}:{})};
  if(get===officialJson&&!options.evidence){cache.set(key,value,Math.max(0,Math.min(unavailable.size?30_000:15*60_000,calendarExpires-now)),now)}
  return value;
 })();
 if(get===officialJson)pending.set(key,task);
 try{return await task}finally{if(get===officialJson)pending.delete(key)}
}

export function refreshNbaObservations(rows:any[],now=Date.now(),get:JsonSource=officialJson,options:{evidence?:NbaEvidenceAccess}={}){return refreshBasketballObservations('nba',rows,now,get,options)}
export function refreshCbbObservations(rows:any[],now=Date.now(),get:JsonSource=officialJson){return refreshBasketballObservations('cbb',rows,now,get)}
