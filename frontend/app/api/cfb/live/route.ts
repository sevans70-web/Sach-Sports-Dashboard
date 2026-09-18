import {NextRequest,NextResponse} from "next/server";
import {type CfbMarketKey,cleanName,safeNumber} from "@/lib/cfb";
import {getEspnCfbSchedule} from "@/lib/cfb-server";

export const dynamic="force-dynamic";
export const revalidate=0;

const SUMMARY="https://site.api.espn.com/apis/site/v2/sports/football/college-football/summary";

const MARKET_LABELS:Record<CfbMarketKey,string[]>={
  passing_yards:["passingyards","passing yards","pass yds","yds"],
  pass_completions:["completions","passing completions","cmp"],
  rushing_yards:["rushingyards","rushing yards","rush yds","car-yds"],
  receiving_yards:["receivingyards","receiving yards","rec yds"],
  receptions:["receptions","rec"],
  anytime_td:["totaltouchdowns","touchdowns","td"],
  first_td:["first touchdown","firsttd"],
};

const norm=(v:any)=>String(v??"").toLowerCase().replace(/[^a-z0-9]/g,"");

async function fetchJson(url:string,ms=5000){
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

function statIndex(labels:any[],market:CfbMarketKey){
  const normalized=labels.map(norm);
  const aliases=MARKET_LABELS[market].map(norm);
  for(const alias of aliases){
    const exact=normalized.findIndex((x:string)=>x===alias);
    if(exact>=0)return exact;
  }
  for(const alias of aliases){
    const partial=normalized.findIndex((x:string)=>x&&((x.includes(alias))||(alias.includes(x))));
    if(partial>=0)return partial;
  }
  return -1;
}

function extractPlayerStats(payload:any,market:CfbMarketKey){
  const out:Array<{playerId:string;playerName:string;value:number}>=[];
  const teams=Array.isArray(payload?.boxscore?.players)?payload.boxscore.players:[];
  for(const team of teams){
    for(const group of team?.statistics||[]){
      const labels=Array.isArray(group?.labels)?group.labels:[];
      const idx=statIndex(labels,market);
      if(idx<0)continue;
      for(const row of group?.athletes||[]){
        const athlete=row?.athlete||{};
        const stats=Array.isArray(row?.stats)?row.stats:[];
        const value=safeNumber(stats[idx]);
        if(value==null)continue;
        out.push({
          playerId:String(athlete.id||""),
          playerName:String(athlete.displayName||athlete.fullName||""),
          value:Number(value),
        });
      }
    }
  }
  return out;
}

function extractFirstTd(payload:any){
  const plays=Array.isArray(payload?.scoringPlays)?payload.scoringPlays:[];
  const first=plays.find((play:any)=>{
    const type=norm(play?.scoringType?.name||play?.scoringType?.abbreviation||play?.type?.text);
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
  return athletes.filter((athlete:any)=>{
    const id=String(athlete.id||"");
    if(!id||seen.has(id))return false;
    seen.add(id);
    return true;
  }).map((athlete:any)=>({
    playerId:String(athlete.id),
    playerName:String(athlete.displayName||athlete.fullName||""),
    value:1,
  }));
}

function gameClock(status:string){
  const quarter=(status.match(/Q[1-4]|OT\d*|HALF/i)||[])[0]||"";
  const clock=(status.match(/\d{1,2}:\d{2}/)||[])[0]||"";
  return {quarter,clock};
}

export async function GET(req:NextRequest){
  const market=(req.nextUrl.searchParams.get("market")||"passing_yards") as CfbMarketKey;
  try{
    const schedule=await getEspnCfbSchedule();
    const active=schedule.filter((game:any)=>game.state==="in"||game.completed);

    const games=await Promise.all(active.map(async(game:any)=>{
      const matchup=`${game.awayTeam} @ ${game.homeTeam}`;
      const {quarter,clock}=gameClock(String(game.status||""));
      try{
        const payload=await fetchJson(`${SUMMARY}?event=${encodeURIComponent(game.id)}`);
        const rows=market==="first_td"?extractFirstTd(payload):extractPlayerStats(payload,market);
        return {
          gameId:String(game.id),
          matchup,
          state:String(game.state||""),
          completed:Boolean(game.completed),
          status:String(game.status||""),
          quarter,
          clock,
          rows,
        };
      }catch{
        return {
          gameId:String(game.id),
          matchup,
          state:String(game.state||""),
          completed:Boolean(game.completed),
          status:String(game.status||""),
          quarter,
          clock,
          rows:[],
        };
      }
    }));

    return NextResponse.json({success:true,market,games,updatedAt:new Date().toISOString()});
  }catch(e){
    return NextResponse.json({
      success:false,
      market,
      games:[],
      error:e instanceof Error?e.message:"CFB live data unavailable",
    },{status:500});
  }
}
