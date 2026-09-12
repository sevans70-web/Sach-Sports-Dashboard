import {NextRequest,NextResponse} from "next/server";
import {CFB_MARKETS,type CfbMarketKey,cleanName} from "@/lib/cfb";
import {getCfbRankings,getEspnCfbSchedule} from "@/lib/cfb-server";

export const dynamic="force-dynamic";

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

export async function GET(req:NextRequest){
  const market=(req.nextUrl.searchParams.get("market")||"passing_yards") as CfbMarketKey;
  if(!CFB_MARKETS.some(x=>x[0]===market))return NextResponse.json({success:false,error:"Unsupported CFB market"},{status:400});

  try{
    const[rows,schedule]=await Promise.all([getCfbRankings(market),getEspnCfbSchedule()]);
    const today=easternDayKey(new Date());

    // Completed-game players remain visible through the rest of that calendar day.
    // At midnight Eastern, any ranking tied to an earlier game date drops out.
    const active=rows.filter((row:any)=>{
      const t=rowGameTime(row,schedule);
      if(!t)return true;
      const key=easternDayKey(t);
      return !key||key>=today;
    }).map((row:any,index:number)=>({...row,rank:index+1}));

    return NextResponse.json({success:true,market,rows:active,updatedAt:new Date().toISOString()});
  }catch(e){
    return NextResponse.json({success:false,market,rows:[],error:e instanceof Error?e.message:"CFB rankings unavailable"},{status:500});
  }
}
