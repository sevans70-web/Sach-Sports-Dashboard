import {footballQuarterRows} from "@/lib/football-quarter-stats";
import {retainPlayerHistory} from '@/lib/player-history-cloud';
import {providerFetch as fetch} from "@/lib/provider-fetch";
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
function statIndex(payload:any,market:CfbMarketKey){
  const names=(Array.isArray(payload?.names)?payload.names:[]).map(clean);
  for(const wanted of STAT_KEYS[market]||[]){
    const i=names.findIndex((n:string)=>n===wanted);
    if(i>=0)return i;
  }
  return -1;
}
function parseSeason(payload:any,season:number,market:CfbMarketKey){
  const ix=statIndex(payload,market);
  if(ix<0)return [];
  const events=payload?.events||{};
  const rows:any[]=[];const seen=new Set<string>();
  for(const st of payload?.seasonTypes||[]){
    for(const category of st?.categories||[]){
      if(category?.type!=="event")continue;
      for(const ev of category?.events||[]){
        const eventId=String(ev?.eventId||"");
        if(!eventId||seen.has(eventId))continue;
        const raw=Array.isArray(ev?.stats)?ev.stats[ix]:undefined;
        const value=Number(raw);
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
async function loadHistory(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  const{id}=await params;
  const market=(req.nextUrl.searchParams.get("market")||"passing_yards") as CfbMarketKey;
  if(["q1_passing_yards","q1_rushing_yards","q1_receiving_yards"].includes(market)){
    const base=market.slice(3) as CfbMarketKey;
    const cutoff=Date.parse(req.nextUrl.searchParams.get('before')||new Date().toISOString());
    const logs=await Promise.all([2025,2026].map(async season=>{try{return parseSeason(await fetchLog(id,season),season,base)}catch{return []}}));
    const games=logs.flat().filter(p=>Date.parse(p.date)<cutoff).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date)).slice(-8);
    const points=(await Promise.all(games.map(async game=>{
      try{
        const response=await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/college-football/summary?event=${encodeURIComponent(game.gameId)}`,{cache:'no-store',signal:AbortSignal.timeout(5000)});
        if(!response.ok)return null;const payload=await response.json();
        if(String(payload?.header?.id)!==String(game.gameId)||payload?.header?.competitions?.[0]?.status?.type?.completed!==true)return null;
        const value=footballQuarterRows(payload).find(p=>p.playerId===id)?.stats[market];
        return value==null?null:{...game,value,period:'q1',source:'Official play-by-play reconciled to boxscore'};
      }catch{return null}
    }))).filter(p=>p!=null);
    return NextResponse.json({success:true,supported:true,points,statLabel:'First-quarter yards',message:points.length?'':'No complete, reconciled first-quarter history available.'});
  }
  if(market==="first_td")return NextResponse.json({success:true,supported:false,points:[],statLabel:"First TD",message:"First TD does not have a reliable game-by-game stat series."});
  if(!STAT_KEYS[market])return NextResponse.json({success:true,supported:false,points:[],statLabel:"Player History",message:"This market does not have a reliable game-by-game history series."});
  const blocks=await Promise.all([2025,2026].map(async season=>{try{return parseSeason(await fetchLog(id,season),season,market)}catch{return []}}));
  const points=blocks.flat().sort((a,b)=>new Date(a.date).getTime()-new Date(b.date).getTime()).slice(-20);
  return NextResponse.json({success:true,supported:true,points,statLabel:LABELS[market]||"Player History",
    message:points.length?"":"No verified game-by-game history was returned for this player and market.",updatedAt:new Date().toISOString()});
}

export async function GET(req:NextRequest,context:{params:Promise<{id:string}>}){
 const {id}=await context.params;const response=await loadHistory(req,context);
 return retainPlayerHistory('cfb',id,req.nextUrl.searchParams.get('market')||'passing_yards',response,req.nextUrl.searchParams.get('before'));
}
