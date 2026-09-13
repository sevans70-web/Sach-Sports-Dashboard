import {NextRequest,NextResponse} from "next/server";
import type {CfbMarketKey} from "@/lib/cfb";

export const dynamic="force-dynamic";
export const revalidate=0;

const BASE="https://site.web.api.espn.com/apis/common/v3/sports/football/college-football/athletes";

const STAT_KEYS:Partial<Record<CfbMarketKey,string[]>>={
  passing_yards:["passingyards","passyards","yds"],
  pass_completions:["completions","passingcompletions","cmp"],
  rushing_yards:["rushingyards","rushyards","yds"],
  receiving_yards:["receivingyards","receptionyards","recyards","yds"],
  receptions:["receptions","rec"],
  anytime_td:["totaltouchdowns","touchdowns","rushingreceivingtouchdowns","td"],
};
const LABELS:Partial<Record<CfbMarketKey,string>>={
  passing_yards:"Passing Yards",pass_completions:"Pass Completions",
  rushing_yards:"Rushing Yards",receiving_yards:"Receiving Yards",
  receptions:"Receptions",anytime_td:"Touchdowns",
};
function clean(v:any){return String(v??"").toLowerCase().replace(/[^a-z0-9]/g,"");}
async function fetchLog(id:string,season:number){
  const r=await fetch(`${BASE}/${encodeURIComponent(id)}/gamelog?season=${season}`,{
    cache:"no-store",
    headers:{"User-Agent":"Mozilla/5.0","Accept":"application/json, text/plain, */*","Origin":"https://www.espn.com","Referer":"https://www.espn.com/"}
  });
  if(!r.ok)throw new Error(`history ${r.status}`);
  return r.json();
}
function findIndex(payload:any,category:any,market:CfbMarketKey){
  const wanted=STAT_KEYS[market]||[];
  const pools=[
    payload?.names,category?.names,category?.labels,category?.abbreviations,
    category?.statNames,category?.displayNames
  ].filter(Array.isArray);
  for(const pool of pools){
    const names=(pool as any[]).map(clean);
    for(const key of wanted){
      const i=names.findIndex((n:string)=>n===key||n.includes(key)||key.includes(n));
      if(i>=0)return i;
    }
  }
  return -1;
}
function parseSeason(payload:any,season:number,market:CfbMarketKey){
  const events=payload?.events||{};
  const rows:any[]=[]; const seen=new Set<string>();
  for(const st of payload?.seasonTypes||[]){
    for(const category of st?.categories||[]){
      if(category?.type!=="event")continue;
      const categoryName=clean(category?.name||category?.displayName||"");
      if(market.startsWith("pass")&&categoryName&& !categoryName.includes("pass"))continue;
      if(market==="rushing_yards"&&categoryName&& !categoryName.includes("rush"))continue;
      if((market==="receiving_yards"||market==="receptions")&&categoryName&& !categoryName.includes("receiv"))continue;
      const statIndex=findIndex(payload,category,market);
      if(statIndex<0)continue;
      for(const ev of category?.events||[]){
        const eventId=String(ev?.eventId||"");
        if(!eventId||seen.has(eventId))continue;
        const value=Number(ev?.stats?.[statIndex]);
        if(!Number.isFinite(value))continue;
        const meta=events?.[eventId]||{};
        seen.add(eventId);
        rows.push({season,gameId:eventId,date:String(meta?.gameDate||ev?.gameDate||""),
          opponent:String(meta?.opponent?.displayName||meta?.opponent?.abbreviation||""),
          atVs:String(meta?.atVs||""),value});
      }
    }
  }
  return rows;
}
export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  const{id}=await params;
  const market=(req.nextUrl.searchParams.get("market")||"passing_yards") as CfbMarketKey;
  if(market==="first_td")return NextResponse.json({success:true,supported:false,points:[],statLabel:"First TD",message:"First TD does not have a reliable game-by-game stat series."});
  if(!STAT_KEYS[market])return NextResponse.json({success:true,supported:false,points:[],statLabel:"Player History",message:"This market does not have a reliable game-by-game history series."});
  const blocks=await Promise.all([2025,2026].map(async season=>{try{return parseSeason(await fetchLog(id,season),season,market)}catch{return []}}));
  const points=blocks.flat().sort((a,b)=>new Date(a.date).getTime()-new Date(b.date).getTime()).slice(-20);
  return NextResponse.json({success:true,supported:true,points,statLabel:LABELS[market]||"Player History",
    message:points.length?"":"No verified game-by-game history was returned for this player and market.",updatedAt:new Date().toISOString()});
}
