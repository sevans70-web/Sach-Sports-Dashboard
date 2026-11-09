import {checksum,cloudRequest} from './history-cloud.mjs';
import {driveArchive} from './worker-history-backup.mjs';
import {driveAuth} from './drive-auth.mjs';

const TABLES=['worker_pregame_originals','worker_pregame_picks','worker_pregame_grades'];
const SPORTS=new Set(['nba','nfl','nhl','cfb','cbb']);
const PAGE_SIZE=100,PART_LIMIT=2*1024*1024-8192,MAX_RECORDS=6000;

function sourceIdentity(table,row,sport,day){
 if(!TABLES.includes(table)||row?.sport!==sport||row?.game_date!==day||
  !/^\d+$/.test(String(row?.game_id||''))||!/^\d+$/.test(String(row?.player_id||''))||
  !/^[a-z0-9_]{1,64}$/.test(String(row?.market||'')))throw Error('Invalid pregame backup source record');
 if(table!=='worker_pregame_grades'){
  const tip=Date.parse(row.game_time),capture=Date.parse(row.captured_at);
  if(!Number.isFinite(tip)||!Number.isFinite(capture)||capture>=tip||
    !/^[a-f0-9]{64}$/.test(String(row.checksum||'')))throw Error('Invalid pregame quote original');
 }else if(!['hit','miss','push'].includes(String(row.result_status)))throw Error('Invalid original grade');
 return [table,row.market,row.game_id,row.player_id].join('|');
}

/** All immutable originals and official grades are archived independently of
 * Railway's volume. No Supabase records are changed or deleted.
 * Every Google Drive part and manifest is verified by re-downloading its bytes.
 */
export async function archiveWorkerPregameDay(env,{sport,day},requestCloud=cloudRequest,authenticate=driveAuth,visit){
 if(!SPORTS.has(sport)||!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error('Invalid pregame backup scope');
 let reads=0;
 const inventory=async()=>{
  const combined=[],seen=new Set();
  for(const table of TABLES){
   for(let offset=0;;offset+=PAGE_SIZE){
    if(++reads>160)throw Error('Pregame backup read budget exceeded');
    const query=new URLSearchParams({select:'*',sport:'eq.'+sport,game_date:'eq.'+day,
     order:'market.asc,game_id.asc,player_id.asc',limit:String(PAGE_SIZE),offset:String(offset)});
    const page=await requestCloud(table+'?'+query.toString(),{signal:AbortSignal.timeout(15000)});
    if(!Array.isArray(page))throw Error('Invalid pregame backup inventory');
    for(const row of page){
     const key=sourceIdentity(table,row,sport,day);
     if(seen.has(key))throw Error('Duplicate original pregame receipt in backup');
     seen.add(key);
     combined.push({table,row});
     if(combined.length>MAX_RECORDS)throw Error('Pregame backup exceeds safe record budget');
    }
    if(page.length<PAGE_SIZE)break;
   }
  }
  return combined;
 };
 const rows=await inventory();
 if(!rows.length)return {sport,day,records:0,parts:0,bytes:0};
 const fingerprint=checksum(rows),{storeVerified,readVerified}=driveArchive(env,authenticate);
 const prefix='cloudflare-staging-pregame-v1-'+sport+'-'+day,parts=[];
 let current=[],size=0;
 const flush=async()=>{
  if(!current.length)return;
  const body=JSON.stringify({version:1,sport,day,records:current});
  if(Buffer.byteLength(body)>2*1024*1024)throw Error('Pregame Drive backup part too large');
  const saved=await storeVerified(prefix+'-part-'+(parts.length+1),body);
  parts.push({...saved,records:current.length});
  current=[];size=0;
 };
 for(const item of rows){
  const length=Buffer.byteLength(JSON.stringify(item))+2;
  if(length>PART_LIMIT)throw Error('Single original pregame record too large');
  if(current.length&&size+length>PART_LIMIT)await flush();
  current.push(item);size+=length;
 }
 await flush();
 if(checksum(await inventory())!==fingerprint)throw Error('Original pregame inventory changed during verified backup');
 const receipt=await storeVerified(prefix+'-manifest',JSON.stringify({version:1,sport,day,records:rows.length,sourceChecksum:fingerprint,parts}));
 let restored=null;
 if(visit){
  const manifest=JSON.parse(await readVerified(receipt));
  if(manifest.version!==1||manifest.sport!==sport||manifest.day!==day||manifest.records!==rows.length||manifest.sourceChecksum!==fingerprint)throw Error('Invalid pregame recovery manifest');
  const recovered=[];
  for(const part of manifest.parts){
   const recoveredPart=JSON.parse(await readVerified(part));
   if(recoveredPart.version!==1||recoveredPart.sport!==sport||recoveredPart.day!==day||!Array.isArray(recoveredPart.records)||recoveredPart.records.length!==part.records)throw Error('Invalid pregame backup restore part');
   for(const item of recoveredPart.records){
    sourceIdentity(item.table,item.row,sport,day);
    recovered.push(item);
   }
  }
  if(checksum(recovered)!==fingerprint)throw Error('Pregame restore checksum mismatch');
  for(const item of recovered)visit(item);
  restored=recovered.length;
 }
 return {sport,day,records:rows.length,parts:parts.length,bytes:parts.reduce((sum,x)=>sum+x.bytes,0),restored};
}
