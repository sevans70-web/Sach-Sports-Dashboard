import {retainPlayerHistory} from '@/lib/player-history-cloud';
import {providerFetch as fetch} from "@/lib/provider-fetch";
import {NextRequest,NextResponse} from "next/server";
import type {NflMarketKey} from "@/lib/nfl";
import {footballQuarterRows} from "@/lib/football-quarter-stats";

export const dynamic="force-dynamic";
export const revalidate=0;

const BASE="https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes";

type HistoryMarket =
  | NflMarketKey
  | "tackles"
  | "tackles_assists"
  | "sacks";

const STAT_KEYS:Partial<Record<HistoryMarket,string[]>>={
  passing_interceptions:["passinginterceptions","interceptionsthrown","interceptions","int"],
  passing_yards:["passingyards","passyards","yds"],
  passing_tds:["passingtouchdowns","passingtds","passtds","td"],
  qb_rushing_yards:["rushingyards","rushyards","yds"],
  rushing_yards:["rushingyards","rushyards","yds"],
  rushing_tds:["rushingtouchdowns","rushingtds","rushtds","td"],
  receiving_yards:["receivingyards","receptionyards","recyards","yds"],
  receptions:["receptions","rec"],
  passing_rushing_yards:["passingyards","passyards","yds"],
  rushing_receiving_yards:["rushingyards","rushyards","yds"],
  anytime_td:["totaltouchdowns","touchdowns","rushingreceivingtouchdowns","td"],
  tackles:["solotackles","solo","tacklesolo"],
  tackles_assists:["totaltackles","tackles","combinedtackles","tot"],
  sacks:["sacks","totalsacks","sack"],
};

const LABELS:Partial<Record<HistoryMarket,string>>={
  passing_interceptions:"Passing Interceptions",
  passing_yards:"Passing Yards",
  passing_tds:"Passing TDs",
  qb_rushing_yards:"QB Rushing Yards",
  passing_rushing_yards:"Passing + Rushing Yards",
  rushing_yards:"Rushing Yards",
  rushing_tds:"Rushing TDs",
  receiving_yards:"Receiving Yards",
  receptions:"Receptions",
  rushing_receiving_yards:"Rushing + Receiving Yards",
  anytime_td:"Touchdowns",
  tackles:"Tackles",
  tackles_assists:"Tackles + Assists",
  sacks:"Sacks",
};

function clean(v:any){
  return String(v??"").toLowerCase().replace(/[^a-z0-9]/g,"");
}

async function fetchLog(id:string,season:number){
  const r=await fetch(`${BASE}/${encodeURIComponent(id)}/gamelog?season=${season}`,{
    cache:"no-store",
    headers:{
      "User-Agent":"Mozilla/5.0",
      "Accept":"application/json, text/plain, */*",
      "Origin":"https://www.espn.com",
      "Referer":"https://www.espn.com/"
    }
  });

  if(!r.ok)throw new Error(`history ${r.status}`);
  return r.json();
}

function statIndexFor(payload:any,keys:string[]){
  const names=(Array.isArray(payload?.names)?payload.names:[]).map(clean);

  for(const wanted of keys){
    const i=names.findIndex((n:string)=>n===wanted);
    if(i>=0)return i;
  }

  return -1;
}

function marketIndexes(payload:any,market:HistoryMarket){
  if(market==="passing_rushing_yards"){
    return [
      statIndexFor(payload,["passingyards","passyards"]),
      statIndexFor(payload,["rushingyards","rushyards"])
    ];
  }

  if(market==="rushing_receiving_yards"){
    return [
      statIndexFor(payload,["rushingyards","rushyards"]),
      statIndexFor(payload,["receivingyards","receptionyards","recyards"])
    ];
  }

  const ix=statIndexFor(payload,STAT_KEYS[market]||[]);
  return ix>=0?[ix]:[];
}

