import {DurableObject,withEnv} from 'cloudflare:workers';
import {encode,decode,runJobBudget,JobDeferred} from './budget.mjs';
import {runPhase} from './tasks.mjs';
import {PREGAME_MARKETS,torontoCaptureDay,marketsForCaptureTick,PREGAME_CAPTURE_CRON,PREGAME_GRADE_CRON} from '../scripts/worker-pregame-capture.mjs';
import {gradingSportForTick} from '../scripts/worker-pregame-grade.mjs';
import {workerHistoryBackupScope} from '../scripts/worker-history-backup.mjs';
const sports=['nba','nfl','nhl'];
const safeError=e=>/^[a-z0-9_ .:-]{1,160}$/i.test(e?.message||'')?e.message:'dashboard_job_failed';
function progress(job,usage,advanced,now){
 const previous=job.progress||{},writes=usage?.cacheWrites||0;
 const stalledAttempts=advanced||writes>0?0:(previous.stalledAttempts||0)+1;
 return {sourceCheckpoints:(previous.sourceCheckpoints||0)+writes,checkpointBytes:(previous.checkpointBytes||0)+(usage?.checkpointBytes||0),lastCheckpointAt:advanced||writes>0?now:previous.lastCheckpointAt||null,stalledAttempts,needsAttention:stalledAttempts>=3};
}
/** Independent objects provide independent invocation budgets, persistent cursors,
 * and serial phases. Only the dashboard owns this namespace; CW08 is unrelated. */
