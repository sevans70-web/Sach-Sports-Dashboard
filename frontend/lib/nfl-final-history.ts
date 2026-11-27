import {dashboardJobContext} from '@/lib/dashboard-job-context';
import {boundedValueCache} from '@/lib/bounded-value-cache';
import {boundedWork} from '@/lib/bounded-work';

const base='https://site.api.espn.com/apis/site/v2/sports/football/nfl';
let originRetryAt=0;
const fields=['passingAttempts','passingYards','passingTouchdowns','passingInterceptions','rushingAttempts','rushingYards','rushingTouchdowns','receivingTargets','receivingYards','receivingTouchdowns','receptions'];
const numeric=(v:any)=>v==null||typeof v==='boolean'||!String(v).trim()?null:Number.isFinite(Number(v))?Number(v):null;
type Final={gameId:string;gameTime:string;teamId:string;opponentId:string;result:string;source:string;retrievedAt:string;players:Record<string,{name:string;stats:(number|null)[]}>};
type TeamHistory={expires:number;teamId:string;season:number;games:Final[]};
const cache=boundedValueCache<TeamHistory>(2*1024*1024,16),pending=new Map<string,Promise<TeamHistory>>(),admission=boundedWork(2,32,20000);
const blocked=boundedValueCache<{expires:number;message:string;status?:number}>(32768,64);

/** A distinct, supported official resource, never an alias/header/identity retry
 * of a denied athlete log. Require exact FINAL/season/team identities; retain
 * only explicitly reported player statistics. Missing participation is NOT zero. */
export function nflFinalObservation(payload:any,gameId:string,teamId:string,season:number,retrievedAt:string):Final{
 const h=payload?.header,c=h?.competitions?.[0],date=String(c?.date||h?.date||''),sides=c?.competitors||[];
 if(String(h?.id)!==gameId||Number(h?.season?.year)!==season||Number(h?.season?.type)!==2||c?.status?.type?.completed!==true||
  !Number.isFinite(Date.parse(date))||Date.parse(date)>=Date.parse(retrievedAt)-48*3600000||sides.length!==2||new Set(sides.map((s:any)=>String(s.team?.id))).size!==2)throw Error('nfl_final_identity_or_status');
 const own=sides.find((s:any)=>String(s.team?.id)===teamId),other=sides.find((s:any)=>String(s.team?.id)!==teamId);
 const score=(s:any)=>numeric(typeof s?.score==='object'?s.score.value:s?.score);
 if(!own||!other?.team?.id||score(own)==null||score(other)==null)throw Error('nfl_final_team_or_result');
 const boxes=(payload?.boxscore?.players||[]).filter((t:any)=>String(t.team?.id)===teamId);
 if(boxes.length!==1||!Array.isArray(boxes[0].statistics))throw Error('nfl_final_boxscore_missing');
 const players:Final['players']={};let groups=0;
 for(const group of boxes[0].statistics){
  if(!['passing','rushing','receiving'].includes(group.name))continue;groups++;
  if(!Array.isArray(group.keys)||!Array.isArray(group.athletes))throw Error('nfl_final_stat_schema');
  for(const a of group.athletes){const id=String(a.athlete?.id||'');if(!/^\d+$/.test(id)||!Array.isArray(a.stats))throw Error('nfl_final_player_identity');
   const player=players[id]||{name:String(a.athlete.displayName||''),stats:fields.map(()=>null)};
   for(let i=0;i<group.keys.length;i++){
    const key=group.keys[i],field=key==='completions/passingAttempts'?'passingAttempts':key==='interceptions'&&group.name==='passing'?'passingInterceptions':key;
    const at=fields.indexOf(field);if(at<0)continue;
    const value=key==='completions/passingAttempts'?String(a.stats[i]??'').match(/^\d+\/(\d+)$/)?.[1]:a.stats[i];
    const n=numeric(value);if(n==null)continue;if(n<0&&!['passingYards','rushingYards','receivingYards'].includes(field))throw Error('nfl_final_invalid_stat');
    if(player.stats[at]!=null&&player.stats[at]!==n)throw Error('nfl_final_conflicting_stat');player.stats[at]=n;
   }
   players[id]=player;
  }
 }
 if(groups!==3||!Object.keys(players).length)throw Error('nfl_final_incomplete_categories');
 return {gameId,gameTime:new Date(date).toISOString(),teamId,opponentId:String(other.team.id),result:score(own)===score(other)?'T':score(own)!>score(other)!?'W':'L',source:base+'/summary?event='+gameId,retrievedAt,players};
}

async function json(url:string,signal:AbortSignal){
 const job=dashboardJobContext();
 signal.throwIfAborted();job?.assertActive();
 const now=Date.now();
 if(!job&&originRetryAt>now)throw Object.assign(Error('nfl_official_history_http_429'),{status:429,retryMs:originRetryAt-now});
 const r=await fetch(url,{signal:AbortSignal.any([signal,AbortSignal.timeout(8000)]),
  redirect:'manual',headers:{Accept:'application/json','User-Agent':'SachSports/1.0'}});
 if(!r.ok){
  const retry=r.headers.get('Retry-After'),seconds=retry===null?NaN:Number(retry),date=Date.parse(retry||'');
  const retryMs=Number.isFinite(seconds)?seconds*1000:Number.isFinite(date)?date-now:0;
  if(!job&&r.status===429)originRetryAt=Math.max(now+60000,now+retryMs);
  void r.body?.cancel().catch(()=>{});
  throw Object.assign(Error('nfl_official_history_http_'+r.status),{status:r.status,retryMs});
 }
 // Bound the read even when an upstream returns an unexpected archive/body.
 const reader=r.body?.getReader();if(!reader)throw Error('nfl_official_body_missing');const chunks:Uint8Array[]=[];let size=0;
 try{for(;;){signal.throwIfAborted();const v=await reader.read();if(v.done)break;size+=v.value.length;if(size>2*1024*1024)throw Error('nfl_official_body_limit');chunks.push(v.value);}}
 catch(error){await reader.cancel(error).catch(()=>{});throw error;}finally{reader.releaseLock();}
 const body=new Uint8Array(size);let at=0;for(const c of chunks){body.set(c,at);at+=c.length;}
 return {payload:JSON.parse(new TextDecoder().decode(body)),retrievedAt:r.headers.get('x-sach-observed-at')||new Date().toISOString()};
}

