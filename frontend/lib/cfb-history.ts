import type {CfbMarketKey} from "@/lib/cfb";

export type SavedCfbPrediction={
  key:string; gameDate:string; gameTime:string; matchup:string; market:CfbMarketKey;
  playerId:string; playerName:string; teamName:string; position?:string;
  sportsbookLine:number|null; modelProjection:number|null; modelProbability:number|null;
  pick?:"over"|"under"; rank?:number; giScore:number; bookmakerCount:number; savedAt:string;
  status:"pending"|"hit"|"miss"|"push"|"void"; actual:number|null; gradedAt:string|null;
};

const SOURCE_PREFIX="cfb_predictions_";
const globalStore=globalThis as typeof globalThis&{__sachCfbPredictions?:Map<string,SavedCfbPrediction[]>};
const runtime=globalStore.__sachCfbPredictions||(globalStore.__sachCfbPredictions=new Map<string,SavedCfbPrediction[]>());

function config(){const url=(process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL||"").replace(/\/$/,"");const key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_KEY||"";return {url,key}}
function headers(prefer="return=representation"){const {key}=config();return {apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json",Accept:"application/json",Prefer:prefer}}
async function request(url:string,init:RequestInit={},attempts=2){
  let last:any=null;
  for(let i=0;i<attempts;i++){const c=new AbortController(),t=setTimeout(()=>c.abort(),6500);try{const r=await fetch(url,{...init,signal:c.signal,cache:"no-store"});clearTimeout(t);if(r.ok||r.status<500)return r;last=new Error(`Supabase ${r.status}`)}catch(e){clearTimeout(t);last=e}await new Promise(res=>setTimeout(res,250*(i+1)))}
  throw last||new Error("Supabase request failed");
}
export function cfbDay(v:Date|string){const d=typeof v==="string"?new Date(v):v;if(Number.isNaN(d.getTime()))return "";const p=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Toronto",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d);const g=(t:string)=>p.find(x=>x.type===t)?.value||"";return `${g("year")}-${g("month")}-${g("day")}`}
function source(m:CfbMarketKey){return `${SOURCE_PREFIX}${m}`}
function storeKey(m:CfbMarketKey,day:string){return `${m}|${day}`}
function mergePredictions(a:SavedCfbPrediction[],b:SavedCfbPrediction[]){
  const m=new Map<string,SavedCfbPrediction>();
  for(const x of [...a,...b]){
    const old=m.get(x.key);
    if(!old){m.set(x.key,x);continue}
    if(old.status==="pending"&&x.status!=="pending"){m.set(x.key,x);continue}
    if(old.status==="pending"&&x.status==="pending"){
      const oldTime=Date.parse(old.savedAt||"");
      const nextTime=Date.parse(x.savedAt||"");
      // While the game is still pregame, keep the newest snapshot.
      // The ranking route stops writing once the game starts, so this makes
      // the final pre-kickoff snapshot the authoritative frozen prediction.
      if(Number.isFinite(nextTime)&&(!Number.isFinite(oldTime)||nextTime>oldTime)){
        m.set(x.key,x);
      }
    }
  }
  return [...m.values()]
}

async function getRow(m:CfbMarketKey,day:string){
  const {url,key}=config();if(!url||!key)return {connected:false,row:null as any};
  const q=`source_snapshots?select=id,source_name,game_date,payload,created_at&source_name=eq.${encodeURIComponent(source(m))}&game_date=eq.${encodeURIComponent(day)}&order=created_at.desc&limit=1`;
  try{const r=await request(`${url}/rest/v1/${q}`,{headers:headers()});if(!r.ok)return {connected:false,row:null as any};const a=await r.json();return {connected:true,row:Array.isArray(a)?a[0]||null:null}}catch{return {connected:false,row:null as any}}
}
async function writeRow(m:CfbMarketKey,day:string,predictions:SavedCfbPrediction[],id?:string){
  runtime.set(storeKey(m,day),predictions);
  const {url,key}=config();if(!url||!key)return false;
  const body=JSON.stringify({source_name:source(m),game_date:day,payload:{predictions},created_at:new Date().toISOString()}),endpoint=id?`${url}/rest/v1/source_snapshots?id=eq.${encodeURIComponent(id)}`:`${url}/rest/v1/source_snapshots`;
  try{const r=await request(endpoint,{method:id?"PATCH":"POST",headers:headers("return=minimal"),body});return r.ok}catch{return false}
}
export async function saveCfbPregamePredictions(m:CfbMarketKey,rows:any[],schedule:any[]){
  const grouped=new Map<string,any[]>();
  for(const row of rows){
    const game=schedule.find((g:any)=>String(`${g.awayTeam||""} @ ${g.homeTeam||""}`).toLowerCase()===String(row.matchup||"").toLowerCase());
    // Normal rows save pregame. If the ranking route has already hard-locked a
    // player at kickoff, allow that frozen pregame snapshot to be persisted too.
    // This closes the race where kickoff happens before Supabase finishes saving.
    if(game&&game.state!=="pre"&&!row.frozen&&!row.lockedAtKickoff)continue;
    if(!row.playerId||row.sportsbookLine==null||row.modelProbability==null)continue;
    const gameDate=cfbDay(row.gameTime||game?.date||new Date());
    if(!gameDate)continue;
    grouped.set(gameDate,[...(grouped.get(gameDate)||[]),{row,game}]);
  }

  for(const [gameDate,items] of grouped){
    const map=new Map((runtime.get(storeKey(m,gameDate))||[]).map(x=>[x.key,x]));
    for(const {row,game} of items){
      const key=`${gameDate}|${m}|${row.playerId}|${row.matchup}`;
      // Pregame rows are intentionally refreshed until kickoff; do not skip an existing pending key.
      const projection=row.modelProjection==null?null:Number(row.modelProjection);
      const line=Number(row.sportsbookLine);
      const pick:"over"|"under"=projection!=null&&projection<line?"under":"over";
      map.set(key,{key,gameDate,gameTime:String(row.gameTime||game?.date||""),matchup:String(row.matchup||""),market:m,
        playerId:String(row.playerId),playerName:String(row.playerName),teamName:String(row.teamName),position:String(row.position||""),
        sportsbookLine:line,modelProjection:projection,modelProbability:Number(row.modelProbability),pick,
        rank:Number(row.rank||0)||undefined,giScore:Number(row.giScore||0),bookmakerCount:Number(row.bookmakerCount||0),
        savedAt:new Date().toISOString(),status:"pending",actual:null,gradedAt:null});
    }
    runtime.set(storeKey(m,gameDate),[...map.values()]);
  }

  let ok=true;
  for(const [gameDate] of grouped){
    const db=await getRow(m,gameDate);
    const dbSaved:SavedCfbPrediction[]=Array.isArray(db.row?.payload?.predictions)?db.row.payload.predictions:[];
    const merged=mergePredictions(dbSaved,runtime.get(storeKey(m,gameDate))||[]);
    runtime.set(storeKey(m,gameDate),merged);
    ok=(await writeRow(m,gameDate,merged,db.row?.id))&&ok;
  }
  return ok;
}
export function getRuntimeCfbPredictions(m:CfbMarketKey,day:string){
  const predictions=runtime.get(storeKey(m,day))||[];
  return {connected:predictions.length>0,predictions};
}
export async function getCfbPredictions(m:CfbMarketKey,day:string){
  const db=await getRow(m,day),dbSaved=(Array.isArray(db.row?.payload?.predictions)?db.row.payload.predictions:[]) as SavedCfbPrediction[],predictions=mergePredictions(dbSaved,runtime.get(storeKey(m,day))||[]);
  return {connected:db.connected||predictions.length>0,predictions,id:db.row?.id as string|undefined};
}
export async function getCfbPredictionsForDays(markets:CfbMarketKey[],days:string[]){
  const all:SavedCfbPrediction[]=[];let connected=false;
  await Promise.all(markets.flatMap(m=>days.map(async day=>{const x=await getCfbPredictions(m,day);connected=connected||x.connected;all.push(...x.predictions)})));
  return {connected, predictions:all};
}
export async function saveGradedCfbPredictions(m:CfbMarketKey,day:string,predictions:SavedCfbPrediction[],id?:string){return writeRow(m,day,predictions,id)}
export async function getCfbResultMap(m:CfbMarketKey,day:string){const x=await getCfbPredictions(m,day);return new Map(x.predictions.map(p=>[`${p.playerId}|${p.matchup}`,p]))}
