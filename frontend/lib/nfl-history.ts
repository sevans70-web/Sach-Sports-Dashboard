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
async function getRows(m:NflMarketKey,day:string){
 const {url,key}=config();if(!url||!key)return {connected:false,rows:[] as any[]};
 // Read every snapshot for this market/day. Older deployments could create more than
 // one row during the day, and the early-game predictions may live in an older row.
 const q=`source_snapshots?select=id,source_name,game_date,payload,created_at&source_name=eq.${encodeURIComponent(source(m))}&game_date=eq.${encodeURIComponent(day)}&order=created_at.asc&limit=500`;
 const r=await fetch(`${url}/rest/v1/${q}`,{headers:headers(),cache:"no-store"});if(!r.ok)return {connected:false,rows:[] as any[]};
 const a=await r.json();return {connected:true,rows:Array.isArray(a)?a:[]};
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
       gameTime:old.gameTime||next.gameTime,matchup:old.matchup||next.matchup,
       lastSeenRank:next.lastSeenRank??old.lastSeenRank,lastSeenAt:next.lastSeenAt??old.lastSeenAt,
       status:next.status&&next.status!=="pending"?next.status:old.status,
       actual:next.actual!=null?next.actual:old.actual,gradedAt:next.gradedAt||old.gradedAt});
   }
 }
 return [...merged.values()];
}
async function getRow(m:NflMarketKey,day:string){
 const x=await getRows(m,day),row=x.rows.length?x.rows[x.rows.length-1]:null;
 return {connected:x.connected,row,rows:x.rows};
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
 const saved:SavedNflPrediction[]=mergeSnapshotPredictions(existing.rows||[]);
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
 const x=await getRow(m,day);
 const predictions=mergeSnapshotPredictions(x.rows||[]);
 return {connected:x.connected,predictions,id:x.row?.id as string|undefined,snapshotCount:(x.rows||[]).length};
}
export async function saveGradedNflPredictions(m:NflMarketKey,day:string,predictions:SavedNflPrediction[],id?:string){
 return writeRow(m,day,predictions,id);
}
export async function getNflResultMap(m:NflMarketKey,day:string){
 const x=await getNflPredictions(m,day);return new Map(x.predictions.map(p=>[`${p.playerId}|${p.matchup}`,p]));
}