export function dashboardJobClass(services){return class DashboardJobQueue extends DurableObject{
 constructor(ctx,env){super(ctx,env);this.sql=ctx.storage.sql;
  this.sql.exec('CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, kind TEXT, sport TEXT, state TEXT, due INTEGER, touched INTEGER, data TEXT)');
  this.sql.exec('CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT)');
  this.sql.exec('CREATE TABLE IF NOT EXISTS source_cache(url TEXT PRIMARY KEY,expires INTEGER,body TEXT,bytes INTEGER)');
  this.sql.exec('CREATE TABLE IF NOT EXISTS phase_events(id INTEGER PRIMARY KEY AUTOINCREMENT,job TEXT,at INTEGER,phase TEXT,outcome TEXT,detail TEXT)');
  this.sql.exec('CREATE TABLE IF NOT EXISTS documents(job TEXT,stream TEXT,body TEXT,PRIMARY KEY(job,stream))');
 }
 now(){return Date.now();}
 rows(sql,...args){return [...this.sql.exec(sql,...args)];}
 meta(key){const row=this.rows('SELECT value FROM metadata WHERE key=?',key)[0];return row?JSON.parse(row.value):null;}
 setMeta(key,value){this.sql.exec('INSERT OR REPLACE INTO metadata VALUES(?,?)',key,JSON.stringify(value));}
 cacheRead(url){const row=this.rows('SELECT body FROM source_cache WHERE url=? AND expires>?',url,this.now())[0];return row?decode(row.body):null;}
 cacheWrite(url,value){
  const body=encode(value),bytes=body.length;if(bytes>1536*1024)return false;
  this.sql.exec('DELETE FROM source_cache WHERE expires<=?',this.now());
  this.sql.exec('INSERT OR REPLACE INTO source_cache VALUES(?,?,?,?)',url,value.expires,body,bytes);
  // Operational input cache only. No pick, grade or evidence is evicted here.
  while(this.rows('SELECT COUNT(*) AS n,COALESCE(SUM(bytes),0) AS bytes FROM source_cache')[0].bytes>32*1024*1024||this.rows('SELECT COUNT(*) AS n FROM source_cache')[0].n>512)
   this.sql.exec('DELETE FROM source_cache WHERE url=(SELECT url FROM source_cache ORDER BY expires,url LIMIT 1)');
  return true;
 }
 document(job,stream,value){this.sql.exec('INSERT OR IGNORE INTO documents VALUES(?,?,?)',job,stream,encode(value));}
 documents(job){return this.rows('SELECT body FROM documents WHERE job=? ORDER BY stream',job).map(r=>decode(r.body));}
 async gate(origin,until=0){
  const old=this.meta('cooldown')||0;if(until>old)this.setMeta('cooldown',until);
  return Math.max(old,until);
 }
 async enqueue(job){
  if(!sports.includes(job.sport)||!['capture','grade','replay'].includes(job.kind)||!Number.isFinite(job.created))throw Error('invalid_job');
  if(job.kind==='capture'&&!PREGAME_MARKETS[job.sport].includes(job.market))throw Error('invalid_market');
  const id=job.id;const value={...job,state:'active',phase:job.kind==='capture'?'rank':'scan',cursor:job.kind==='replay'?'':0,attempts:0};
  // Coalesce ticks while the same market/day is already pending. Original reserved
  // picks retain their exact first bytes; no tick replaces them with fresh quotes.
  const pending=this.rows("SELECT data FROM jobs WHERE state IN ('active','blocked')").map(r=>decode(r.data)).filter(p=>p.state==='active'||(p.retryAt||0)>this.now());
  const existing=pending.find(p=>p.kind===job.kind&&(job.kind==='capture'?p.market===job.market&&torontoCaptureDay(p.created)===torontoCaptureDay(job.created):job.kind==='replay'?p.day===job.day:true));
  if(existing)return {id:existing.id,queued:false,state:existing.state,retryAt:existing.retryAt||null};
  this.sql.exec('INSERT OR IGNORE INTO jobs VALUES(?,?,?,?,?,?,?)',id,job.kind,job.sport,'active',this.now(),0,encode(value));
  await this.arm();return {id,queued:true};
 }
 async arm(){
  const next=this.rows('SELECT MIN(due) AS due FROM jobs WHERE state=?','active')[0]?.due;
  if(next!=null){const lease=this.meta('lease');await this.ctx.storage.setAlarm(Math.max(this.now()+1000,next,lease?.until||0));}
 }
 status(){return {jobs:this.rows('SELECT data FROM jobs ORDER BY touched DESC,id LIMIT 100').map(r=>{const j=decode(r.data);const {board,quotes,picks,grades,...safe}=j;return safe;}),lease:this.meta('lease'),cooldown:this.meta('cooldown')};}
 async alarm(){
  const lease=this.meta('lease');if(lease?.until>this.now()){await this.arm();return;}
  const row=this.rows('SELECT data FROM jobs WHERE state=? AND due<=? ORDER BY touched,id LIMIT 1','active',this.now())[0];
  if(!row){await this.arm();return;}
  const job=decode(row.data),token=crypto.randomUUID();this.setMeta('lease',{token,until:this.now()+90000});
  const owns=()=>this.meta('lease')?.token===token;
  const fencedStore={cacheRead:u=>this.cacheRead(u),cacheWrite:(u,v)=>{if(!owns())throw Error('job_lease_lost');return this.cacheWrite(u,v);},document:(...args)=>{if(!owns())throw Error('job_lease_lost');this.document(...args);},documents:id=>this.documents(id)};
  const pending=new Set();const ctx={waitUntil:p=>{const promise=Promise.resolve(p);pending.add(promise);promise.finally(()=>pending.delete(promise)).catch(()=>{});},passThroughOnException(){},props:{}};
  let next=job,due=this.now()+1000;
  try{
   const execution=await runJobBudget({env:this.env,store:fencedStore,now:()=>this.now(),cacheSources:job.kind==='capture',allowNflSourceDenials:job.sport==='nfl',allowNbaSourceDenials:job.sport==='nba',gate:(origin,until)=>this.env.DASHBOARD_JOBS.getByName('provider:'+origin).gate(origin,until)},async env=>{
    const value=await runPhase(job,{...services,env,store:fencedStore,now:()=>this.now(),route:path=>services.dashboard.fetch(new Request((job.kind==='capture'?'https://sach-capture.internal':'https://sach-grading.internal')+path,{headers:{Accept:'application/json'}}),env,ctx)});
    // Drain framework after()/waitUntil work before closing this request's budget.
    while(pending.size)await Promise.allSettled([...pending]);
    return value;
   },withEnv);
   next={...execution.result,attempts:0,lastError:null,usage:execution.usage};
   next.progress=progress(job,execution.usage,['phase','state','cursor','gameCursor','gradeCursor','verified','stored','picksStored','checked'].some(key=>next[key]!==job[key]),this.now());
   if(job.kind==='capture'&&job.phase==='rank'){
    next.reservedAt=this.now();
    fencedStore.document(job.id,'original_reservation',{capturedAt:next.reservedAt,quotes:next.quotes});
   }
  }catch(error){
   const attempts=(job.attempts||0)+1;due=Math.max(this.now()+Math.min(15*60000,1000*2**Math.min(attempts,10)),error.retryAt||0);
   const measured=progress(job,error.usage,false,this.now());
   if(error.message==='job_subrequest_budget'&&error.usage?.cacheWrites>0)due=this.now()+1000;
   const blocked=job.kind==='capture'&&(measured.stalledAttempts>=3||attempts>=8);
   if(measured.stalledAttempts>=3)due=Math.max(due,this.now()+15*60000);
   if(blocked){due=Math.max(due,this.now()+30*60000);measured.needsAttention=true;}
   next={...job,attempts,state:blocked?'blocked':job.state,lastError:safeError(error),failureDetails:error.details||null,usage:error.usage||null,progress:measured};
   console.warn('[dashboard-job-deferred]',JSON.stringify({id:job.id,kind:job.kind,sport:job.sport,market:job.market,phase:job.phase,reason:next.lastError,retryAt:due,usage:next.usage,failureDetails:next.failureDetails}));
  }finally{
   if(owns()){
    const touched=this.now();next.retryAt=next.state==='done'?null:due;
    this.sql.exec('UPDATE jobs SET state=?,due=?,touched=?,data=? WHERE id=?',next.state||'active',due,touched,encode(next),job.id);
    this.sql.exec('INSERT INTO phase_events(job,at,phase,outcome,detail) VALUES(?,?,?,?,?)',job.id,touched,job.phase,next.lastError?'deferred':next.state==='done'?'done':'checkpoint',JSON.stringify({reason:next.lastError||null,retryAt:next.retryAt,usage:next.usage,failureDetails:next.failureDetails,eligible:next.eligible,expired:next.expired,progress:next.progress}));
    this.setMeta('lease',null);
   }
   await this.arm();
  }
  console.info('[dashboard-job-phase]',JSON.stringify({id:job.id,kind:job.kind,sport:job.sport,market:job.market,from:job.phase,to:next.phase,state:next.state,eligible:next.eligible,stored:next.stored,picksStored:next.picksStored,expired:next.expired,usage:next.usage}));
 }
};}
export async function enqueueDashboardTick(controller,env){
 if(!env.DASHBOARD_JOBS)throw Error('dashboard_job_binding_missing');
 const created=controller.scheduledTime,slot=Math.floor(created/120000),jobs=[];
 if(controller.cron===PREGAME_CAPTURE_CRON||controller.cron==='*/5 * * * *'){
  for(const {sport,market} of marketsForCaptureTick(created,controller.cron!==PREGAME_CAPTURE_CRON))jobs.push({id:`capture:${sport}:${market}:${slot}`,kind:'capture',sport,market,created});
  if(controller.cron===PREGAME_CAPTURE_CRON){const scope=workerHistoryBackupScope(created,true);jobs.push({id:`replay:${scope.sport}:${slot}`,kind:'replay',...scope,created});}
 }else if(controller.cron===PREGAME_GRADE_CRON){const sport=gradingSportForTick(created);if(sport)jobs.push({id:`grade:${sport}:${slot}`,kind:'grade',sport,created});}
 for(const job of jobs)await env.DASHBOARD_JOBS.getByName(job.kind+':'+job.sport).enqueue(job);
 return {queued:jobs.map(({id})=>id)};
}
