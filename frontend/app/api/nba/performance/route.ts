import {NextRequest,NextResponse} from "next/server";
import {NBA_MARKETS,type NbaMarketKey,cleanNbaName} from "@/lib/nba";
import {getNbaPredictions,saveNbaGrades,nbaDay,type SavedNbaPrediction} from "@/lib/nba-history";

export const dynamic="force-dynamic";
export const revalidate=0;

const SCOREBOARD="https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard";
const SUMMARY="https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary";
const ATHLETE_BASE="https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes";
const MARKET_KEYS=NBA_MARKETS.map(x=>x[0]) as NbaMarketKey[];
const allowed=new Set<NbaMarketKey>(MARKET_KEYS);
const norm=(v:any)=>String(v??"").toLowerCase().replace(/[^a-z0-9]/g,"");

function dayOffset(n:number){const d=new Date();d.setDate(d.getDate()+n);return nbaDay(d)}
function range(period:string){
  if(period==="Yesterday")return[dayOffset(-1)];
  if(period==="Week")return Array.from({length:7},(_,i)=>dayOffset(-i));
  if(period==="Month")return Array.from({length:31},(_,i)=>dayOffset(-i));
  if(period==="Season")return Array.from({length:370},(_,i)=>dayOffset(-i));
  return[dayOffset(0)];
}
async function json(url:string,ms=6500){
  const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);
  try{const r=await fetch(url,{cache:"no-store",signal:c.signal,headers:{"User-Agent":"Mozilla/5.0",Accept:"application/json"}});return r.ok?await r.json():null}
  catch{return null}finally{clearTimeout(t)}
}
async function finalsForDay(day:string){
  const p=await json(`${SCOREBOARD}?dates=${day.replaceAll("-","")}&limit=30`);
  const ids=new Set<string>();
  for(const e of p?.events||[]){
    const state=String(e?.status?.type?.state||"");
    if(state==="post"||Boolean(e?.status?.type?.completed))ids.add(String(e?.id||""));
  }
  return ids;
}
async function summary(gameId:string){return json(`${SUMMARY}?event=${encodeURIComponent(gameId)}`,8000)}
async function gamelog(playerId:string){return json(`${ATHLETE_BASE}/${encodeURIComponent(playerId)}/gamelog?season=2026`,6500)}

function numberValue(v:any){const n=Number(String(v??"").replace(/[^0-9.-]/g,""));return Number.isFinite(n)?n:null}
function statFromSummary(payload:any,p:SavedNbaPrediction,labelAliases:string[]){
  const wantedId=String(p.playerId||"");
  const wantedName=cleanNbaName(p.playerName||"");
  for(const team of payload?.boxscore?.players||[]){
    for(const group of team?.statistics||[]){
      const rawLabels=Array.isArray(group?.labels)?group.labels:Array.isArray(group?.keys)?group.keys:[];
      const labels=rawLabels.map((x:any)=>norm(typeof x==="string"?x:(x?.name||x?.displayName||x?.abbreviation||x?.label||"")));
      let ix=-1;
      for(const alias of labelAliases){ix=labels.findIndex((x:string)=>x===norm(alias));if(ix>=0)break}
      if(ix<0)continue;
      for(const row of group?.athletes||[]){
        const athlete=row?.athlete||row?.player||{};
        const id=String(athlete?.id||row?.athleteId||row?.playerId||"");
        const name=cleanNbaName(athlete?.displayName||athlete?.fullName||athlete?.name||row?.displayName||row?.name||"");
        const sameId=Boolean(wantedId&&id&&wantedId===id);
        const sameName=Boolean(wantedName&&name&&(wantedName===name||wantedName.includes(name)||name.includes(wantedName)));
        if(!sameId&&!sameName)continue;
        const stats=Array.isArray(row?.stats)?row.stats:Array.isArray(row?.values)?row.values:[];
        const v=numberValue(stats[ix]);
        if(v!=null)return v;
      }
    }
  }
  return null;
}
function firstBasketActual(payload:any,p:SavedNbaPrediction){
  const wantedId=String(p.playerId||"");
  const wantedName=cleanNbaName(p.playerName||"");
  const plays=Array.isArray(payload?.plays)?payload.plays:[];
  for(const play of plays){
    const text=String(play?.text||play?.shortText||"").toLowerCase();
    const scoring=Boolean(play?.scoringPlay)||Number(play?.scoreValue||0)>0;
    const value=Number(play?.scoreValue||0);
    if(!scoring||value<2||text.includes("free throw"))continue;
    const athletes=Array.isArray(play?.participants)?play.participants:Array.isArray(play?.athletes)?play.athletes:[];
    const ids=athletes.map((x:any)=>String(x?.athlete?.id||x?.id||x?.athleteId||""));
    const names=athletes.map((x:any)=>cleanNbaName(x?.athlete?.displayName||x?.displayName||x?.name||""));
    const hit=(wantedId&&ids.includes(wantedId))||(wantedName&&names.some((n:string)=>n===wantedName||n.includes(wantedName)||wantedName.includes(n)))||cleanNbaName(text).includes(wantedName);
    return hit?1:0;
  }
  return null;
}
function summaryActual(payload:any,p:SavedNbaPrediction,market:NbaMarketKey){
  if(market==="first_basket")return firstBasketActual(payload,p);
  const pts=()=>statFromSummary(payload,p,["PTS","Points"]);
  const reb=()=>statFromSummary(payload,p,["REB","Rebounds"]);
  const ast=()=>statFromSummary(payload,p,["AST","Assists"]);
  const threes=()=>statFromSummary(payload,p,["3PM","3PT","3PTM","Three Point Field Goals Made"]);
  const stl=()=>statFromSummary(payload,p,["STL","Steals"]);
  const blk=()=>statFromSummary(payload,p,["BLK","Blocks"]);
  const add=(...xs:(number|null)[])=>xs.some(x=>x==null)?null:xs.reduce<number>((a,b)=>a+(b??0),0);
  return market==="points"?pts():market==="rebounds"?reb():market==="assists"?ast():market==="threes_made"?threes():market==="steals"?stl():market==="blocks"?blk():market==="pts_rebs_asts"?add(pts(),reb(),ast()):market==="pts_rebs"?add(pts(),reb()):market==="pts_asts"?add(pts(),ast()):add(reb(),ast());
}

