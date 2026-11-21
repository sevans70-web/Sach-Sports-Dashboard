import {createHash} from 'node:crypto';
import {validatedNbaTeamSchedule} from '@/lib/nba-team-schedule';
import {basketballModelObservations} from '@/lib/basketball-model-observations';
import {basketballRegularSeasonGroups} from '@/lib/basketball-history-window';

export const NBA_DISCOVERY_FRESH_MS=15*60_000;
export type NbaHistoryEvidence={version:1;source:string;kind:'discovery'|'fixture'|'team_schedule';payload:any;sha256:string;observedAt:string;validatedAt:string;lastVerifiedAt:string};
export type NbaEvidenceAccess={read:(source:string)=>Promise<NbaHistoryEvidence|null>|NbaHistoryEvidence|null;write?:(value:NbaHistoryEvidence)=>Promise<unknown>|unknown};
export const nbaEvidenceHash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
/** Request/job cancellation is control flow, never a recoverable feed outage. */
export function rethrowNbaEvidenceCancellation(error:unknown){
 const failure=error as {name?:string;message?:string;deferred?:boolean}|null;
 if(failure&&(failure.deferred===true||['AbortError','TimeoutError'].includes(failure.name||'')||/^(?:job_|nba_ranking_deadline$)/.test(failure.message||'')))throw error;
}
export function completedNbaDiscoveryEvents(payload:any){
 const ids=new Set<string>();
 if(Array.isArray(payload?.events)){for(const e of payload.events)if(e.competitions?.[0]?.status?.type?.completed===true)ids.add(String(e.id));return ids;}
 for(const group of basketballRegularSeasonGroups(payload))for(const category of group.categories||[])if(category.type==='event')for(const event of category.events||[]){
  const id=String(event.eventId||'');if(['W','L'].includes(String(payload.events?.[id]?.gameResult)))ids.add(id);
 }
 return ids;
}
export function nbaEvidenceIdentity(source:string){
 const u=new URL(source);if(u.username||u.password||u.hash||u.port||u.protocol!=='https:')throw Error('nba_evidence_source_invalid');
 if(u.hostname==='site.web.api.espn.com'&&/^\/apis\/common\/v3\/sports\/basketball\/nba\/athletes\/\d+\/gamelog$/.test(u.pathname)&&/^\d{4}$/.test(u.searchParams.get('season')||'')&&[...u.searchParams.keys()].length===1)return {kind:'discovery' as const,season:u.searchParams.get('season')!,playerId:u.pathname.split('/').at(-2)!};
 if(u.hostname==='site.api.espn.com'&&/^\/apis\/site\/v2\/sports\/basketball\/nba\/teams\/\d+\/schedule$/.test(u.pathname)&&/^\d{4}$/.test(u.searchParams.get('season')||'')&&u.searchParams.get('seasontype')==='2'&&[...u.searchParams.keys()].length===2)return {kind:'team_schedule' as const,season:u.searchParams.get('season')!,teamId:u.pathname.split('/').at(-2)!};
 if(u.hostname==='site.api.espn.com'&&u.pathname==='/apis/site/v2/sports/basketball/nba/summary'&&/^\d+$/.test(u.searchParams.get('event')||'')&&[...u.searchParams.keys()].length===1)return {kind:'fixture' as const,gameId:u.searchParams.get('event')!};
 throw Error('nba_evidence_source_invalid');
}
/** Persist only the actual model-relevant response. No reconstructed totals. */
export function validateNbaHistoryEvidence(source:string,input:any,observedAt:string,now=Date.now()):NbaHistoryEvidence{
 const id=nbaEvidenceIdentity(source),stamp=Date.parse(observedAt);
 if(!Number.isFinite(stamp)||stamp>now)throw Error('nba_evidence_timestamp_invalid');
 let payload=input;
 if(id.kind==='fixture'){
  payload={header:input?.header,boxscore:{players:input?.boxscore?.players}};
  const season=String(payload.header?.season?.year||'');
  const rows=basketballModelObservations(payload,{sport:'nba',season,gameId:id.gameId,source,retrievedAt:observedAt});
  const sides=payload.header?.competitions?.[0]?.competitors||[];
  const identityValid=/^\d{4}$/.test(season)&&sides.length===2&&new Set(sides.map((s:any)=>s.homeAway)).size===2&&sides.every((s:any)=>['home','away'].includes(s.homeAway)&&/^\d+$/.test(String(s.team?.id)))&&new Set(rows.map(r=>r.playerId+'|'+r.market)).size===rows.length;
  const finiteNonnegative=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
  if(!rows.length||!identityValid||rows.some(r=>{
   const c=r.basketballContext;
   return !/^\d+$/.test(r.playerId)||!Number.isInteger(r.actual)||r.actual<0||!c||typeof c.starter!=='boolean'||
    !finiteNonnegative(r.workload)||![c.fieldGoalAttempts,c.freeThrowAttempts,c.turnovers].every(v=>Number.isInteger(v)&&v>=0)||
    !Number.isFinite(c.teamPossessions)||c.teamPossessions<=0||!Number.isFinite(c.duration)||c.duration<=0||
    (r.workload>0&&!finiteNonnegative(c.usage))||!['points','rebounds','assists','threes_made','steals','blocks'].every(m=>Number.isInteger(c.allowed[m])&&c.allowed[m]>=0);
  }))throw Error('nba_evidence_incomplete_census');
 }else if(id.kind==='team_schedule'){
  payload=validatedNbaTeamSchedule(input,id.teamId,id.season);
  if(payload.events.some((e:any)=>e.competitions[0].status.type.completed&&Date.parse(e.date)>=stamp))throw Error('nba_schedule_future_final');
 }else{
  if(!Array.isArray(input?.seasonTypes)||!input.events||typeof input.events!=='object'||Array.isArray(input.events)||input.athlete?.id&&String(input.athlete.id)!==id.playerId)throw Error('nba_evidence_incomplete_discovery');
  const groups=basketballRegularSeasonGroups(input);let count=0;
  for(const group of groups)for(const category of group.categories||[])if(category.type==='event')for(const event of category.events||[]){
   const meta=input.events[String(event.eventId)];
   if(!/^\d+$/.test(String(event.eventId))||!meta||!Number.isFinite(Date.parse(meta.gameDate||'')))throw Error('nba_evidence_incomplete_discovery');
   if(['W','L'].includes(String(meta.gameResult)))count++;
  }
  // An empty/malformed response cannot replace a known complete discovery.
  if(!groups.length||!count)throw Error('nba_evidence_incomplete_discovery');
 }
 if(Buffer.byteLength(JSON.stringify(payload))>1024*1024)throw Error('nba_evidence_size_limit');
 return {version:1,source,kind:id.kind,payload,sha256:nbaEvidenceHash(payload),observedAt,validatedAt:new Date(now).toISOString(),lastVerifiedAt:observedAt};
}
export function checkedNbaHistoryEvidence(value:NbaHistoryEvidence|null,source:string,now=Date.now()){
 if(!value||value.version!==1||value.source!==source||value.sha256!==nbaEvidenceHash(value.payload))return null;
 try{const checked=validateNbaHistoryEvidence(source,value.payload,value.observedAt,now);
  const verified=Date.parse(value.lastVerifiedAt);
  const validated=Date.parse(value.validatedAt);
  if(value.kind!==checked.kind||!Number.isFinite(validated)||validated<Date.parse(value.observedAt)||validated>now||!Number.isFinite(verified)||verified<Date.parse(value.observedAt)||verified>now)return null;
  return value;
 }catch{return null;}
}
/** Completed censuses retain their actual provenance. Discovery must remain
 * fresh to establish that no newly eligible game has been omitted. */
