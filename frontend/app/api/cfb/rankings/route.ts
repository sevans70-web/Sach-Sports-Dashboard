import {NextRequest,NextResponse} from "next/server";
import {CFB_MARKETS,type CfbMarketKey,cleanName} from "@/lib/cfb";
import {getCfbRankings,getEspnCfbSchedule} from "@/lib/cfb-server";

export const dynamic="force-dynamic";

const ATHLETE_BASE="https://site.web.api.espn.com/apis/common/v3/sports/football/college-football/athletes";

const HISTORY_KEYS:Partial<Record<CfbMarketKey,string[]>>={
  passing_yards:["passingyards"],
  pass_completions:["completions","passingcompletions"],
  rushing_yards:["rushingyards"],
  receiving_yards:["receivingyards","receptionyards"],
  receptions:["receptions"],
  anytime_td:["totaltouchdowns","touchdowns","rushingreceivingtouchdowns"],
};

function easternDayKey(value:Date|string){
  const d=typeof value==="string"?new Date(value):value;
  if(Number.isNaN(d.getTime()))return "";
  const parts=new Intl.DateTimeFormat("en-CA",{
    timeZone:"America/Toronto",
    year:"numeric",
    month:"2-digit",
    day:"2-digit",
  }).formatToParts(d);
  const get=(type:string)=>parts.find(p=>p.type===type)?.value||"";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function rowGameTime(row:any,schedule:any[]){
  if(row.gameTime)return String(row.gameTime);
  if(row.teamId){
    const g=schedule.find(x=>String(x.awayTeamId)===String(row.teamId)||String(x.homeTeamId)===String(row.teamId));
    if(g?.date)return String(g.date);
  }
  if(row.matchup){
    const target=cleanName(String(row.matchup));
    const g=schedule.find(x=>cleanName(`${x.awayTeam} @ ${x.homeTeam}`)===target);
    if(g?.date)return String(g.date);
  }
  return "";
}

function cleanKey(v:string){
  return String(v||"").toLowerCase().replace(/[^a-z0-9]/g,"");
}

async function fetchGameLog(playerId:string,season:number){
  const r=await fetch(`${ATHLETE_BASE}/${encodeURIComponent(playerId)}/gamelog?season=${season}`,{
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

function valuesFromGameLog(payload:any,market:CfbMarketKey){
  const wanted=HISTORY_KEYS[market]||[];
  if(!wanted.length)return [];

  const names=(payload?.names||[]).map((x:any)=>cleanKey(String(x)));
  let statIndex=-1;
  for(const key of wanted){
    const i=names.findIndex((n:string)=>n===key);
    if(i>=0){statIndex=i;break}
  }
  if(statIndex<0)return [];

  const values:number[]=[];
  const seen=new Set<string>();

  for(const seasonType of payload?.seasonTypes||[]){
    for(const category of seasonType?.categories||[]){
      if(category?.type!=="event")continue;
      for(const event of category?.events||[]){
        const eventId=String(event?.eventId||"");
        if(!eventId||seen.has(eventId))continue;
        const value=Number(event?.stats?.[statIndex]);
        if(!Number.isFinite(value))continue;
        seen.add(eventId);
        values.push(value);
      }
    }
  }
  return values;
}

function weightedProjection(values:number[]){
  const xs=values.slice(-10);
  if(!xs.length)return null;

  let weighted=0;
  let weightTotal=0;
  xs.forEach((value,index)=>{
    const weight=index+1;
    weighted+=value*weight;
    weightTotal+=weight;
  });
  return Math.round((weighted/weightTotal)*10)/10;
}

async function getProjection(playerId:string,market:CfbMarketKey){
  if(!playerId||playerId.includes(" "))return {projection:null,games:0};
  if(market==="first_td")return {projection:null,games:0};

  const seasons=[2025,2026];
  const blocks=await Promise.all(seasons.map(async season=>{
    try{return valuesFromGameLog(await fetchGameLog(playerId,season),market)}
    catch{return []}
  }));
  const values=blocks.flat().slice(-10);
  return {projection:weightedProjection(values),games:values.length};
}

export async function GET(req:NextRequest){
  const market=(req.nextUrl.searchParams.get("market")||"passing_yards") as CfbMarketKey;
  if(!CFB_MARKETS.some(x=>x[0]===market)){
    return NextResponse.json({success:false,error:"Unsupported CFB market"},{status:400});
  }

  try{
    const[allRows,schedule]=await Promise.all([getCfbRankings(market),getEspnCfbSchedule()]);
    const today=easternDayKey(new Date());

    // CRITICAL ELIGIBILITY RULE:
    // Only sportsbook-backed player props are allowed into CFB rankings.
    // Statistical fallback rows must never fill the Top 25.
    const sportsbookRows=allRows.filter((row:any)=>
      row.marketBacked===true &&
      row.sportsbookLine!=null &&
      Number(row.bookmakerCount||0)>0
    );

    // Keep completed-game players for the remainder of game day.
    // At midnight Eastern, players tied to an earlier game date drop out.
    const active=sportsbookRows.filter((row:any)=>{
      const t=rowGameTime(row,schedule);
      if(!t)return true;
      const key=easternDayKey(t);
      return !key||key>=today;
    });

    const enriched=await Promise.all(active.slice(0,25).map(async(row:any,index:number)=>{
      if(market==="first_td"){
        return {
          ...row,
          rank:index+1,
          modelProjection:null,
          projectionGames:0,
        };
      }

      const {projection,games}=await getProjection(String(row.playerId||""),market);
      return {
        ...row,
        rank:index+1,
        modelProjection:projection,
        projectionGames:games,
        perGame:projection??row.perGame??null,
      };
    }));

    return NextResponse.json({
      success:true,
      market,
      rows:enriched,
      sportsbookOnly:true,
      validRankingCount:enriched.length,
      updatedAt:new Date().toISOString(),
    });
  }catch(e){
    return NextResponse.json({
      success:false,
      market,
      rows:[],
      sportsbookOnly:true,
      error:e instanceof Error?e.message:"CFB rankings unavailable",
    },{status:500});
  }
}
