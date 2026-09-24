import {NextRequest,NextResponse} from "next/server";
import {WNBA_MARKETS,type WnbaMarketKey} from "@/lib/wnba";
import {getWnbaPredictions,saveWnbaGrades,wnbaDay,type SavedWnbaPrediction} from "@/lib/wnba-history";

export const dynamic="force-dynamic";
export const revalidate=0;

const BASE="https://site.web.api.espn.com/apis/common/v3/sports/basketball/wnba/athletes";
const SCOREBOARD="https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/scoreboard";
const MARKET_KEYS=WNBA_MARKETS.map(x=>x[0]) as WnbaMarketKey[];
const allowed=new Set<WnbaMarketKey>(MARKET_KEYS);
const clean=(v:any)=>String(v??"").toLowerCase().replace(/[^a-z0-9]/g,"");

function dayOffset(n:number){const d=new Date();d.setDate(d.getDate()+n);return wnbaDay(d)}
function range(period:string){
  if(period==="Yesterday")return[dayOffset(-1)];
  if(period==="Week")return Array.from({length:7},(_,i)=>dayOffset(-i));
  if(period==="Month")return Array.from({length:31},(_,i)=>dayOffset(-i));
  // Keep the full WNBA season available even after the regular season ends.
  if(period==="Season")return Array.from({length:370},(_,i)=>dayOffset(-i));
  return[dayOffset(0)];
}
async function json(url:string,ms=4500){
  const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);
  try{const r=await fetch(url,{cache:"no-store",signal:c.signal,headers:{"User-Agent":"Mozilla/5.0",Accept:"application/json"}});return r.ok?await r.json():null}
  catch{return null}finally{clearTimeout(t)}
}
async function log(id:string){return json(`${BASE}/${encodeURIComponent(id)}/gamelog?season=2026`)}
async function finalsForDay(day:string){
  const compact=day.replaceAll("-","");
  const p=await json(`${SCOREBOARD}?dates=${compact}&limit=20`);
  const ids=new Set<string>();
  for(const e of p?.events||[]){
    const state=String(e?.status?.type?.state||"");
    const completed=Boolean(e?.status?.type?.completed);
    if(state==="post"||completed)ids.add(String(e.id||""));
  }
  return ids;
}
function indexes(p:any,m:WnbaMarketKey){
  const n=(Array.isArray(p?.names)?p.names:[]).map(clean),ix=(...k:string[])=>{for(const x of k){const i=n.indexOf(x);if(i>=0)return i}return-1};
  const pts=ix("points","pts"),reb=ix("rebounds","rebs","reb"),ast=ix("assists","ast"),three=ix("threepointfieldgoalsmade","threepointersmade","3pm"),stl=ix("steals","stl"),blk=ix("blocks","blk");
  return m==="points"?[pts]:m==="rebounds"?[reb]:m==="assists"?[ast]:m==="threes_made"?[three]:m==="steals"?[stl]:m==="blocks"?[blk]:m==="pts_rebs_asts"?[pts,reb,ast]:m==="pts_rebs"?[pts,reb]:m==="pts_asts"?[pts,ast]:[reb,ast];
}
function actual(p:any,m:WnbaMarketKey,day:string){
  const ix=indexes(p,m);if(ix.some(i=>i<0))return null;
  const events=p?.events||{};
  for(const st of p?.seasonTypes||[])for(const c of st?.categories||[])if(c?.type==="event")for(const ev of c.events||[]){
    const meta=events[String(ev?.eventId||"")]||{},date=meta?.gameDate||ev?.gameDate||"";
    if(date&&wnbaDay(date)!==day)continue;
    const stats=Array.isArray(ev?.stats)?ev.stats:[],vals=ix.map(i=>Number(stats[i]));
    if(vals.every(Number.isFinite))return vals.reduce((a,b)=>a+b,0);
  }
  return null;
}
function settle(p:SavedWnbaPrediction,a:number){
  if(p.sportsbookLine==null)return"void";
  if(a===p.sportsbookLine)return"push";
  return p.pickSide==="UNDER"?(a<p.sportsbookLine?"hit":"miss"):(a>p.sportsbookLine?"hit":"miss");
}

export async function GET(req:NextRequest){
  const marketParam=req.nextUrl.searchParams.get("market") as WnbaMarketKey|null;
  const period=req.nextUrl.searchParams.get("period")||"Today";
  if(marketParam&&!allowed.has(marketParam))return NextResponse.json({connected:false,hits:0,settled:0,pending:0,total:0,hitRate:null,results:[]});
  const markets:WnbaMarketKey[]=marketParam?[marketParam]:MARKET_KEYS;

  // Match the NFL/CFB lifecycle: the performance request that builds the Overall
  // cards must read AND grade every market in scope.  The previous WNBA shortcut
  // only counted saved rows, so Overall could show pending totals but would never
  // settle a market until the user happened to click that individual market tab.
  let connected=false;
  const all:SavedWnbaPrediction[]=[];
  const finalCache=new Map<string,Set<string>>();
  const logCache=new Map<string,any>();

  for(const day of range(period)){
    // Read the day's markets concurrently so Overall remains fast while still
    // following the same grading lifecycle as the individual market endpoint.
    const daily=await Promise.all(markets.map(async market=>({
      market,
      data:await getWnbaPredictions(market,day),
    })));

    const hasPending=daily.some(x=>x.data.predictions.some(p=>p.status==="pending"));
    let finals:Set<string>|undefined;
    if(hasPending){
      finals=await finalsForDay(day);
      finalCache.set(day,finals);
    }

    for(const {market,data:x} of daily){
      connected=connected||x.connected;
      if(!x.predictions.length)continue;

      let changed=false;
      const graded:SavedWnbaPrediction[]=[];
      for(const p of x.predictions){
        if(p.status!=="pending"){graded.push(p);continue}
        if(!p.gameId||!finals?.has(String(p.gameId))){
          graded.push({...p,status:"pending",actual:null,gradedAt:null});
          continue;
        }

        const cacheKey=String(p.playerId);
        let payload=logCache.get(cacheKey);
        if(payload===undefined){payload=await log(p.playerId);logCache.set(cacheKey,payload)}
        const a=actual(payload,market,day);
        if(a==null){graded.push(p);continue}
        graded.push({...p,actual:a,status:settle(p,a),gradedAt:new Date().toISOString()} as SavedWnbaPrediction);
        changed=true;
      }

      if(changed)await saveWnbaGrades(market,day,graded,x.id);
      all.push(...graded);
    }
  }

  const settledRows=all.filter(x=>x.status==="hit"||x.status==="miss");
  const hits=settledRows.filter(x=>x.status==="hit").length;
  const pendingRows=all.filter(x=>x.status==="pending");
  return NextResponse.json({
    connected,
    hits,
    settled:settledRows.length,
    pending:pendingRows.length,
    total:all.length,
    hitRate:settledRows.length?Math.round(hits/settledRows.length*1000)/10:null,
    results:all.sort((a,b)=>(b.savedAt||b.gameTime).localeCompare(a.savedAt||a.gameTime)).slice(0,100),
    updatedAt:new Date().toISOString()
  },{headers:{"Cache-Control":"no-store, no-cache, must-revalidate, max-age=0"}});
}