export async function readNbaHistorySource(source:string,now:number,live:()=>Promise<{payload:any;observedAt:string}>,access:NbaEvidenceAccess){
 let stored:NbaHistoryEvidence|null=null;
 try{stored=checkedNbaHistoryEvidence(await access.read(source),source,now);}catch(error){rethrowNbaEvidenceCancellation(error);}
 const fresh=stored&&now-Date.parse(stored.lastVerifiedAt)<NBA_DISCOVERY_FRESH_MS;
 // A validated FINAL is a durable model input, not a fifteen-minute response
 // cache. Capture must read it before attempting a denied refresh, just as
 // foreground does. Discovery still requires its independent freshness check.
 if(fresh||stored?.kind==='fixture')return {evidence:stored!,recovered:true};
 let evidence:NbaHistoryEvidence;
 try{
  const incoming=await live();evidence=validateNbaHistoryEvidence(source,incoming.payload,incoming.observedAt,Math.max(now,Date.now()));
  if(evidence.kind!=='fixture'&&now-Date.parse(evidence.lastVerifiedAt)>=NBA_DISCOVERY_FRESH_MS)throw Error('nba_discovery_response_expired');
 }catch(error){
  rethrowNbaEvidenceCancellation(error);
  // FINAL recovery already returned above. A failed discovery must never
  // extend coverage or claim that the old discovery was successfully checked.
  throw error;
 }
 // A persistence failure must not silently substitute an older version after
 // a valid correction was received. Let the job checkpoint/retry explicitly.
 if(access.write){
  await access.write(evidence);
  const canonical=checkedNbaHistoryEvidence(await access.read(source),source,Math.max(now,Date.now()));
  if(canonical)return {evidence:canonical,recovered:false};
 }
 return {evidence,recovered:false};
}
