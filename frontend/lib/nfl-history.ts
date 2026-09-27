import {readDurableHistory,writeDurableHistory} from "@/lib/durable-history";
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
  recoveredAfterStart?:boolean; frozenAt?:string|null;
};

const SOURCE_PREFIX="nfl_predictions_";
const nflRuntime=new Map<string,SavedNflPrediction[]>();
function runtimeKey(m:NflMarketKey,day:string){return `${m}|${day}`}

function supabaseUrl(){return (process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL||"").replace(/\/$/,"");}
function candidateKeys(){return [process.env.SUPABASE_SECRET_KEY,process.env.SUPABASE_SERVICE_ROLE_KEY,process.env.SUPABASE_KEY,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY].map(v=>String(v||"").trim()).filter((v,i,a)=>Boolean(v)&&a.indexOf(v)===i)}
function readConfig(){const keys=candidateKeys();return {url:supabaseUrl(),key:keys[0]||"",keys};}
function writeConfig(){const keys=candidateKeys();return {url:supabaseUrl(),key:keys[0]||"",keys};}
function headers(key:string,prefer="return=representation"){const h:any={apikey:key,"Content-Type":"application/json",Accept:"application/json",Prefer:prefer};if(!key.startsWith("sb_secret_")&&!key.startsWith("sb_publishable_"))h.Authorization=`Bearer ${key}`;return h;}
const STORAGE_TIMEOUT_MS=6500;
const STORAGE_COOLDOWN_MS=5_000;
let storageUnavailableUntil=0;
function storageCooling(){return Date.now()<storageUnavailableUntil}
function tripStorageCircuit(){storageUnavailableUntil=Date.now()+STORAGE_COOLDOWN_MS}
async function fetchStorage(url:string,init:RequestInit){const controller=new AbortController();const id=setTimeout(()=>controller.abort(),STORAGE_TIMEOUT_MS);try{return await fetch(url,{...init,signal:controller.signal,cache:"no-store"})}finally{clearTimeout(id)}}
export function nflDay(v:Date|string){const d=typeof v==="string"?new Date(v):v;if(Number.isNaN(d.getTime()))return "";const p=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Toronto",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d);const g=(t:string)=>p.find(x=>x.type===t)?.value||"";return `${g("year")}-${g("month")}-${g("day")}`;}
function source(m:NflMarketKey){return `${SOURCE_PREFIX}${m}`}
async function getRows(m:NflMarketKey,day:string){
 const predictions=await readDurableHistory<SavedNflPrediction>("nfl",String(m),day);
 return {connected:true,writable:true,rows:predictions.length?[{id:undefined,payload:{predictions},created_at:new Date().toISOString()}]:[],reason:"railway_volume"};
}
function mergeSnapshotPredictions(rows:any[]){
 const merged=new Map<string,SavedNflPrediction>();
 for(const row of rows){for(const raw of Array.isArray(row?.payload?.predictions)?row.payload.predictions:[]){if(!raw?.key)continue;const next=raw as SavedNflPrediction,old=merged.get(next.key);if(!old){merged.set(next.key,{...next});continue}
   if(old.status!=="pending"){merged.set(next.key,old);continue}
   if(next.status!=="pending"){merged.set(next.key,{...old,...next});continue}
   const oldFrozen=Boolean(old.frozenAt),nextFrozen=Boolean(next.frozenAt);
   if(oldFrozen&&!nextFrozen){merged.set(next.key,old);continue}
   if(nextFrozen&&!oldFrozen){merged.set(next.key,{...old,...next});continue}
   const oldTime=Date.parse(old.savedAt||""),nextTime=Date.parse(next.savedAt||"");
   merged.set(next.key,Number.isFinite(nextTime)&&(!Number.isFinite(oldTime)||nextTime>=oldTime)?{...old,...next}:old);
 }}return [...merged.values()];
}
async function getRow(m:NflMarketKey,day:string){const x=await getRows(m,day),row=x.rows.length?x.rows[0]:null;return {connected:x.connected,writable:x.writable,row,rows:x.rows,reason:x.reason};}
async function writeRow(m:NflMarketKey,day:string,predictions:SavedNflPrediction[],_id?:string){
 nflRuntime.set(runtimeKey(m,day),predictions);
 return writeDurableHistory("nfl",String(m),day,predictions);
}
function teamNick(v:any){const x=cleanName(String(v||""));return x.split(" ").filter(Boolean).pop()||x}
function matchupParts(v:any){const raw=String(v||"").replace(/\bvs\.?\b/gi,"@").replace(/\bv\b/gi,"@");const parts=raw.split("@").map(x=>cleanName(x)).filter(Boolean);return parts.length===2?parts:[];}
function sameTeam(a:any,b:any){const x=cleanName(String(a||"")),y=cleanName(String(b||""));if(!x||!y)return false;return x===y||teamNick(x)===teamNick(y)}
function sameMatchup(a:any,b:any){const aa=matchupParts(a),bb=matchupParts(b);if(aa.length===2&&bb.length===2)return sameTeam(aa[0],bb[0])&&sameTeam(aa[1],bb[1]);return cleanName(String(a||""))===cleanName(String(b||""));}
function findScheduleGame(schedule:any[],row:any){if(row?.gameId){const byId=schedule.find((g:any)=>String(g?.id||"")===String(row.gameId));if(byId)return byId}return schedule.find((g:any)=>sameMatchup(`${g.awayTeam} @ ${g.homeTeam}`,row?.matchup));}
export async function saveNflPregamePredictions(m:NflMarketKey,rows:any[],schedule:any[]){
 const today=nflDay(new Date());const buckets=new Map<string,{existing:any,saved:SavedNflPrediction[],map:Map<string,SavedNflPrediction>,changed:boolean}>();
 const ensure=async(day:string)=>{let b=buckets.get(day);if(b)return b;const existing=await getRow(m,day);const saved=mergeSnapshotPredictions([...(existing.rows||[])].reverse());b={existing,saved,map:new Map(saved.map(x=>[x.key,x])),changed:false};buckets.set(day,b);return b};
 for(const row of rows){const game=findScheduleGame(schedule,row);const tdMarket=m==="anytime_td"||m==="first_td";if(!row.playerId||(!tdMarket&&row.sportsbookLine==null)||(tdMarket&&row.sportsbookLine==null&&row.sportsbookProbability==null))continue;const gameDate=nflDay(game?.date||row.gameTime||new Date());if(!gameDate||gameDate<today)continue;const bucket=await ensure(gameDate);const {map,saved}=bucket;const gameId=String(row.gameId||game?.id||"");const key=`${gameDate}|${m}|${row.playerId}|${row.matchup}`;const old=map.get(key)||saved.find(x=>x.playerId===String(row.playerId)&&((gameId&&x.gameId===gameId)||sameMatchup(x.matchup,row.matchup)));const alreadyStarted=Boolean(game?.state==="in"||game?.completed||game?.state==="post");
   if(alreadyStarted&&old){if(!old.frozenAt){map.set(old.key,{...old,frozenAt:new Date().toISOString(),lastSeenRank:Number(row.rank||old.lastSeenRank||old.originalRank||0)||null,lastSeenAt:new Date().toISOString()});bucket.changed=true}continue}
   if(alreadyStarted&&!old)continue;
   const now=new Date().toISOString();const line=row.sportsbookLine==null?null:Number(row.sportsbookLine);const projection=row.modelProjection==null?null:Number(row.modelProjection);const probability=row.modelProbability==null?null:Number(row.modelProbability);const pickSide:("OVER"|"UNDER")=(m==="anytime_td"||m==="first_td")?"OVER":(projection!=null&&line!=null&&projection<line?"UNDER":"OVER");
   if(old){map.set(old.key,{...old,playerName:String(row.playerName||old.playerName),teamName:String(row.teamName||old.teamName),position:String(row.position||old.position||""),teamId:String(row.teamId||old.teamId||""),teamLogo:String(row.teamLogo||old.teamLogo||""),headshot:String(row.headshot||old.headshot||""),gameId:String(old.gameId||gameId),sportsbookLine:line,sportsbookProbability:row.sportsbookProbability==null?old.sportsbookProbability:Number(row.sportsbookProbability),modelProjection:projection,modelProbability:probability,pickSide,giScore:Number(row.giScore||old.giScore||0),bookmakerCount:Number(row.bookmakerCount||old.bookmakerCount||0),savedAt:now,lastSeenRank:Number(row.rank||old.lastSeenRank||old.originalRank||0)||null,lastSeenAt:now,frozenAt:null});bucket.changed=true;continue}
   map.set(key,{key,gameDate,gameTime:String(row.gameTime||game?.date||""),matchup:String(row.matchup||""),market:m,playerId:String(row.playerId),playerName:String(row.playerName),teamName:String(row.teamName),position:String(row.position||""),teamId:String(row.teamId||""),teamLogo:String(row.teamLogo||""),headshot:String(row.headshot||""),gameId,sportsbookLine:line,sportsbookProbability:row.sportsbookProbability==null?null:Number(row.sportsbookProbability),modelProjection:projection,modelProbability:probability,pickSide,giScore:Number(row.giScore||0),bookmakerCount:Number(row.bookmakerCount||0),savedAt:now,originalRank:Number(row.rank||0)||null,lastSeenRank:Number(row.rank||0)||null,lastSeenAt:now,status:"pending",actual:null,gradedAt:null,recoveredAfterStart:undefined,frozenAt:null});bucket.changed=true;
 }
 let ok=true;for(const [day,bucket] of buckets){
   // Before kickoff, history must mirror the CURRENT Top 25 snapshot for this market/day.
   // Otherwise every player who briefly enters the ranking accumulates as another pending pick.
   const currentKeys=new Set(rows.filter((row:any)=>nflDay(findScheduleGame(schedule,row)?.date||row.gameTime||new Date())===day).map((row:any)=>`${day}|${m}|${row.playerId}|${row.matchup}`));
   for(const [key,p] of bucket.map){if(p.status==="pending"&&!p.frozenAt&&p.gameDate===day&&!currentKeys.has(key)){bucket.map.delete(key);bucket.changed=true}}
   const next=[...bucket.map.values()];if(!bucket.changed&&next.length===bucket.saved.length)continue;const wrote=await writeRow(m,day,next,bucket.existing.row?.id);ok=ok&&wrote}return ok;
}
export async function getNflPredictions(m:NflMarketKey,day:string){const x=await getRow(m,day);const db=mergeSnapshotPredictions([...(x.rows||[])].reverse());const memory=nflRuntime.get(runtimeKey(m,day))||[];const predictions=mergeSnapshotPredictions([{payload:{predictions:db}},{payload:{predictions:memory}}]);if(predictions.length)nflRuntime.set(runtimeKey(m,day),predictions);return {connected:x.connected||predictions.length>0,writable:x.writable,predictions,id:x.row?.id as string|undefined,snapshotCount:(x.rows||[]).length,storageReason:x.reason};}
export async function saveGradedNflPredictions(m:NflMarketKey,day:string,predictions:SavedNflPrediction[],id?:string){return writeRow(m,day,predictions,id);}
export async function getNflResultMap(m:NflMarketKey,day:string){const x=await getNflPredictions(m,day),map=new Map<string,SavedNflPrediction>();for(const p of x.predictions){map.set(`${p.playerId}|matchup:${cleanName(p.matchup)}`,p);if(p.gameId)map.set(`${p.playerId}|game:${p.gameId}`,p)}return map;}
