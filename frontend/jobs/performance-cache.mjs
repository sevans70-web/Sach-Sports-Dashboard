/** Derived views only, in existing dashboard metadata/documents tables.
 * One independent performance:<sport> object; no picks/grades/history writes. */
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const sports=['nba','nfl','nhl'],periods=['Today','Yesterday','Week','Month','Season'];
const maxViewBytes=16*1024*1024,maxSourceBytes=1024*1024,maxStoredBytes=32*1024*1024,maxStaleMs=15*60000;
const hash=s=>createHash('sha256').update(s).digest('hex');
const pack=v=>gzipSync(JSON.stringify(v)).toString('base64');
const unpack=(s,max=maxViewBytes)=>JSON.parse(gunzipSync(Buffer.from(s,'base64'),{maxOutputLength:max}).toString());
export function performanceCache(host,services,withEnvironment,runBudget){
 const get=stream=>host.rows('SELECT body FROM documents WHERE job=? AND stream=?','performance-cache-v1',stream)[0]?.body;
 const put=(stream,value)=>{
  if(Buffer.byteLength(JSON.stringify(value))>maxViewBytes)throw Error('performance_view_capacity');
  const body=pack(value);
  if(body.length>1500000)throw Error('performance_cache_row_capacity');
  const total=host.rows('SELECT COALESCE(SUM(LENGTH(body)),0) bytes FROM documents WHERE job=?','performance-cache-v1')[0].bytes;
  if(total-(get(stream)?.length||0)+body.length>maxStoredBytes)throw Error('performance_cache_capacity');
  host.sql.exec('INSERT INTO documents VALUES(?,?,?) ON CONFLICT(job,stream) DO UPDATE SET body=excluded.body','performance-cache-v1',stream,body);
 };
 const state=()=>host.meta('performance-state');
 const save=s=>host.setMeta('performance-state',s);
 let current,reading,readingRevision;const scoped=new Map(),responses=new Map();let responseBytes=0;
 const cached=()=>{
  if(current)return current;const body=get('view');if(!body)return null;const index=unpack(body);
  if(index.version!==1||index.parts<1||index.parts>64||index.bytes>maxViewBytes)throw Error('performance_view_index_invalid');
  let text='';for(let i=0;i<index.parts;i++){const part=get('view:'+i);if(!part)throw Error('performance_view_chunk_missing');text+=unpack(part).text;}
  if(Buffer.byteLength(text)!==index.bytes||hash(text)!==index.sha)throw Error('performance_view_checksum');return current=JSON.parse(text);
 };
 const check=(sport,period)=>{if(!sports.includes(sport)||period&&!periods.includes(period))throw Error('invalid_performance_scope');const s=state();if(s&&s.sport!==sport)throw Error('performance_object_scope_mismatch');return s;};
 const arm=async delay=>{const alarm=await host.ctx.storage.getAlarm();if(alarm===null||alarm>host.now()+delay)await host.ctx.storage.setAlarm(host.now()+delay);};
 async function protectedRead(sport,revision){
  if(reading){
   if(readingRevision===revision)return reading;
   await reading.catch(()=>{});
   return protectedRead(sport,revision);
  }
  readingRevision=revision;
  const request=withEnvironment(host.env,async()=>{
   const v=await services.protected(sport,host.now());
   if(v.coverage.errors?.some(e=>e.startsWith('cloud:protected_original'))||v.coverage.protectedOriginals?.invalid)throw Error('performance_protected_history_unavailable');
   return v;
  });
  reading=request;
  try{return await request;}finally{if(reading===request)reading=null;}
 }
 function writeView(value){
  const raw=JSON.stringify(value);if(Buffer.byteLength(raw)>maxViewBytes)throw Error('performance_view_capacity');
  // Split large derived views below SQLite's value limit; commit the manifest
  // and chunks atomically so eviction/interruption cannot expose half a view.
  const parts=[];for(let i=0;i<raw.length;i+=256*1024)parts.push(raw.slice(i,i+256*1024));
  scoped.clear();responses.clear();responseBytes=0;host.ctx.storage.transactionSync(()=>{host.sql.exec("DELETE FROM documents WHERE job=? AND stream LIKE 'view:%'",'performance-cache-v1');parts.forEach((text,i)=>put('view:'+i,{text}));put('view',{version:1,parts:parts.length,bytes:Buffer.byteLength(raw),sha:hash(raw)});});current=value;
 }
 async function read(sport,period){
  let s=check(sport,period)||{sport,revision:0,protectedAt:0,archiveAt:0,featuredAt:0,stalled:0};
  let view=cached();
  if(!view||s.dirty||(s.protectedAt&&host.now()-s.protectedAt>=maxStaleMs)){
   const revision=s.revision;
   try{
    const value=await protectedRead(sport,revision);
    const latest=state()||s;
    // An invalidation received during the read belongs to the next revision.
    // An earlier response cannot mark that revision current.
    if(latest.revision===revision&&(!cached()||latest.dirty||host.now()-latest.protectedAt>=maxStaleMs)){
     const previous=cached();
     view={...(previous?services.merge(previous,previous,value,host.now()):value),snapshotAt:new Date(host.now()).toISOString()};
     put('protected',value);writeView(view);
     s={...latest,protectedAt:host.now(),dirty:false,retryAt:null,
      lastError:latest.lastError==='performance_protected_refresh_failed'?null:latest.lastError};save(s);
    }
    view=cached();
   }catch(error){
    const latest=state()||s;
    if(!view||!latest.protectedAt||host.now()-latest.protectedAt>=maxStaleMs)throw error;
    s={...latest,lastError:'performance_protected_refresh_failed'};save(s);
   }
   if(!view||host.now()-(state()?.protectedAt||0)>=maxStaleMs)throw Error('performance_snapshot_expired');
  }
  s=state()||s;
  const stale=host.now()-s.protectedAt>=60000||s.dirty===true;
  if(stale||!s.archiveAt||host.now()-s.archiveAt>=300000)await arm(Math.max(1000,(s.retryAt||0)-host.now()));
  const featureBody=get('featured'),featured=featureBody?unpack(featureBody):null;
  const at=host.now(),day=services.day(at);
  const scopeKey=[period,day,view.snapshotAt,s.featuredAt].join('|');
  let value=scoped.get(scopeKey);if(!value){value=services.scope(sport,period,view,featured,at);if(scoped.size>=5)scoped.delete(scoped.keys().next().value);scoped.set(scopeKey,value);}
  return {...value,refreshing:stale||!s.archiveAt||view.coverage.complete===false,
   cache:{status:stale?'stale':s.archiveAt?'cached':'warming',protectedCheckedAt:new Date(s.protectedAt).toISOString(),archiveCheckedAt:s.archiveAt?new Date(s.archiveAt).toISOString():null,lastError:s.lastError||null,revision:s.revision},snapshotAt:view.snapshotAt,scopeDay:day,scopeAt:at};
 }
 async function response(sport,period,market=null,group=null){
  // Serialize once inside the owning object. Returning a string avoids repeated
  // RPC cloning/reconciliation of the complete archive for concurrent readers.
  if(market!==null&&(typeof market!=='string'||market.length>80)||group!==null&&(typeof group!=='string'||group.length>80))throw Error('invalid_performance_filter');
  const view=await read(sport,period),key=JSON.stringify([period,market,group,view.scopeDay,view.snapshotAt,view.cache]);
  const prior=responses.get(key);if(prior)return prior;
  const body=JSON.stringify(services.response(view,sport,period,market,group,null,view.scopeAt)),bytes=Buffer.byteLength(body);
  if(bytes>maxViewBytes)throw Error('performance_response_capacity');
  while(responses.size>=8||responseBytes+bytes>maxViewBytes){const first=responses.keys().next().value;if(first===undefined)break;responseBytes-=Buffer.byteLength(responses.get(first));responses.delete(first);}
  responses.set(key,body);responseBytes+=bytes;return body;
 }
 async function invalidate(sport){const s=check(sport)||{sport,revision:0,protectedAt:0,archiveAt:0,featuredAt:0,stalled:0};save({...s,revision:s.revision+1,dirty:true,retryAt:null});await arm(1000);return {queued:true,revision:s.revision+1};}
 async function alarm(){
  let s=state();if(!s)return false;
  const existing=host.meta('performance-lease');if(existing?.until>host.now()){await arm(existing.until-host.now());return true;}
  const token=crypto.randomUUID();host.setMeta('performance-lease',{token,until:host.now()+30000});
  let sources=0,scopeSignal;
  const active=()=>{if(scopeSignal?.aborted||host.meta('performance-lease')?.token!==token)throw Error('performance_refresh_cancelled');};
  const sourceCache={project:services.project,
   read(key,revision){active();const body=get('source:'+hash(key));if(!body)return null;const item=unpack(body,maxSourceBytes);if(item.key!==key||item.revision!==revision||hash(JSON.stringify(item.doc))!==item.sha)return null;return item.doc;},
   write(key,revision,doc){active();const item={key,revision,doc,sha:hash(JSON.stringify(doc))};if(Buffer.byteLength(JSON.stringify(item))>maxSourceBytes)throw Error('performance_source_capacity');const stream='source:'+hash(key);put(stream,item);sources++;},
  };
  try{
   const result=await runBudget({env:host.env,store:{},gate:(origin,until)=>host.env.DASHBOARD_JOBS.getByName('provider:'+origin).gate(origin,until),concurrency:2,limit:220,deadlineMs:20000,requestTimeoutMs:5000},async(_env,scope)=>{
    scopeSignal=scope.abort.signal;
    const startedRevision=s.revision;
    const obsolete=()=>state()?.revision!==startedRevision;
    const protectedBody=get('protected');
    const checkProtected=s.dirty||!protectedBody||host.now()-s.protectedAt>=60000;
    const protectedView=checkProtected?await protectedRead(s.sport,startedRevision):unpack(protectedBody);
    active();
    if(obsolete())return {sources,complete:false};
    put('protected',protectedView);
    const previous=cached();
    // Publish genuine new picks/grades independently of slow archives.
    const fresh=services.merge(previous,previous||protectedView,protectedView,host.now());
    fresh.snapshotAt=new Date(host.now()).toISOString();writeView(fresh);
    const revision=startedRevision;
    s={...state(),protectedAt:checkProtected?host.now():s.protectedAt,dirty:(state()?.revision??revision)!==revision};save(s);
    if(!s.featuredAt||host.now()-s.featuredAt>=300000){
     const featured=await services.featured(s.sport,host.now());active();if(obsolete())return {sources,complete:false};put('featured',featured);s={...state(),featuredAt:host.now()};save(s);return {sources:0,complete:cached().coverage.complete};
    }
    if(!s.archiveAt||host.now()-s.archiveAt>=300000||s.archivePartial){
     const derived=await services.refresh(s.sport,host.now(),sourceCache,protectedView);active();if(obsolete())return {sources,complete:false};
     const merged=services.merge(cached(),derived,protectedView,host.now());merged.snapshotAt=new Date(host.now()).toISOString();
     const errors=derived.coverage.errors||[];merged.coverage={...derived.coverage,errorCount:errors.length,errors:errors.slice(0,32)};
     writeView(merged);const checking=errors.some(e=>e.endsWith(':checking'));
     s={...state(),archiveAt:host.now(),archivePartial:!derived.coverage.complete,checking,stalled:sources?0:(s.stalled||0)+1,lastError:errors.find(e=>!e.endsWith(':checking'))||null};save(s);
    }
    return {sources,complete:cached().coverage.complete};
   },withEnvironment);
   s={...state(),usage:result.usage,lastError:state().lastError||null};save(s);
  }catch(error){
   const latest=state()||s;s={...latest,stalled:sources?0:(latest.stalled||0)+1,lastError:/^[a-z0-9_ .:-]{1,100}$/i.test(error.message)?error.message:'performance_refresh_unavailable',usage:error.usage||null,retryAt:Math.max(error.retryAt||0,host.now())};save(s);
  }finally{
   if(host.meta('performance-lease')?.token===token)host.setMeta('performance-lease',null);
  }
  s=state();
  if((s.retryAt||0)>host.now()){await host.ctx.storage.setAlarm(s.retryAt);return true;}
  // Continue only while verified source checkpoints advance. Failures back off
  // explicitly; no browser retry is needed to resume the work after eviction.
  if(s.stalled<3&&(s.dirty||!s.archiveAt||sources>0&&s.archivePartial||s.checking))await arm(1000);
  else if(s.archivePartial||s.lastError){save({...s,retryAt:host.now()+15*60000});await host.ctx.storage.setAlarm(host.now()+15*60000);}
  return true;
 }
 return {read,response,invalidate,alarm,state};
}
