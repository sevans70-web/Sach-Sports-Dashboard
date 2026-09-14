import {cleanName,type NflMarketKey} from "@/lib/nfl";

export type SavedNflPrediction={
  key:string; gameDate:string; gameTime:string; matchup:string; market:NflMarketKey;
  gameId?:string;
  playerId:string; playerName:string; teamName:string; position?:string;
  teamId?:string; teamLogo?:string; headshot?:string;
  sportsbookLine:number|null; sportsbookProbability?:number|null; modelProjection:number|null; modelProbability:number|null;
  giScore:number; bookmakerCount:number; savedAt:string;
  originalRank?:number|null; lastSeenRank?:number|null; lastSeenAt?:string|null;
  status:"pending"|"hit"|"miss"|"push"|"void"; actual:number|null; gradedAt:string|null;
};

const SOURCE_PREFIX="nfl_predictions_";
function readConfig(){
  const url=(process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL||"").replace(/\/$/,"");
  const key=process.env.SUPABASE_KEY||process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||"";
  return {url,key};
}
function writeConfig(){
  const url=(process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL||"").replace(/\/$/,"");
  const key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_KEY||"";
  return {url,key};
}
function headers(key:string,prefer="return=representation"){return {apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json",Accept:"application/json",Prefer:prefer}}
export function nflDay(v:Date|string){
 const d=typeof v==="string"?new Date(v):v;if(Number.isNaN(d.getTime()))return "";
 const p=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Toronto",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d);
 const g=(t:string)=>p.find(x=>x.type===t)?.value||"";return `${g("year")}-${g("month")}-${g("day")}`;
}
function source(m:NflMarketKey){return `${SOURCE_PREFIX}${m}`}
async function getRows(m:NflMarketKey,day:string){
 const {url,key}=readConfig();const write=writeConfig();if(!url||!key)return {connected:false,writable:Boolean(write.url&&write.key),rows:[] as any[]};
 // Read every snapshot for this market/day. Older deployments could create more than
 // one row during the day, and the early-game predictions may live in an older row.
 const q=`source_snapshots?select=id,source_name,game_date,payload,created_at&source_name=eq.${encodeURIComponent(source(m))}&game_date=eq.${encodeURIComponent(day)}&order=created_at.asc&limit=500`;
 const r=await fetch(`${url}/rest/v1/${q}`,{headers:headers(key),cache:"no-store"});if(!r.ok)return {connected:false,writable:Boolean(write.url&&write.key),rows:[] as any[]};
 const a=await r.json();return {connected:true,writable:Boolean(write.url&&write.key),rows:Array.isArray(a)?a:[]};
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
 const x=await getRows(m,day),row=x.rows.length?x.rows[x.rows.length-1]:null;
 return {connected:x.connected,writable:x.writable,row,rows:x.rows};
}
async function writeRow(m:NflMarketKey,day:string,predictions:SavedNflPrediction[],id?:string){
 const {url,key}=writeConfig();if(!url||!key)return false;
 const body=JSON.stringify({source_name:source(m),game_date:day,payload:{predictions},created_at:new Date().toISOString()});
 const endpoint=id?`${url}/rest/v1/source_snapshots?id=eq.${encodeURIComponent(id)}`:`${url}/rest/v1/source_snapshots`;
 const r=await fetch(endpoint,{method:id?"PATCH":"POST",headers:headers(key,"return=minimal"),body,cache:"no-store"});return r.ok;
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
 const day=nflDay(new Date()),existing=await getRow(m,day);if(!existing.connected)return false;
 const saved:SavedNflPrediction[]=mergeSnapshotPredictions(existing.rows||[]);
 const map=new Map(saved.map(x=>[x.key,x]));
 let changed=false;
 for(const row of rows){
   const game=findScheduleGame(schedule,row);
   // Once a game starts, never rewrite the frozen prediction for that player/market.
   if(game?.state==="in"||game?.completed||game?.state==="post")continue;
   const tdMarket=m==="anytime_td"||m==="first_td";
   if(!row.playerId||(!tdMarket&&row.sportsbookLine==null)||(tdMarket&&row.sportsbookLine==null&&row.sportsbookProbability==null))continue;
   const gameDate=nflDay(row.gameTime||game?.date||new Date());
   if(gameDate!==day)continue;
   const gameId=String(row.gameId||game?.id||"");
   const key=`${gameDate}|${m}|${row.playerId}|${row.matchup}`;
   const old=map.get(key)||saved.find(x=>x.playerId===String(row.playerId)&&((gameId&&x.gameId===gameId)||sameMatchup(x.matchup,row.matchup)));
   if(old){
     map.set(old.key,{...old,
       playerName:String(row.playerName||old.playerName),teamName:String(row.teamName||old.teamName),position:String(row.position||old.position||""),
       teamId:String(row.teamId||old.teamId||""),teamLogo:String(row.teamLogo||old.teamLogo||""),headshot:String(row.headshot||old.headshot||""),gameId:String(old.gameId||gameId),
       lastSeenRank:Number(row.rank||old.lastSeenRank||old.originalRank||0)||null,lastSeenAt:new Date().toISOString()});
     changed=true;continue;
   }
   map.set(key,{key,gameDate,gameTime:String(row.gameTime||game?.date||""),matchup:String(row.matchup||""),market:m,
     playerId:String(row.playerId),playerName:String(row.playerName),teamName:String(row.teamName),position:String(row.position||""),
     teamId:String(row.teamId||""),teamLogo:String(row.teamLogo||""),headshot:String(row.headshot||""),gameId,
     sportsbookLine:row.sportsbookLine==null?null:Number(row.sportsbookLine),sportsbookProbability:row.sportsbookProbability==null?null:Number(row.sportsbookProbability),modelProjection:row.modelProjection==null?null:Number(row.modelProjection),
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
 return {connected:x.connected,writable:x.writable,predictions,id:x.row?.id as string|undefined,snapshotCount:(x.rows||[]).length};
}
export async function saveGradedNflPredictions(m:NflMarketKey,day:string,predictions:SavedNflPrediction[],id?:string){
 return writeRow(m,day,predictions,id);
}
export async function getNflResultMap(m:NflMarketKey,day:string){
 const x=await getNflPredictions(m,day),map=new Map<string,SavedNflPrediction>();
 for(const p of x.predictions){map.set(`${p.playerId}|matchup:${cleanName(p.matchup)}`,p);if(p.gameId)map.set(`${p.playerId}|game:${p.gameId}`,p)}
 return map;
}
