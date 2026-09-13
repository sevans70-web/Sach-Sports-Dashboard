import type {NflMarketKey} from "@/lib/nfl";

export type SavedNflPrediction={
  key:string; gameDate:string; gameTime:string; matchup:string; market:NflMarketKey;
  playerId:string; playerName:string; teamName:string; position?:string;
  teamId?:string; teamLogo?:string; headshot?:string;
  sportsbookLine:number|null; modelProjection:number|null; modelProbability:number|null;
  giScore:number; bookmakerCount:number; savedAt:string;
  originalRank?:number|null; lastSeenRank?:number|null; lastSeenAt?:string|null;
  status:"pending"|"hit"|"miss"|"push"|"void"; actual:number|null; gradedAt:string|null;
};

const SOURCE_PREFIX="nfl_predictions_";
function config(){
  const url=(process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL||"").replace(/\/$/,"");
  const key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_KEY||"";
  return {url,key};
}
function headers(prefer="return=representation"){const {key}=config();return {apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json",Accept:"application/json",Prefer:prefer}}
export function nflDay(v:Date|string){
 const d=typeof v==="string"?new Date(v):v;if(Number.isNaN(d.getTime()))return "";
 const p=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Toronto",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d);
 const g=(t:string)=>p.find(x=>x.type===t)?.value||"";return `${g("year")}-${g("month")}-${g("day")}`;
}
function source(m:NflMarketKey){return `${SOURCE_PREFIX}${m}`}
function predictionList(row:any):SavedNflPrediction[]{
 const payload=row?.payload;
 if(Array.isArray(payload?.predictions))return payload.predictions as SavedNflPrediction[];
 if(Array.isArray(payload))return payload as SavedNflPrediction[];
 if(Array.isArray(payload?.rows))return payload.rows as SavedNflPrediction[];
 return [];
}
function recoveryKey(p:any,m:NflMarketKey,day:string){
 const player=String(p?.playerId||p?.playerName||"").trim();
 const matchup=String(p?.matchup||"").trim();
 const market=String(p?.market||m);
 const gameDate=String(p?.gameDate||day);
 return String(p?.key||`${gameDate}|${market}|${player}|${matchup}`);
}
function mergeRecovered(older:any,newer:any,m:NflMarketKey,day:string):SavedNflPrediction{
 // Preserve the earliest pregame prediction values. Only status/result and last-seen
 // metadata are allowed to advance as later snapshots are encountered.
 const base={...newer,...older};
 const statusOrder:any={pending:0,void:1,push:2,miss:3,hit:3};
 const newerStatus=String(newer?.status||"pending"),olderStatus=String(older?.status||"pending");
 const chosenStatus=(statusOrder[newerStatus]??0)>(statusOrder[olderStatus]??0)?newerStatus:olderStatus;
 return {
   ...base,
   key:recoveryKey(older,m,day),gameDate:String(older?.gameDate||newer?.gameDate||day),market:m,
   sportsbookLine:older?.sportsbookLine??newer?.sportsbookLine??null,
   modelProjection:older?.modelProjection??newer?.modelProjection??null,
   modelProbability:older?.modelProbability??newer?.modelProbability??null,
   giScore:Number(older?.giScore??newer?.giScore??0),bookmakerCount:Number(older?.bookmakerCount??newer?.bookmakerCount??0),
   savedAt:String(older?.savedAt||newer?.savedAt||new Date().toISOString()),
   originalRank:older?.originalRank??newer?.originalRank??null,
   lastSeenRank:newer?.lastSeenRank??older?.lastSeenRank??null,
   lastSeenAt:newer?.lastSeenAt??older?.lastSeenAt??null,
   status:chosenStatus as SavedNflPrediction["status"],
   actual:newer?.actual??older?.actual??null,
   gradedAt:newer?.gradedAt??older?.gradedAt??null,
 } as SavedNflPrediction;
}
async function getRows(m:NflMarketKey,day:string){
 const {url,key}=config();if(!url||!key)return {connected:false,rows:[] as any[]};
 // Read ALL snapshots for the market/day. Older deployments sometimes created a
 // fresh source_snapshots row, so looking at only the newest row loses the 1 PM slate.
 const q=`source_snapshots?select=id,source_name,game_date,payload,created_at&source_name=eq.${encodeURIComponent(source(m))}&game_date=eq.${encodeURIComponent(day)}&order=created_at.asc&limit=200`;
 const r=await fetch(`${url}/rest/v1/${q}`,{headers:headers(),cache:"no-store"});if(!r.ok)return {connected:false,rows:[] as any[]};
 const a=await r.json();return {connected:true,rows:Array.isArray(a)?a:[]};
}
async function getRow(m:NflMarketKey,day:string){
 const x=await getRows(m,day);if(!x.connected)return {connected:false,row:null as any,predictions:[] as SavedNflPrediction[]};
 const map=new Map<string,SavedNflPrediction>();
 // Oldest -> newest. First sighting freezes the original line/projection; later
 // rows can contribute final grading and last-seen metadata without deleting it.
 for(const row of x.rows){
   for(const raw of predictionList(row)){
     const k=recoveryKey(raw,m,day),old=map.get(k);
     map.set(k,old?mergeRecovered(old,raw,m,day):({...raw,key:k,market:m,gameDate:String(raw?.gameDate||day)} as SavedNflPrediction));
   }
 }
 const latest=x.rows[x.rows.length-1]||null;
 return {connected:true,row:latest?{...latest,payload:{predictions:[...map.values()]}}:null,predictions:[...map.values()]};
}
async function writeRow(m:NflMarketKey,day:string,predictions:SavedNflPrediction[],id?:string){
 const {url,key}=config();if(!url||!key)return false;
 const body=JSON.stringify({source_name:source(m),game_date:day,payload:{predictions},created_at:new Date().toISOString()});
 const endpoint=id?`${url}/rest/v1/source_snapshots?id=eq.${encodeURIComponent(id)}`:`${url}/rest/v1/source_snapshots`;
 const r=await fetch(endpoint,{method:id?"PATCH":"POST",headers:headers("return=minimal"),body,cache:"no-store"});return r.ok;
}
function sameMatchup(a:any,b:any){
 return String(a||"").toLowerCase().replace(/\s+/g," ").trim()===String(b||"").toLowerCase().replace(/\s+/g," ").trim();
}
export async function saveNflPregamePredictions(m:NflMarketKey,rows:any[],schedule:any[]){
 const day=nflDay(new Date()),existing=await getRow(m,day);if(!existing.connected)return false;
 const saved:SavedNflPrediction[]=existing.predictions||[];
 const map=new Map(saved.map(x=>[x.key,x]));
 let changed=false;
 for(const row of rows){
   const game=schedule.find((g:any)=>sameMatchup(g.awayTeam&&g.homeTeam?`${g.awayTeam} @ ${g.homeTeam}`:"",row.matchup));
   // Once a game starts, never rewrite the frozen prediction for that player/market.
   if(game?.state==="in"||game?.completed||game?.state==="post")continue;
   if(!row.playerId||row.sportsbookLine==null||(row.modelProbability==null&&row.modelProjection==null))continue;
   const gameDate=nflDay(row.gameTime||game?.date||new Date());
   if(gameDate!==day)continue;
   const key=`${gameDate}|${m}|${row.playerId}|${row.matchup}`;
   const old=map.get(key);
   if(old){
     map.set(key,{...old,
       playerName:String(row.playerName||old.playerName),teamName:String(row.teamName||old.teamName),position:String(row.position||old.position||""),
       teamId:String(row.teamId||old.teamId||""),teamLogo:String(row.teamLogo||old.teamLogo||""),headshot:String(row.headshot||old.headshot||""),
       lastSeenRank:Number(row.rank||old.lastSeenRank||old.originalRank||0)||null,lastSeenAt:new Date().toISOString()});
     changed=true;continue;
   }
   map.set(key,{key,gameDate,gameTime:String(row.gameTime||game?.date||""),matchup:String(row.matchup||""),market:m,
     playerId:String(row.playerId),playerName:String(row.playerName),teamName:String(row.teamName),position:String(row.position||""),
     teamId:String(row.teamId||""),teamLogo:String(row.teamLogo||""),headshot:String(row.headshot||""),
     sportsbookLine:Number(row.sportsbookLine),modelProjection:row.modelProjection==null?null:Number(row.modelProjection),
     modelProbability:row.modelProbability==null?null:Number(row.modelProbability),giScore:Number(row.giScore||0),bookmakerCount:Number(row.bookmakerCount||0),
     savedAt:new Date().toISOString(),originalRank:Number(row.rank||0)||null,lastSeenRank:Number(row.rank||0)||null,lastSeenAt:new Date().toISOString(),
     status:"pending",actual:null,gradedAt:null});changed=true;
 }
 const next=[...map.values()];
 if(!changed&&next.length===saved.length)return true;
 return writeRow(m,day,next,existing.row?.id);
}
export async function getNflPredictions(m:NflMarketKey,day:string){
 const x=await getRow(m,day);return {connected:x.connected,predictions:(x.predictions||[]) as SavedNflPrediction[],id:x.row?.id as string|undefined};
}
export async function saveGradedNflPredictions(m:NflMarketKey,day:string,predictions:SavedNflPrediction[],id?:string){
 return writeRow(m,day,predictions,id);
}
export async function getNflResultMap(m:NflMarketKey,day:string){
 const x=await getNflPredictions(m,day);return new Map(x.predictions.map(p=>[`${p.playerId}|${p.matchup}`,p]));
}
