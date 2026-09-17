import {cleanName,type NflMarketKey} from "@/lib/nfl";

export type SavedNflPrediction={
  key:string; gameDate:string; gameTime:string; matchup:string; market:NflMarketKey;
  gameId?:string;
  playerId:string; playerName:string; teamName:string; position?:string;
  teamId?:string; teamLogo?:string; headshot?:string;
  sportsbookLine:number|null; sportsbookProbability?:number|null; modelProjection:number|null; modelProbability:number|null; pickSide?:"OVER"|"UNDER";
  giScore:number; bookmakerCount:number; savedAt:string;
  originalRank?:number|null; lastSeenRank?:number|null; lastSeenAt?:string|null;
  status:"pending"|"hit"|"miss"|"push"|"void"; actual:number|null; gradedAt:string|null;
  recoveredAfterStart?:boolean;
};

const SOURCE_PREFIX="nfl_predictions_";
function supabaseUrl(){return (process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL||"").replace(/\/$/,"");}
function candidateKeys(){
  // Server-side credentials must win. A public/anon key can be present on Railway
  // while RLS blocks source_snapshots, which previously made NFL silently report 0/0.
  return [process.env.SUPABASE_SECRET_KEY,process.env.SUPABASE_SERVICE_ROLE_KEY,process.env.SUPABASE_KEY,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY]
    .map(v=>String(v||"").trim()).filter((v,i,a)=>Boolean(v)&&a.indexOf(v)===i);
}
function readConfig(){const keys=candidateKeys();return {url:supabaseUrl(),key:keys[0]||"",keys};}
function writeConfig(){const keys=candidateKeys();return {url:supabaseUrl(),key:keys[0]||"",keys};}
function headers(key:string,prefer="return=representation"){
 const h:any={apikey:key,"Content-Type":"application/json",Accept:"application/json",Prefer:prefer};
 if(!key.startsWith("sb_secret_")&&!key.startsWith("sb_publishable_"))h.Authorization=`Bearer ${key}`;
 return h;
}
const STORAGE_TIMEOUT_MS=1800;
const STORAGE_COOLDOWN_MS=60_000;
let storageUnavailableUntil=0;
function storageCooling(){return Date.now()<storageUnavailableUntil}
function tripStorageCircuit(){storageUnavailableUntil=Date.now()+STORAGE_COOLDOWN_MS}
async function fetchStorage(url:string,init:RequestInit){
 const controller=new AbortController();
 const id=setTimeout(()=>controller.abort(),STORAGE_TIMEOUT_MS);
 try{return await fetch(url,{...init,signal:controller.signal,cache:"no-store"})}
 finally{clearTimeout(id)}
}
export function nflDay(v:Date|string){
 const d=typeof v==="string"?new Date(v):v;if(Number.isNaN(d.getTime()))return "";
 const p=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Toronto",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d);
 const g=(t:string)=>p.find(x=>x.type===t)?.value||"";return `${g("year")}-${g("month")}-${g("day")}`;
}
function source(m:NflMarketKey){return `${SOURCE_PREFIX}${m}`}
async function getRows(m:NflMarketKey,day:string){
 const {url,keys}=readConfig();if(!url||!keys.length)return {connected:false,writable:false,rows:[] as any[],reason:"not_configured"};
 if(storageCooling())return {connected:false,writable:false,rows:[] as any[],reason:"temporarily_unreachable"};
 const q=`source_snapshots?select=id,source_name,game_date,payload,created_at&source_name=eq.${encodeURIComponent(source(m))}&game_date=eq.${encodeURIComponent(day)}&order=created_at.desc&limit=25`;
 for(const key of keys){
   try{
     const r=await fetchStorage(`${url}/rest/v1/${q}`,{headers:headers(key)});
     if(r.ok){const a=await r.json();return {connected:true,writable:true,rows:Array.isArray(a)?a:[],reason:"ok"}}
     const detail=(await r.text().catch(()=>"")).slice(0,220);
     console.error("[NFL Supabase read]",{status:r.status,market:m,day,detail});
     if(r.status===401||r.status===403)continue;
     if(r.status>=500||r.status===408||r.status===429){tripStorageCircuit();return {connected:false,writable:false,rows:[] as any[],reason:"temporarily_unreachable"}}
     return {connected:false,writable:false,rows:[] as any[],reason:"read_failed"};
   }catch(error){
     console.error("[NFL Supabase read exception]",{market:m,day,error:error instanceof Error?error.message:String(error)});
     tripStorageCircuit();return {connected:false,writable:false,rows:[] as any[],reason:"temporarily_unreachable"};
   }
 }
 return {connected:false,writable:false,rows:[] as any[],reason:"auth_failed"};
}
function mergeSnapshotPredictions(rows:any[]){
 const merged=new Map<string,SavedNflPrediction>();
 for(const row of rows){
   const predictions=Array.isArray(row?.payload?.predictions)?row.payload.predictions:[];
   for(const raw of predictions){
     if(!raw?.key)continue;
     const next=raw as SavedNflPrediction,old=merged.get(next.key);
     if(!old){merged.set(next.key,{...next});continue}
     // Preserve the original frozen prediction. Later snapshots may only update
     // metadata/rank or carry the final grade; they must not rewrite the bet line.
     merged.set(next.key,{...old,
       playerName:next.playerName||old.playerName,teamName:next.teamName||old.teamName,position:next.position||old.position,
       teamId:next.teamId||old.teamId,teamLogo:next.teamLogo||old.teamLogo,headshot:next.headshot||old.headshot,
       gameTime:old.gameTime||next.gameTime,matchup:old.matchup||next.matchup,gameId:old.gameId||next.gameId,sportsbookProbability:old.sportsbookProbability??next.sportsbookProbability,
       lastSeenRank:next.lastSeenRank??old.lastSeenRank,lastSeenAt:next.lastSeenAt??old.lastSeenAt,
       status:next.status&&next.status!=="pending"?next.status:old.status,
       actual:next.actual!=null?next.actual:old.actual,gradedAt:next.gradedAt||old.gradedAt});
   }
 }
 return [...merged.values()];
}
async function getRow(m:NflMarketKey,day:string){
 const x=await getRows(m,day),row=x.rows.length?x.rows[0]:null;
 return {connected:x.connected,writable:x.writable,row,rows:x.rows,reason:x.reason};
}
async function writeRow(m:NflMarketKey,day:string,predictions:SavedNflPrediction[],id?:string){
 const {url,keys}=writeConfig();if(!url||!keys.length)return false;
 if(storageCooling())return false;
 const body=JSON.stringify({source_name:source(m),game_date:day,payload:{predictions},created_at:new Date().toISOString()});
 const endpoint=id?`${url}/rest/v1/source_snapshots?id=eq.${encodeURIComponent(id)}`:`${url}/rest/v1/source_snapshots`;
 for(const key of keys){
   try{
     const r=await fetchStorage(endpoint,{method:id?"PATCH":"POST",headers:headers(key,"return=minimal"),body});
     if(r.ok)return true;
     const detail=(await r.text().catch(()=>"")).slice(0,220);
     console.error("[NFL Supabase write]",{status:r.status,market:m,day,mode:id?"PATCH":"POST",detail});
     if(r.status===401||r.status===403)continue;
     if(r.status>=500||r.status===408||r.status===429){tripStorageCircuit();return false}
     return false;
   }catch(error){
     console.error("[NFL Supabase write exception]",{market:m,day,error:error instanceof Error?error.message:String(error)});
     tripStorageCircuit();return false;
   }
 }
 return false;
}
function teamNick(v:any){const x=cleanName(String(v||""));return x.split(" ").filter(Boolean).pop()||x}
function matchupParts(v:any){
 const raw=String(v||"").replace(/\bvs\.?\b/gi,"@").replace(/\bv\b/gi,"@");
 const parts=raw.split("@").map(x=>cleanName(x)).filter(Boolean);return parts.length===2?parts:[];
}
function sameTeam(a:any,b:any){const x=cleanName(String(a||"")),y=cleanName(String(b||""));if(!x||!y)return false;return x===y||teamNick(x)===teamNick(y)}
function sameMatchup(a:any,b:any){
 const aa=matchupParts(a),bb=matchupParts(b);
 if(aa.length===2&&bb.length===2)return sameTeam(aa[0],bb[0])&&sameTeam(aa[1],bb[1]);
 return cleanName(String(a||""))===cleanName(String(b||""));
}
function findScheduleGame(schedule:any[],row:any){
 if(row?.gameId){const byId=schedule.find((g:any)=>String(g?.id||"")===String(row.gameId));if(byId)return byId}
 return schedule.find((g:any)=>sameMatchup(`${g.awayTeam} @ ${g.homeTeam}`,row?.matchup));
}
export async function saveNflPregamePredictions(m:NflMarketKey,rows:any[],schedule:any[]){
 const today=nflDay(new Date());
 // Capture against the actual ESPN game date. Do not abort just because the initial read is empty/blocked;
 // a server write may still be authorized and is the important operation.
 const buckets=new Map<string,{existing:any,saved:SavedNflPrediction[],map:Map<string,SavedNflPrediction>,changed:boolean}>();
 const ensure=async(day:string)=>{let b=buckets.get(day);if(b)return b;const existing=await getRow(m,day);const saved=mergeSnapshotPredictions([...(existing.rows||[])].reverse());b={existing,saved,map:new Map(saved.map(x=>[x.key,x])),changed:false};buckets.set(day,b);return b};
 for(const row of rows){
   const game=findScheduleGame(schedule,row);
   const tdMarket=m==="anytime_td"||m==="first_td";
   if(!row.playerId||(!tdMarket&&row.sportsbookLine==null)||(tdMarket&&row.sportsbookLine==null&&row.sportsbookProbability==null))continue;
   const gameDate=nflDay(game?.date||row.gameTime||new Date());
   // Ignore stale games, but allow today and future weekly-slate predictions to be frozen under their real game date.
   if(!gameDate||gameDate<today)continue;
   const bucket=await ensure(gameDate);
   const {map,saved}=bucket;
   const gameId=String(row.gameId||game?.id||"");
   const key=`${gameDate}|${m}|${row.playerId}|${row.matchup}`;
   const old=map.get(key)||saved.find(x=>x.playerId===String(row.playerId)&&((gameId&&x.gameId===gameId)||sameMatchup(x.matchup,row.matchup)));
   const alreadyStarted=Boolean(game?.state==="in"||game?.completed||game?.state==="post");
   if(alreadyStarted&&old)continue;
   if(old){
     map.set(old.key,{...old,
       playerName:String(row.playerName||old.playerName),teamName:String(row.teamName||old.teamName),position:String(row.position||old.position||""),
       teamId:String(row.teamId||old.teamId||""),teamLogo:String(row.teamLogo||old.teamLogo||""),headshot:String(row.headshot||old.headshot||""),gameId:String(old.gameId||gameId),
       lastSeenRank:Number(row.rank||old.lastSeenRank||old.originalRank||0)||null,lastSeenAt:new Date().toISOString()});
     bucket.changed=true;continue;
   }
   map.set(key,{key,gameDate,gameTime:String(row.gameTime||game?.date||""),matchup:String(row.matchup||""),market:m,
     playerId:String(row.playerId),playerName:String(row.playerName),teamName:String(row.teamName),position:String(row.position||""),
     teamId:String(row.teamId||""),teamLogo:String(row.teamLogo||""),headshot:String(row.headshot||""),gameId,
     sportsbookLine:row.sportsbookLine==null?null:Number(row.sportsbookLine),sportsbookProbability:row.sportsbookProbability==null?null:Number(row.sportsbookProbability),modelProjection:row.modelProjection==null?null:Number(row.modelProjection),
     modelProbability:row.modelProbability==null?null:Number(row.modelProbability),pickSide:(m==="anytime_td"||m==="first_td")?"OVER":(row.modelProjection!=null&&row.sportsbookLine!=null&&Number(row.modelProjection)<Number(row.sportsbookLine)?"UNDER":"OVER"),giScore:Number(row.giScore||0),bookmakerCount:Number(row.bookmakerCount||0),
     savedAt:new Date().toISOString(),originalRank:Number(row.rank||0)||null,lastSeenRank:Number(row.rank||0)||null,lastSeenAt:new Date().toISOString(),
     status:"pending",actual:null,gradedAt:null,recoveredAfterStart:alreadyStarted||undefined});bucket.changed=true;
 }
 let ok=true;
 for(const [day,bucket] of buckets){
   const next=[...bucket.map.values()];
   if(!bucket.changed&&next.length===bucket.saved.length)continue;
   const wrote=await writeRow(m,day,next,bucket.existing.row?.id);
   ok=ok&&wrote;
 }
 return ok;
}
export async function getNflPredictions(m:NflMarketKey,day:string){
 const x=await getRow(m,day);
 const predictions=mergeSnapshotPredictions([...(x.rows||[])].reverse());
 return {connected:x.connected,writable:x.writable,predictions,id:x.row?.id as string|undefined,snapshotCount:(x.rows||[]).length,storageReason:x.reason};
}
export async function saveGradedNflPredictions(m:NflMarketKey,day:string,predictions:SavedNflPrediction[],id?:string){
 return writeRow(m,day,predictions,id);
}
export async function getNflResultMap(m:NflMarketKey,day:string){
 const x=await getNflPredictions(m,day),map=new Map<string,SavedNflPrediction>();
 for(const p of x.predictions){map.set(`${p.playerId}|matchup:${cleanName(p.matchup)}`,p);if(p.gameId)map.set(`${p.playerId}|game:${p.gameId}`,p)}
 return map;
}
