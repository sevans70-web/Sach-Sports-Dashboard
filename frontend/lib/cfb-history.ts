import type {CfbMarketKey} from "@/lib/cfb";

export type SavedCfbPrediction={
  key:string; gameDate:string; gameTime:string; matchup:string; market:CfbMarketKey;
  playerId:string; playerName:string; teamName:string; position?:string;
  sportsbookLine:number|null; modelProjection:number|null; modelProbability:number|null;
  pick?:"over"|"under"; giScore:number; bookmakerCount:number; savedAt:string;
  status:"pending"|"hit"|"miss"|"push"|"void"; actual:number|null; gradedAt:string|null;
};

const SOURCE_PREFIX="cfb_predictions_";
function config(){
  const url=(process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL||"").replace(/\/$/,"");
  const key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_KEY||"";
  return {url,key};
}
function headers(prefer="return=representation"){
  const {key}=config();
  return {apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json",Accept:"application/json",Prefer:prefer};
}
async function request(url:string,init:RequestInit={},attempts=2){
  let last:any=null;
  for(let i=0;i<attempts;i++){
    const c=new AbortController(); const t=setTimeout(()=>c.abort(),8000);
    try{
      const r=await fetch(url,{...init,signal:c.signal,cache:"no-store"}); clearTimeout(t);
      if(r.ok||r.status<500)return r;
      last=new Error(`Supabase ${r.status}`);
    }catch(e){clearTimeout(t);last=e}
    await new Promise(res=>setTimeout(res,300*(i+1)));
  }
  throw last||new Error("Supabase request failed");
}
export function cfbDay(v:Date|string){
  const d=typeof v==="string"?new Date(v):v;if(Number.isNaN(d.getTime()))return "";
  const p=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Toronto",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d);
  const g=(t:string)=>p.find(x=>x.type===t)?.value||"";return `${g("year")}-${g("month")}-${g("day")}`;
}
function source(m:CfbMarketKey){return `${SOURCE_PREFIX}${m}`}
async function getRow(m:CfbMarketKey,day:string){
  const {url,key}=config();if(!url||!key)return {connected:false,row:null as any};
  const q=`source_snapshots?select=id,source_name,game_date,payload,created_at&source_name=eq.${encodeURIComponent(source(m))}&game_date=eq.${encodeURIComponent(day)}&order=created_at.desc&limit=1`;
  try{
    const r=await request(`${url}/rest/v1/${q}`,{headers:headers()});
    if(!r.ok)return {connected:false,row:null as any};
    const a=await r.json();return {connected:true,row:Array.isArray(a)?a[0]||null:null};
  }catch{return {connected:false,row:null as any}}
}
async function writeRow(m:CfbMarketKey,day:string,predictions:SavedCfbPrediction[],id?:string){
  const {url,key}=config();if(!url||!key)return false;
  const body=JSON.stringify({source_name:source(m),game_date:day,payload:{predictions},created_at:new Date().toISOString()});
  const endpoint=id?`${url}/rest/v1/source_snapshots?id=eq.${encodeURIComponent(id)}`:`${url}/rest/v1/source_snapshots`;
  try{
    const r=await request(endpoint,{method:id?"PATCH":"POST",headers:headers("return=minimal"),body});
    return r.ok;
  }catch{return false}
}
export async function saveCfbPregamePredictions(m:CfbMarketKey,rows:any[],schedule:any[]){
  const grouped=new Map<string,any[]>();
  for(const row of rows){
    const game=schedule.find((g:any)=>String(`${g.awayTeam||""} @ ${g.homeTeam||""}`).toLowerCase()===String(row.matchup||"").toLowerCase());
    if(game&&game.state!=="pre")continue;
    if(!row.playerId||row.sportsbookLine==null||row.modelProbability==null)continue;
    const gameDate=cfbDay(row.gameTime||game?.date||new Date());
    if(!gameDate)continue;
    grouped.set(gameDate,[...(grouped.get(gameDate)||[]),{row,game}]);
  }

  let ok=true;
  for(const [gameDate,items] of grouped){
    const existing=await getRow(m,gameDate);
    if(!existing.connected){ok=false;continue}
    const saved:SavedCfbPrediction[]=Array.isArray(existing.row?.payload?.predictions)?existing.row.payload.predictions:[];
    const map=new Map(saved.map(x=>[x.key,x]));
    let changed=false;

    for(const {row,game} of items){
      const key=`${gameDate}|${m}|${row.playerId}|${row.matchup}`;
      if(map.has(key))continue;
      const projection=row.modelProjection==null?null:Number(row.modelProjection);
      const line=Number(row.sportsbookLine);
      const pick:"over"|"under"=projection!=null&&projection<line?"under":"over";
      map.set(key,{key,gameDate,gameTime:String(row.gameTime||game?.date||""),matchup:String(row.matchup||""),market:m,
        playerId:String(row.playerId),playerName:String(row.playerName),teamName:String(row.teamName),position:String(row.position||""),
        sportsbookLine:line,modelProjection:projection,modelProbability:Number(row.modelProbability),pick,
        giScore:Number(row.giScore||0),bookmakerCount:Number(row.bookmakerCount||0),
        savedAt:new Date().toISOString(),status:"pending",actual:null,gradedAt:null});
      changed=true;
    }
    if(changed)ok=(await writeRow(m,gameDate,[...map.values()],existing.row?.id))&&ok;
  }
  return ok;
}
export async function getCfbPredictions(m:CfbMarketKey,day:string){
  const x=await getRow(m,day);
  return {connected:x.connected,predictions:(Array.isArray(x.row?.payload?.predictions)?x.row.payload.predictions:[]) as SavedCfbPrediction[],id:x.row?.id as string|undefined};
}
export async function getCfbPredictionsForDays(markets:CfbMarketKey[],days:string[]){
  const {url,key}=config();if(!url||!key)return {connected:false,rows:[] as any[]};
  if(!markets.length||!days.length)return {connected:true,rows:[] as any[]};
  const names=markets.map(source);
  const q=`source_snapshots?select=id,source_name,game_date,payload,created_at&source_name=in.(${names.map(encodeURIComponent).join(",")})&game_date=in.(${days.map(encodeURIComponent).join(",")})&order=created_at.desc`;
  try{
    const r=await request(`${url}/rest/v1/${q}`,{headers:headers()});
    if(!r.ok)return {connected:false,rows:[] as any[]};
    const rows=await r.json();
    return {connected:true,rows:Array.isArray(rows)?rows:[]};
  }catch{return {connected:false,rows:[] as any[]}}
}
export async function saveGradedCfbPredictions(m:CfbMarketKey,day:string,predictions:SavedCfbPrediction[],id?:string){
  return writeRow(m,day,predictions,id);
}
export async function getCfbResultMap(m:CfbMarketKey,day:string){
  const x=await getCfbPredictions(m,day);return new Map(x.predictions.map(p=>[`${p.playerId}|${p.matchup}`,p]));
}
