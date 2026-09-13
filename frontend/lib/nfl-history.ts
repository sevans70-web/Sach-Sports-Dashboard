import type {NflMarketKey} from "@/lib/nfl";

export type SavedNflPrediction={
  key:string; gameDate:string; gameTime:string; matchup:string; market:NflMarketKey;
  playerId:string; playerName:string; teamName:string; position?:string;
  sportsbookLine:number|null; modelProjection:number|null; modelProbability:number|null;
  giScore:number; bookmakerCount:number; savedAt:string;
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
async function getRow(m:NflMarketKey,day:string){
 const {url,key}=config();if(!url||!key)return {connected:false,row:null as any};
 const q=`source_snapshots?select=id,source_name,game_date,payload,created_at&source_name=eq.${encodeURIComponent(source(m))}&game_date=eq.${encodeURIComponent(day)}&order=created_at.desc&limit=1`;
 const r=await fetch(`${url}/rest/v1/${q}`,{headers:headers(),cache:"no-store"});if(!r.ok)return {connected:false,row:null as any};
 const a=await r.json();return {connected:true,row:Array.isArray(a)?a[0]||null:null};
}
async function writeRow(m:NflMarketKey,day:string,predictions:SavedNflPrediction[],id?:string){
 const {url,key}=config();if(!url||!key)return false;
 const body=JSON.stringify({source_name:source(m),game_date:day,payload:{predictions},created_at:new Date().toISOString()});
 const endpoint=id?`${url}/rest/v1/source_snapshots?id=eq.${encodeURIComponent(id)}`:`${url}/rest/v1/source_snapshots`;
 const r=await fetch(endpoint,{method:id?"PATCH":"POST",headers:headers("return=minimal"),body,cache:"no-store"});return r.ok;
}
export async function saveNflPregamePredictions(m:NflMarketKey,rows:any[],schedule:any[]){
 const day=nflDay(new Date()),existing=await getRow(m,day);if(!existing.connected)return false;
 const saved:SavedNflPrediction[]=Array.isArray(existing.row?.payload?.predictions)?existing.row.payload.predictions:[];
 const map=new Map(saved.map(x=>[x.key,x]));
 for(const row of rows){
   const game=schedule.find((g:any)=>String(g.awayTeam&&g.homeTeam?`${g.awayTeam} @ ${g.homeTeam}`:"").toLowerCase()===String(row.matchup||"").toLowerCase());
   // Freeze only pregame predictions. Live/final refreshes can never rewrite the original pick.
   if(game&&game.state!=="pre")continue;
   if(!row.playerId||row.sportsbookLine==null||row.modelProbability==null)continue;
   const gameDate=nflDay(row.gameTime||game?.date||new Date());
   if(gameDate!==day)continue;
   const key=`${gameDate}|${m}|${row.playerId}|${row.matchup}`;
   if(map.has(key))continue;
   map.set(key,{key,gameDate,gameTime:String(row.gameTime||game?.date||""),matchup:String(row.matchup||""),market:m,
     playerId:String(row.playerId),playerName:String(row.playerName),teamName:String(row.teamName),position:String(row.position||""),
     sportsbookLine:Number(row.sportsbookLine),modelProjection:row.modelProjection==null?null:Number(row.modelProjection),
     modelProbability:Number(row.modelProbability),giScore:Number(row.giScore||0),bookmakerCount:Number(row.bookmakerCount||0),
     savedAt:new Date().toISOString(),status:"pending",actual:null,gradedAt:null});
 }
 const next=[...map.values()];
 if(next.length===saved.length)return true;
 return writeRow(m,day,next,existing.row?.id);
}
export async function getNflPredictions(m:NflMarketKey,day:string){
 const x=await getRow(m,day);return {connected:x.connected,predictions:(Array.isArray(x.row?.payload?.predictions)?x.row.payload.predictions:[]) as SavedNflPrediction[],id:x.row?.id as string|undefined};
}
export async function saveGradedNflPredictions(m:NflMarketKey,day:string,predictions:SavedNflPrediction[],id?:string){
 return writeRow(m,day,predictions,id);
}
export async function getNflResultMap(m:NflMarketKey,day:string){
 const x=await getNflPredictions(m,day);return new Map(x.predictions.map(p=>[`${p.playerId}|${p.matchup}`,p]));
}
