import {providerFetch as fetch} from "@/lib/provider-fetch";
import {NextRequest,NextResponse} from "next/server";
import {type CfbMarketKey} from "@/lib/cfb";
import {getEspnCfbSchedule} from "@/lib/cfb-server";
import {footballRowsForMarket} from "@/lib/football-quarter-stats";

export const dynamic="force-dynamic";
export const revalidate=0;

const SUMMARY="https://site.api.espn.com/apis/site/v2/sports/football/college-football/summary";

const norm=(v:any)=>String(v??"").toLowerCase().replace(/[^a-z0-9]/g,"");

async function fetchJson(url:string,ms=8000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),ms);

  try{
    const response=await fetch(url,{
      cache:"no-store",
      signal:controller.signal,
      headers:{Accept:"application/json","User-Agent":"Mozilla/5.0"},
    });

    if(!response.ok)throw new Error(`ESPN ${response.status}`);
    return await response.json();
  }finally{
    clearTimeout(timer);
  }
}

function extractPlayerStats(payload:any,market:CfbMarketKey){
  return footballRowsForMarket(payload,market).filter(row=>row.stats[market]!=null).map(row=>({playerId:row.playerId,playerName:row.playerName,value:row.stats[market]!}));
}

function extractFirstTd(payload:any){
  const plays=Array.isArray(payload?.scoringPlays)?payload.scoringPlays:[];
  const first=plays.find((play:any)=>{
    const type=norm(
      play?.scoringType?.name||
      play?.scoringType?.abbreviation||
      play?.type?.text
    );
    const text=norm(play?.text||play?.shortText);
    return type.includes("touchdown")||type==="td"||text.includes("touchdown");
  });

  if(!first)return [];

  const athletes:Array<any>=[];
  const walk=(value:any)=>{
    if(Array.isArray(value)){value.forEach(walk);return}
    if(!value||typeof value!=="object")return;
    if(value.id&&(value.displayName||value.fullName))athletes.push(value);
    Object.values(value).forEach(walk);
  };

  walk(first);

  const seen=new Set<string>();

  return athletes
    .filter((athlete:any)=>{
      const id=String(athlete.id||"");
      if(!id||seen.has(id))return false;
      seen.add(id);
      return true;
    })
    .map((athlete:any)=>({
      playerId:String(athlete.id),
      playerName:String(athlete.displayName||athlete.fullName||""),
      value:1,
    }));
}

function scheduleClock(status:string){
  const quarter=(status.match(/Q[1-4]|OT\d*|HALF/i)||[])[0]||"";
  const clock=(status.match(/\d{1,2}:\d{2}/)||[])[0]||"";
  return {quarter,clock};
}

function summaryClock(payload:any){
  const competition=payload?.header?.competitions?.[0]||{};
  const status=competition?.status||payload?.header?.status||{};
  const type=status?.type||{};
  const period=Number(status?.period||0);
  const clock=String(status?.displayClock||"").trim();

  let quarter="";

  if(Number.isFinite(period)&&period>0){
    quarter=
      period<=4
        ?`Q${period}`
        :period===5
          ?"OT"
          :`OT${period-4}`;
  }

  return {
    quarter,
    clock,
    detail:String(type?.shortDetail||type?.description||""),
  };
}

export async function GET(req:NextRequest){
  const market=(req.nextUrl.searchParams.get("market")||"passing_yards") as CfbMarketKey;

  try{
    const schedule=await getEspnCfbSchedule();
    // Prioritize today's live games. Fetching every completed game across the
    // multi-week schedule exhausts the response time before live stats arrive.
    const today=new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
    const easternDay=(date:string)=>new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(date));
    const active=schedule.filter((game:any)=>game.state==="in"||(game.completed&&easternDay(game.date)===today))
      .sort((a:any,b:any)=>Number(b.state==="in")-Number(a.state==="in"));

    const games=await Promise.all(
      active.map(async(game:any)=>{
        const matchup=`${game.awayTeam} @ ${game.homeTeam}`;
        const fallback=scheduleClock(String(game.status||""));

        try{
          const payload=await fetchJson(
            `${SUMMARY}?event=${encodeURIComponent(game.id)}`
          );
          if(String(payload?.header?.id||"")!==String(game.id))throw new Error("CFB live fixture identity mismatch");

          const rows=
            market==="first_td"
              ?extractFirstTd(payload)
              :extractPlayerStats(payload,market);

          const precise=summaryClock(payload);

          return {
            gameId:String(game.id),
            matchup,
            state:String(game.state||""),
            completed:Boolean(game.completed),
            status:
              precise.detail||
              String(game.status||""),
            quarter:
              precise.quarter||
              fallback.quarter,
            clock:
              precise.clock||
              fallback.clock,
            rows,
          };
        }catch{
          return {
            gameId:String(game.id),
            matchup,
            state:String(game.state||""),
            completed:Boolean(game.completed),
            status:String(game.status||""),
            quarter:fallback.quarter,
            clock:fallback.clock,
            rows:[],
          };
        }
      })
    );

    return NextResponse.json({
      success:true,
      market,
      games,
      updatedAt:new Date().toISOString(),
    });
  }catch(e){
    return NextResponse.json(
      {
        success:false,
        market,
        games:[],
        error:e instanceof Error?e.message:"CFB live data unavailable",
      },
      {status:500}
    );
  }
}
