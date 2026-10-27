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
const state=globalThis[stateKey]??(globalThis[stateKey]={pending:new Map(),documents:new Map(),stats:new Map()});
const pendingCloudSaves=state.pending,documentWrites=state.documents,writeStats=state.stats;
export function cloudWriteStatus(){return {configured:cloudConfigured(),pendingDocuments:documentWrites.size,sports:Object.fromEntries([...writeStats].map(([sport,value])=>[sport,{...value}]))};}
export async function saveCloudDocument(sport,stream,day,payload,bytes=0,sourceUpdatedAt){
 let stats=writeStats.get(sport);if(!stats){stats={attempted:0,verified:0,failed:0,coalesced:0};writeStats.set(sport,stats);}stats.attempted++;
 const snapshot=JSON.parse(JSON.stringify(payload)),hash=checksum(snapshot);
 const sourceTime=sourceUpdatedAt??new Date().toISOString();
 // Implicit timestamps describe invocation time, not a distinct source version.
 const key=JSON.stringify([sport,stream,day,hash,bytes,sourceUpdatedAt??null]);
 const documentKey=JSON.stringify([sport,stream,day]);
 const existing=pendingCloudSaves.get(key);
 // A -> B -> A must write the last A, rather than join the first A.
 if(existing&&documentWrites.get(documentKey)===existing){stats.coalesced++;return existing;}
 const previous=documentWrites.get(documentKey)??Promise.resolve();
 const work=previous.catch(()=>{}).then(async()=>{
  const scope=`sport=eq.${encodeURIComponent(sport)}&stream=eq.${encodeURIComponent(stream)}&game_date=eq.${day}`;
  await cloudRequest('rpc/write_history_document',{method:'POST',body:JSON.stringify({p_sport:sport,p_stream:stream,p_day:day,p_checksum:hash,p_payload:snapshot,p_source_bytes:bytes,p_source_updated_at:sourceTime})});
  const rows=await cloudRequest('history_documents?select=checksum,payload&'+scope);
  if(rows?.[0]?.checksum!==hash||checksum(rows[0].payload)!==hash)throw Error('Cloud history round-trip checksum mismatch');
  return true;
 });
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


/** Performance reads omit bulky ranking boards and raw player-log archives. */
async function fetchCloudPerformanceDocuments(sport){
 if(!/^[a-z0-9_-]+$/i.test(sport))throw Error('Invalid history sport');
 // Runs in the performance view's background reconciliation, not its cold response.
 const rows=[],errors=[],signal=AbortSignal.timeout(20000);
 for(let offset=0;;offset+=100){
  let page;try{page=await cloudRequest(`history_documents?select=stream,game_date,payload,checksum&sport=eq.${sport}&stream=not.like.featured_selections*&stream=not.like.featured_results*&or=(stream.not.like.protected_*,stream.like.protected_final_*,stream.like.protected_pregame_*)&stream=not.like.performance_view_*&stream=not.like.player_history_*&order=game_date.asc,stream.asc&limit=100&offset=${offset}`,{signal});}catch(e){return {rows,errors:[...errors,typeof e.code==='string'?'unavailable:'+e.code:'unavailable']};}
  for(const row of page){if(checksum(row.payload)!==row.checksum){errors.push(row.stream+'|'+row.game_date);continue;}rows.push(row);}
  if(page.length<100)return {rows,errors};
 }
}

const performanceReads=new Map(),performanceCache=new Map();
export async function listCloudPerformanceDocuments(sport){
 const cached=performanceCache.get(sport);if(cached&&Date.now()-cached.at<(cached.value.errors.length?5000:15000))return cached.value;
 let work=performanceReads.get(sport);
 if(!work){work=fetchCloudPerformanceDocuments(sport).then(value=>{performanceCache.set(sport,{at:Date.now(),value});return value;}).finally(()=>performanceReads.delete(sport));performanceReads.set(sport,work);}
 return work;
}

export async function readCloudDocumentRange(sport,stream,first,last){
 if(!/^[a-z0-9_-]+$/i.test(sport)||!/^[a-z0-9_-]+$/i.test(stream)||![first,last].every(d=>/^\d{4}-\d{2}-\d{2}$/.test(d))||first>last)throw Error('Invalid history range');
 const rows=[];
 for(let offset=0;;offset+=100){const page=await cloudRequest(`history_documents?select=stream,game_date,payload,checksum&sport=eq.${sport}&stream=eq.${stream}&game_date=gte.${first}&game_date=lte.${last}&order=game_date.asc&limit=100&offset=${offset}`,{signal:AbortSignal.timeout(2500)});for(const row of page){if(checksum(row.payload)!==row.checksum)throw Error('Cloud history checksum mismatch');rows.push(row);}if(page.length<100)return rows;}
}
