import {createHash} from 'node:crypto';
export function canonical(value){if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';return JSON.stringify(value);}
export const checksum=value=>createHash('sha256').update(canonical(JSON.parse(JSON.stringify(value)))).digest('hex');
export function cloudConfigured(){return Boolean((process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL)&&(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_KEY));}
export async function cloudRequest(route,options={}){
 const base=(process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL||'').replace(/\/$/,''),key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_KEY;
 if(!base||!key)throw Error('Cloud history is not configured');
 const headers={apikey:key,'Content-Type':'application/json',...options.headers};if(!key.startsWith('sb_secret_'))headers.Authorization='Bearer '+key;
 const r=await fetch(base+'/rest/v1/'+route,{...options,headers,signal:options.signal??AbortSignal.timeout(20000),cache:'no-store'});if(!r.ok)throw Error('Cloud history HTTP '+r.status);const text=await r.text();return text?JSON.parse(text):null;
}
export async function saveCloudDocument(sport,stream,day,payload,bytes=0,sourceUpdatedAt=new Date().toISOString()){
 const hash=checksum(payload),scope=`sport=eq.${encodeURIComponent(sport)}&stream=eq.${encodeURIComponent(stream)}&game_date=eq.${day}`;
 await cloudRequest('rpc/write_history_document',{method:'POST',body:JSON.stringify({p_sport:sport,p_stream:stream,p_day:day,p_checksum:hash,p_payload:payload,p_source_bytes:bytes,p_source_updated_at:sourceUpdatedAt})});
 const rows=await cloudRequest('history_documents?select=checksum,payload&'+scope);
 if(rows?.[0]?.checksum!==hash||checksum(rows[0].payload)!==hash)throw Error('Cloud history round-trip checksum mismatch');return true;
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
 const rows=[],errors=[],signal=AbortSignal.timeout(2500);
 for(let offset=0;;offset+=100){
  let page;try{page=await cloudRequest(`history_documents?select=stream,game_date,payload,checksum&sport=eq.${sport}&stream=not.like.featured_*&stream=not.like.slate_board_*&stream=not.like.restored_slate_board_*&stream=not.like.protected_*&stream=not.like.performance_view_*&stream=not.like.player_history_*&stream=not.like.slate_locked_*&stream=not.like.locked_research_*&order=game_date.asc,stream.asc&limit=100&offset=${offset}`,{signal});}catch{return {rows,errors:[...errors,'unavailable']};}
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
