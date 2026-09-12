import {NextRequest,NextResponse} from "next/server";
import type {CfbMarketKey} from "@/lib/cfb";

export const dynamic="force-dynamic";

const BASE="https://site.web.api.espn.com/apis/common/v3/sports/football/college-football/athletes";

const STAT_KEYS:Partial<Record<CfbMarketKey,string[]>>={
  passing_yards:["passingyards"],
  pass_completions:["completions","passingcompletions"],
  rushing_yards:["rushingyards"],
  receiving_yards:["receivingyards","receptionyards"],
  receptions:["receptions"],
  anytime_td:["totaltouchdowns","touchdowns","rushingreceivingtouchdowns"],
};

const LABELS:Partial<Record<CfbMarketKey,string>>={
  passing_yards:"Passing Yards",
  pass_completions:"Pass Completions",
  rushing_yards:"Rushing Yards",
  receiving_yards:"Receiving Yards",
  receptions:"Receptions",
  anytime_td:"Touchdowns",
};

function cleanKey(v:string){
  return String(v||"").toLowerCase().replace(/[^a-z0-9]/g,"");
}

async function fetchLog(id:string,season:number){
  const url=`${BASE}/${encodeURIComponent(id)}/gamelog?season=${season}`;
  const r=await fetch(url,{
    cache:"no-store",
    headers:{
      "User-Agent":"Mozilla/5.0",
      "Accept":"application/json, text/plain, */*",
      "Origin":"https://www.espn.com",
      "Referer":"https://www.espn.com/",
    },
  });
  if(!r.ok)throw new Error(`history ${r.status}`);
  return r.json();
}

function parseSeason(payload:any,season:number,market:CfbMarketKey){
  const names=(payload?.names||[]).map((x:any)=>cleanKey(String(x)));
  const wanted=STAT_KEYS[market]||[];
  let statIndex=-1;
  for(const key of wanted){
    const i=names.findIndex((n:string)=>n===key);
    if(i>=0){statIndex=i;break}
  }
  if(statIndex<0)return [];

  const events=payload?.events||{};
  const rows:any[]=[];
  const seen=new Set<string>();

  for(const st of payload?.seasonTypes||[]){
    for(const category of st?.categories||[]){
      if(category?.type!=="event")continue;
      for(const ev of category?.events||[]){
        const eventId=String(ev?.eventId||"");
        if(!eventId||seen.has(eventId))continue;
        const raw=ev?.stats?.[statIndex];
        const value=Number(raw);
        if(!Number.isFinite(value))continue;
        const meta=events?.[eventId]||{};
        seen.add(eventId);
        rows.push({
          season,
          gameId:eventId,
          date:String(meta?.gameDate||""),
          opponent:String(meta?.opponent?.displayName||meta?.opponent?.abbreviation||""),
          atVs:String(meta?.atVs||""),
          value,
        });
      }
    }
  }
  return rows;
}

export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  const{id}=await params;
  const market=(req.nextUrl.searchParams.get("market")||"passing_yards") as CfbMarketKey;

  if(market==="first_td"){
    return NextResponse.json({
      success:true,
      supported:false,
      points:[],
      statLabel:"First TD",
      message:"First TD game-by-game history is not available as a reliable player stat, so no synthetic graph is shown.",
    });
  }
  if(!STAT_KEYS[market]){
    return NextResponse.json({success:true,supported:false,points:[],statLabel:"Player History",message:"This market does not have a reliable game-by-game history series."});
  }

  const seasons=[2025,2026];
  const blocks=await Promise.all(seasons.map(async season=>{
    try{return parseSeason(await fetchLog(id,season),season,market)}
    catch{return []}
  }));
  const points=blocks.flat().sort((a,b)=>{
    const ad=new Date(a.date).getTime(),bd=new Date(b.date).getTime();
    if(Number.isFinite(ad)&&Number.isFinite(bd))return ad-bd;
    return a.season-b.season;
  }).slice(-20);

  return NextResponse.json({
    success:true,
    supported:true,
    points,
    statLabel:LABELS[market]||"Player History",
    message:points.length?"":"No verified game-by-game history was returned for this player and market.",
    updatedAt:new Date().toISOString(),
  });
}
