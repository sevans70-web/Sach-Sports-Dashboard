import {createHash} from 'node:crypto';
export function canonical(value){if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';return JSON.stringify(value);}
export const checksum=value=>createHash('sha256').update(canonical(JSON.parse(JSON.stringify(value)))).digest('hex');
export function cloudConfigured(){return Boolean((process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL)&&(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_KEY));}
export async function cloudRequest(route,options={}){
 const base=(process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL||'').replace(/\/$/,''),key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_KEY;
 if(!base||!key)throw Error('Cloud history is not configured');
 const headers={apikey:key,'Content-Type':'application/json',...options.headers};if(!key.startsWith('sb_secret_'))headers.Authorization='Bearer '+key;
 const r=await fetch(base+'/rest/v1/'+route,{...options,headers,signal:options.signal??AbortSignal.timeout(20000),cache:'no-store'});if(!r.ok){const body=await r.text();let code;try{const parsed=JSON.parse(body);if(/^[A-Z0-9_]{1,24}$/.test(parsed.code||''))code=parsed.code;}catch{}const error=Error('Cloud history HTTP '+r.status+(code?' ('+code+')':''));error.status=r.status;if(code)error.code=code;throw error;}const text=await r.text();return text?JSON.parse(text):null;
}
// Snapshot caller-owned payloads, coalesce identical concurrent saves, and order
// each document's writes through verification. Never cache a successful save.
// Next.js may evaluate this module in multiple route chunks. Share the queues
// across those instances so verification ordering holds for the whole process.
const stateKey=Symbol.for('sach.history.cloudWrites.v1');
const state=globalThis[stateKey]??(globalThis[stateKey]={pending:new Map(),documents:new Map(),stats:new Map(),active:0,waiting:[]});
state.active??=0;state.waiting??=[];
async function withCloudSaveSlot(work){
 if(state.active>=4)await new Promise(resolve=>state.waiting.push(resolve));else state.active++;
 try{return await work();}finally{const next=state.waiting.shift();if(next)next();else state.active--;}
}
const pendingCloudSaves=state.pending,documentWrites=state.documents,writeStats=state.stats;
export function cloudWriteStatus(){return {configured:cloudConfigured(),pendingDocuments:documentWrites.size,activeSaves:state.active,queuedSaves:state.waiting.length,sports:Object.fromEntries([...writeStats].map(([sport,value])=>[sport,{...value}]))};}
export async function saveCloudDocument(sport,stream,day,payload,bytes=0,sourceUpdatedAt){
 let stats=writeStats.get(sport);if(!stats){stats={attempted:0,verified:0,failed:0,coalesced:0,retried:0};writeStats.set(sport,stats);}stats.attempted++;
 const snapshot=JSON.parse(JSON.stringify(payload)),hash=checksum(snapshot);
 const sourceTime=sourceUpdatedAt??new Date().toISOString();
 // Implicit timestamps describe invocation time, not a distinct source version.
 const key=JSON.stringify([sport,stream,day,hash,bytes,sourceUpdatedAt??null]);
 const documentKey=JSON.stringify([sport,stream,day]);
 const existing=pendingCloudSaves.get(key);
 // A -> B -> A must write the last A, rather than join the first A.
 if(existing&&documentWrites.get(documentKey)===existing){stats.coalesced++;return existing;}
 const previous=documentWrites.get(documentKey)??Promise.resolve();
 const work=previous.catch(()=>{}).then(()=>withCloudSaveSlot(async()=>{
  const scope=`sport=eq.${encodeURIComponent(sport)}&stream=eq.${encodeURIComponent(stream)}&game_date=eq.${day}`;
  for(let attempt=0;;attempt++){try{
  await cloudRequest('rpc/write_history_document',{method:'POST',body:JSON.stringify({p_sport:sport,p_stream:stream,p_day:day,p_checksum:hash,p_payload:snapshot,p_source_bytes:bytes,p_source_updated_at:sourceTime})});
  const rows=await cloudRequest('history_documents?select=checksum,payload&'+scope);
  if(rows?.[0]?.checksum!==hash||checksum(rows[0].payload)!==hash)throw Error('Cloud history round-trip checksum mismatch');
  return true;
  }catch(e){
   const transient=['TimeoutError','AbortError'].includes(e?.name)||[429,502,503,504].includes(e?.status);
   if(attempt||!transient)throw e;
   stats.retried++;await new Promise(resolve=>setTimeout(resolve,500));
  }}
 }));
 pendingCloudSaves.set(key,work);documentWrites.set(documentKey,work);
 try{const result=await work;stats.verified++;return result;}catch(e){stats.failed++;throw e;}finally{
  if(pendingCloudSaves.get(key)===work)pendingCloudSaves.delete(key);
  if(documentWrites.get(documentKey)===work)documentWrites.delete(documentKey);
 }
}
export async function readCloudDocument(sport,stream,day){const rows=await cloudRequest(`history_documents?select=payload,checksum&sport=eq.${encodeURIComponent(sport)}&stream=eq.${encodeURIComponent(stream)}&game_date=eq.${day}`,{signal:AbortSignal.timeout(2500)});const row=rows?.[0];if(!row)return null;if(checksum(row.payload)!==row.checksum)throw Error('Cloud history checksum mismatch');return row.payload;}
export async function listCloudDocuments(sport){
 const rows=[];for(let offset=0;;offset+=100){const page=await cloudRequest(`history_documents?select=stream,game_date,payload,checksum&sport=eq.${encodeURIComponent(sport)}&order=game_date.asc,stream.asc&limit=100&offset=${offset}`);for(const row of page){if(checksum(row.payload)!==row.checksum)throw Error('Cloud history checksum mismatch');rows.push(row);}if(page.length<100)break;}return rows;
}

/** Indexed current-day reads for small dashboard views; never scan a sport archive. */
export async function readCloudDocumentsForDay(sport,streams,day){
 if(!cloudConfigured()||!streams.length)return [];
 if(!/^[a-z0-9_-]+$/i.test(sport)||!/^\d{4}-\d{2}-\d{2}$/.test(day)||streams.some(s=>!(/^[a-z0-9_-]+$/i.test(s))))throw Error('Invalid history scope');
 const rows=await cloudRequest(`history_documents?select=stream,game_date,payload,checksum&sport=eq.${sport}&game_date=eq.${day}&stream=in.(${streams.join(',')})`,{signal:AbortSignal.timeout(2500)});
 for(const row of rows){if(checksum(row.payload)!==row.checksum)throw Error('Cloud history checksum mismatch');}
 return rows;
}


/** Enumerate lightweight metadata before reading any JSON payload. A broad
 * json_agg of 100 full boards can exhaust the database's statement budget. */
const readStateKey=Symbol.for('sach.history.performanceReads.v2');
const readState=globalThis[readStateKey]??(globalThis[readStateKey]={pending:new Map(),cache:new Map(),documents:new Map(),failures:new Map(),active:0,waiting:[]});
async function performanceReadSlot(work){
 if(readState.active>=2)await new Promise(resolve=>readState.waiting.push(resolve));else readState.active++;
 try{return await work();}finally{const next=readState.waiting.shift();if(next)next();else readState.active--;}
}
async function fetchCloudPerformanceDocuments(sport,firstDay){
 if(!/^[a-z0-9_-]+$/i.test(sport))throw Error('Invalid history sport');
 const metadata=[],errors=[],rows=[];
 const scope=`sport=eq.${sport}&${firstDay?`game_date=gte.${firstDay}&`:''}stream=not.like.featured_selections*&stream=not.like.featured_results*&or=(stream.not.like.protected_*,stream.like.protected_final_*,stream.like.protected_pregame_*)&stream=not.like.performance_view_*&stream=not.like.player_history_*`;
 const failure=e=>typeof e.code==='string'?'unavailable:'+e.code:'unavailable';
 try{
  for(let offset=0;;offset+=200){
   const page=await performanceReadSlot(()=>cloudRequest(`history_documents?select=stream,game_date,checksum,source_bytes&${scope}&order=game_date.asc,stream.asc&limit=200&offset=${offset}`,{signal:AbortSignal.timeout(10000)}));
   metadata.push(...page);if(page.length<200)break;
  }
 }catch(e){return {rows:readState.cache.get(sport)?.value.rows||[],errors:[failure(e)]};}
 const seen=new Set(),started=Date.now();
 const unique=metadata.filter(meta=>{const key=[sport,meta.stream,meta.game_date].join('|');if(seen.has(key))return false;seen.add(key);return true;});
 // Two workers overlap network latency, while performanceReadSlot keeps the
 // total database read concurrency capped at two across every sport.
 let next=0;
 const load=async()=>{
  while(next<unique.length){
   const meta=unique[next++],key=[sport,meta.stream,meta.game_date].join('|');
   const cached=readState.documents.get(key);
   if(cached?.checksum===meta.checksum){rows.push(cached);continue;}
   if(Date.now()-started>=60000){errors.push(meta.stream+'|'+meta.game_date+':checking');continue;}
   if(Date.now()-(readState.failures.get(key)||0)<300000){errors.push(meta.stream+'|'+meta.game_date+':unavailable');continue;}
   try{
    const page=await performanceReadSlot(()=>cloudRequest(`history_documents?select=stream,game_date,payload,checksum&sport=eq.${sport}&stream=eq.${encodeURIComponent(meta.stream)}&game_date=eq.${meta.game_date}&limit=1`,{signal:AbortSignal.timeout(10000)}));
    const row=page?.[0];
    if(!row||row.stream!==meta.stream||row.game_date!==meta.game_date||checksum(row.payload)!==row.checksum){errors.push(meta.stream+'|'+meta.game_date);continue;}
    readState.failures.delete(key);readState.documents.set(key,row);rows.push(row);
   }catch(e){readState.failures.set(key,Date.now());errors.push(meta.stream+'|'+meta.game_date+':'+failure(e));}
   await new Promise(resolve=>setImmediate(resolve));
  }
 };
 await Promise.all([load(),load()]);
 return {rows,errors};
}
export async function listCloudPerformanceDocuments(sport,firstDay){
 if(firstDay&&!/^\d{4}-\d{2}-\d{2}$/.test(firstDay))throw Error('Invalid history cutoff');
 const scopeKey=sport+'|'+(firstDay||'all');
 const cached=readState.cache.get(scopeKey);if(cached&&Date.now()-cached.at<60000)return cached.value;
 let work=readState.pending.get(scopeKey);
 if(!work){work=fetchCloudPerformanceDocuments(sport,firstDay).then(value=>{readState.cache.set(scopeKey,{at:Date.now(),value});return value;}).finally(()=>readState.pending.delete(scopeKey));readState.pending.set(scopeKey,work);}
 return work;
}

export async function readCloudDocumentRange(sport,stream,first,last){
 if(!/^[a-z0-9_-]+$/i.test(sport)||!/^[a-z0-9_-]+$/i.test(stream)||![first,last].every(d=>/^\d{4}-\d{2}-\d{2}$/.test(d))||first>last)throw Error('Invalid history range');
 const rows=[];
 for(let offset=0;;offset+=100){const page=await cloudRequest(`history_documents?select=stream,game_date,payload,checksum&sport=eq.${sport}&stream=eq.${stream}&game_date=gte.${first}&game_date=lte.${last}&order=game_date.asc&limit=100&offset=${offset}`,{signal:AbortSignal.timeout(2500)});for(const row of page){if(checksum(row.payload)!==row.checksum)throw Error('Cloud history checksum mismatch');rows.push(row);}if(page.length<100)return rows;}
}