function parseSeason(payload:any,season:number,market:HistoryMarket){
  const indexes=marketIndexes(payload,market);
  if(!indexes.length||indexes.some(i=>i<0))return [];

  const events=payload?.events||{};
  const rows:any[]=[];
  const seen=new Set<string>();

  for(const st of payload?.seasonTypes||[]){
    if(Number(st.type)===1)continue;
    for(const category of st?.categories||[]){
      if(category?.type!=="event")continue;

      for(const ev of category?.events||[]){
        const eventId=String(ev?.eventId||"");
        if(!eventId||seen.has(eventId))continue;

        const stats=Array.isArray(ev?.stats)?ev.stats:[];
        if(indexes.some(ix=>stats[ix]==null||String(stats[ix]).trim()===''||!Number.isFinite(Number(stats[ix]))))continue;
        const value=indexes.reduce((sum,ix)=>sum+Number(stats[ix]),0);

        if(!Number.isFinite(value))continue;

        const meta=events?.[eventId]||{};
        seen.add(eventId);

        rows.push({
          season,
          gameId:eventId,
          date:String(meta?.gameDate||ev?.gameDate||""),
          opponent:String(
            meta?.opponent?.displayName||
            meta?.opponent?.abbreviation||
            ""
          ),
          atVs:String(meta?.atVs||""),
          value,
          workload:(()=>{const ix=statIndexFor(payload,["passingattempts","passattempts"]);return ix>=0&&stats[ix]!=null&&String(stats[ix]).trim()!==''&&Number.isFinite(Number(stats[ix]))?Number(stats[ix]):null})()
        });
      }
    }
  }

  return rows;
}

async function loadHistory(
  req:NextRequest,
  {params}:{params:Promise<{id:string}>}
){
  const{id}=await params;

  const market=(
    req.nextUrl.searchParams.get("market")||
    "passing_yards"
  ) as HistoryMarket;

  if(market==="first_td"){
    return NextResponse.json({
      success:true,
      supported:false,
      points:[],
      statLabel:"First TD",
      message:"First TD does not have a reliable game-by-game stat series."
    });
  }

  if(String(market).startsWith("q1_")){
    if(!["q1_passing_yards","q1_rushing_yards","q1_receiving_yards"].includes(String(market)))return NextResponse.json({success:true,supported:false,points:[]});
    const base=String(market).replace(/^q1_/,"") as HistoryMarket;
    const logs=await Promise.all([2025,2026].map(async season=>{try{return parseSeason(await fetchLog(id,season),season,base)}catch{return []}}));
    const cutoff=Date.parse(req.nextUrl.searchParams.get('before')||new Date().toISOString());
    const games=logs.flat().filter(p=>Date.parse(p.date)<cutoff).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date)).slice(-8);
    const points=(await Promise.all(games.map(async game=>{
      try{
        const r=await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${encodeURIComponent(game.gameId)}`,{cache:'no-store'});if(!r.ok)return null;
        const payload=await r.json();if(String(payload.header?.id)!==String(game.gameId)||payload.header?.competitions?.[0]?.status?.type?.completed!==true)return null;
        const value=footballQuarterRows(payload).find(p=>p.playerId===id)?.stats[String(market)];
        return value==null?null:{...game,value,period:'q1',source:'Official play-by-play reconciled to boxscore'};
      }catch{return null}
    }))).filter(p=>p!=null);
    return NextResponse.json({success:true,supported:true,points,statLabel:'First-quarter yards',message:points.length?'':'No complete, reconciled first-quarter history available.'});
  }

  if(!STAT_KEYS[market]){
    return NextResponse.json({
      success:true,
      supported:false,
      points:[],
      statLabel:"Player History",
      message:"This market does not have a reliable game-by-game history series."
    });
  }

  const blocks=await Promise.all(
    [2025,2026].map(async season=>{
      try{
        return parseSeason(
          await fetchLog(id,season),
          season,
          market
        );
      }catch{
        return [];
      }
    })
  );

  const points=blocks
    .flat()
    .sort(
      (a,b)=>
        new Date(a.date).getTime()-
        new Date(b.date).getTime()
    )
    .slice(-20);

  return NextResponse.json({
    success:true,
    supported:true,
    points,
    statLabel:LABELS[market]||"Player History",
    message:points.length
      ?""
      :"No verified game-by-game history was returned for this player and market.",
    updatedAt:new Date().toISOString()
  });
}

export async function GET(req:NextRequest,context:{params:Promise<{id:string}>}){
 const {id}=await context.params;const response=await loadHistory(req,context);
 return retainPlayerHistory('nfl',id,req.nextUrl.searchParams.get('market')||'passing_yards',response,req.nextUrl.searchParams.get('before'));
}