function gamelogIndexes(payload:any,market:NbaMarketKey){
  const names=(Array.isArray(payload?.names)?payload.names:[]).map(norm);
  const ix=(...keys:string[])=>{for(const key of keys){const i=names.indexOf(norm(key));if(i>=0)return i}return-1};
  const pts=ix("points","pts"),reb=ix("rebounds","rebs","reb"),ast=ix("assists","ast"),three=ix("threepointfieldgoalsmade","threepointersmade","3pm"),stl=ix("steals","stl"),blk=ix("blocks","blk");
  return market==="points"?[pts]:market==="rebounds"?[reb]:market==="assists"?[ast]:market==="threes_made"?[three]:market==="steals"?[stl]:market==="blocks"?[blk]:market==="pts_rebs_asts"?[pts,reb,ast]:market==="pts_rebs"?[pts,reb]:market==="pts_asts"?[pts,ast]:[reb,ast];
}
function gamelogActual(payload:any,market:NbaMarketKey,day:string){
  const indexes=gamelogIndexes(payload,market);if(indexes.some(i=>i<0))return null;
  const events=payload?.events||{};
  for(const st of payload?.seasonTypes||[])for(const c of st?.categories||[])if(c?.type==="event")for(const ev of c?.events||[]){
    const meta=events[String(ev?.eventId||"")]||{},date=meta?.gameDate||ev?.gameDate||"";
    if(date&&nbaDay(date)!==day)continue;
    const stats=Array.isArray(ev?.stats)?ev.stats:[],vals=indexes.map(i=>Number(stats[i]));
    if(vals.every(Number.isFinite))return vals.reduce((a,b)=>a+b,0);
  }
  return null;
}
function settle(p:SavedNbaPrediction,a:number){
  if(p.market==="first_basket")return a===1?"hit":"miss";
  if(p.sportsbookLine==null)return"void";
  if(a===p.sportsbookLine)return"push";
  return p.pickSide==="UNDER"?(a<p.sportsbookLine?"hit":"miss"):(a>p.sportsbookLine?"hit":"miss");
}

export async function GET(req:NextRequest){
  const marketParam=req.nextUrl.searchParams.get("market") as NbaMarketKey|null;
  const period=req.nextUrl.searchParams.get("period")||"Today";
  if(marketParam&&!allowed.has(marketParam))return NextResponse.json({connected:false,hits:0,settled:0,pending:0,total:0,hitRate:null,results:[]});
  const markets:NbaMarketKey[]=marketParam?[marketParam]:MARKET_KEYS;
  let connected=false;
  const all:SavedNbaPrediction[]=[];
  const summaryCache=new Map<string,any>();
  const gamelogCache=new Map<string,any>();

  for(const day of range(period)){
    const daily=await Promise.all(markets.map(async market=>({market,data:await getNbaPredictions(market,day)})));
    const hasPending=daily.some(x=>x.data.predictions.some(p=>p.status==="pending"));
    const finals=hasPending?await finalsForDay(day):new Set<string>();

    for(const {market,data:x} of daily){
      connected=connected||x.connected;
      if(!x.predictions.length)continue;
      let changed=false;
      const graded:SavedNbaPrediction[]=[];
      for(const p of x.predictions){
        if(p.status!=="pending"){graded.push(p);continue}
        if(!p.gameId||!finals.has(String(p.gameId))){graded.push(p);continue}

        let gamePayload=summaryCache.get(String(p.gameId));
        if(gamePayload===undefined){gamePayload=await summary(String(p.gameId));summaryCache.set(String(p.gameId),gamePayload)}
        let a=summaryActual(gamePayload,p,market);

        // Fallback for older saved records or an ESPN summary that temporarily omits a player row.
        if(a==null&&/^\d+$/.test(String(p.playerId||""))){
          let logPayload=gamelogCache.get(String(p.playerId));
          if(logPayload===undefined){logPayload=await gamelog(String(p.playerId));gamelogCache.set(String(p.playerId),logPayload)}
          a=gamelogActual(logPayload,market,day);
        }
        if(a==null){graded.push(p);continue}
        graded.push({...p,actual:a,status:settle(p,a),gradedAt:new Date().toISOString()} as SavedNbaPrediction);
        changed=true;
      }
      if(changed)await saveNbaGrades(market,day,graded,x.id);
      all.push(...graded);
    }
  }

  const settledRows=all.filter(x=>x.status==="hit"||x.status==="miss");
  const hits=settledRows.filter(x=>x.status==="hit").length;
  const pending=all.filter(x=>x.status==="pending").length;
  return NextResponse.json({
    connected,hits,settled:settledRows.length,pending,total:all.length,
    hitRate:settledRows.length?Math.round(hits/settledRows.length*1000)/10:null,
    results:all.sort((a,b)=>(b.savedAt||b.gameTime).localeCompare(a.savedAt||a.gameTime)).slice(0,100),
    updatedAt:new Date().toISOString()
  },{headers:{"Cache-Control":"no-store, no-cache, must-revalidate, max-age=0"}});
}