/** One calendar + at most17 regular-season FINALs per team, two concurrent
 * team builds and a20-second overall deadline (including admission).
 * Every FINAL is checkpointed in the existing operational input cache before
 * fetching another. Job cancellation/deferred errors propagate to the existing
 * fenced coordinator; no detached fetches or internal automatic retries. */
async function teamHistory(teamId:string,season:number,now:number):Promise<TeamHistory>{
 if(!/^\d+$/.test(teamId)||!Number.isInteger(season))throw Error('nfl_history_missing_team_or_season');
 const job=dashboardJobContext(),key=`nfl-final-history:v1:${teamId}:${season}`,saved=job?.readInput?.(key)||(!job?cache.get(key,now):undefined);
 const denial=job?.readInput?.(key+':blocked')||(!job?blocked.get(key,now):undefined);
 if(denial?.expires>now)throw Object.assign(Error(denial.message),{status:denial.status,retryAt:denial.expires});
 if(saved?.expires>now&&saved.complete===true)return saved;
 const owner=(job?.id||'foreground')+'|'+key;let work=pending.get(owner);if(work)return work;
 const deadline=AbortSignal.timeout(20000);
 work=admission.run(async()=>{
  deadline.throwIfAborted();job?.assertActive();const discovery=await json(`${base}/teams/${teamId}/schedule?season=${season}&seasontype=2`,deadline),p=discovery.payload;
  if(String(p.team?.id)!==teamId||Number(p.season?.year)!==season||Number(p.season?.type)!==2||!Array.isArray(p.events))throw Error('nfl_history_calendar_identity');
  const finals=p.events.filter((e:any)=>Number(e.season?.year)===season&&Number(e.seasonType?.type)===2&&e.competitions?.[0]?.status?.type?.completed===true&&Date.parse(e.date)<now-48*3600000)
   .sort((a:any,b:any)=>Date.parse(a.date)-Date.parse(b.date));
  // Do not confuse the model's last10 PLAYER appearances with ten TEAM
  // fixtures: injuries and missed games can put genuine model inputs earlier.
  if(!finals.length||finals.length>17||new Set(finals.map((e:any)=>String(e.id))).size!==finals.length)throw Error('nfl_history_calendar_empty_or_duplicate');
  const games:Final[]=[];const previous=new Map<string,Final>((saved?.games||[]).map((g:Final)=>[g.gameId,g]));
  for(const e of finals){deadline.throwIfAborted();job?.assertActive();const id=String(e.id),old=previous.get(id);
   if(old&&old.teamId===teamId&&Date.parse(old.gameTime)===Date.parse(e.date))games.push(old);
   else{const response=await json(base+'/summary?event='+encodeURIComponent(id),deadline);job?.assertActive();const g=nflFinalObservation(response.payload,id,teamId,season,response.retrievedAt);
    if(Date.parse(g.gameTime)!==Date.parse(e.date))throw Error('nfl_history_calendar_summary_mismatch');games.push(g);
   }
   job?.checkpointInput?.(key,{teamId,season,games:[...games],complete:false,expires:now+15*60000},!old);
  }
  job?.assertActive();const result={teamId,season,games,complete:true,expires:now+15*60000};
  if(job)job.checkpointInput?.(key,result,true);else cache.set(key,result,15*60000,now);return result;
 }).catch(error=>{
  job?.assertActive();if(error?.deferred||error?.name==='AbortError')throw error;
  const ttl=Math.max(error?.retryMs||0,error?.status===403?3600000:error?.status===429?60000:30000);
  const denial={expires:now+ttl,message:error instanceof Error?error.message:'nfl_official_history_unavailable',status:error?.status};
  if(job)job.checkpointInput?.(key+':blocked',denial,false);else blocked.set(key,denial,ttl,now);throw error;
 }).finally(()=>pending.delete(owner));pending.set(owner,work);return work;
}

/** Adapt genuine official FINAL rows to the existing unchanged model parsers. */
export async function nflOfficialPlayerHistory(playerId:string,teamId:string,season:number,now=Date.now()){
 const history=await teamHistory(teamId,season,now),events:Record<string,any>={},appearances:any[]=[];
 for(const g of history.games){const player=g.players[playerId];if(!player)continue;
  events[g.gameId]={gameDate:g.gameTime,gameResult:g.result,team:{id:g.teamId},opponent:{id:g.opponentId},source:g.source,retrievedAt:g.retrievedAt};
  appearances.push({eventId:g.gameId,stats:player.stats});
 }
 return {names:fields,events,seasonTypes:[{type:2,categories:[{type:'event',events:appearances}]}],sourcePolicy:'official_team_calendar_and_final_boxscores',completeFinals:history.games.length};
}
