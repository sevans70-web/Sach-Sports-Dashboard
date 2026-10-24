import {createHash} from 'node:crypto';
export function canonical(value){if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';return JSON.stringify(value);}
export const checksum=value=>createHash('sha256').update(canonical(JSON.parse(JSON.stringify(value)))).digest('hex');
export function cloudConfigured(){return Boolean((process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL)&&(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_KEY));}
export async function cloudRequest(route,options={}){
 const base=(process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL||'').replace(/\/$/,''),key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_KEY;
 if(!base||!key)throw Error('Cloud history is not configured');
 const headers={apikey:key,'Content-Type':'application/json',...options.headers};if(!key.startsWith('sb_secret_'))headers.Authorization='Bearer '+key;
 const r=await fetch(base+'/rest/v1/'+route,{...options,headers,signal:AbortSignal.timeout(20000),cache:'no-store'});if(!r.ok)throw Error('Cloud history HTTP '+r.status);const text=await r.text();return text?JSON.parse(text):null;
}
export async function saveCloudDocument(sport,stream,day,payload,bytes=0){
 const hash=checksum(payload),scope=`sport=eq.${encodeURIComponent(sport)}&stream=eq.${encodeURIComponent(stream)}&game_date=eq.${day}`;
 await cloudRequest('history_documents?on_conflict=sport,stream,game_date',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({sport,stream,game_date:day,checksum:hash,payload,source_bytes:bytes,updated_at:new Date().toISOString()})});
 const rows=await cloudRequest('history_documents?select=checksum,payload&'+scope);
 if(rows?.[0]?.checksum!==hash||checksum(rows[0].payload)!==hash)throw Error('Cloud history round-trip checksum mismatch');return true;
}
export async function readCloudDocument(sport,stream,day){const rows=await cloudRequest(`history_documents?select=payload,checksum&sport=eq.${encodeURIComponent(sport)}&stream=eq.${encodeURIComponent(stream)}&game_date=eq.${day}`);const row=rows?.[0];if(!row)return null;if(checksum(row.payload)!==row.checksum)throw Error('Cloud history checksum mismatch');return row.payload;}
export async function listCloudDocuments(sport){
 const rows=[];for(let offset=0;;offset+=100){const page=await cloudRequest(`history_documents?select=stream,game_date,payload,checksum&sport=eq.${encodeURIComponent(sport)}&order=game_date.asc,stream.asc&limit=100&offset=${offset}`);for(const row of page){if(checksum(row.payload)!==row.checksum)throw Error('Cloud history checksum mismatch');rows.push(row);}if(page.length<100)break;}return rows;
}
