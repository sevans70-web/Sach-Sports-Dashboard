import {NextRequest,NextResponse} from "next/server";
import {activeSlateDate,localDateKey,previousDateKey} from "@/lib/active-slate";

export const dynamic="force-dynamic";
export const revalidate=0;

const ESPN:Record<string,string>={
  nfl:"football/nfl",
  cfb:"football/college-football",
  wnba:"basketball/wnba",
  nba:"basketball/nba",
  hockey:"hockey/nhl",
  soccer:"soccer/all",
};

function compact(day:string){return day.replaceAll("-","")}

export async function GET(req:NextRequest){
  const sport=(req.nextUrl.searchParams.get("sport")||"").toLowerCase();
  const path=ESPN[sport];
  if(!path)return NextResponse.json({success:false,error:"Unsupported sport"},{status:400});

  const today=localDateKey();
  const yesterday=previousDateKey(today);
  try{
    const url=`https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard?dates=${compact(yesterday)}&limit=200`;
    const response=await fetch(url,{cache:"no-store"});
    if(!response.ok)throw new Error(`schedule ${response.status}`);
    const payload=await response.json();
    const games=(payload.events||[]).map((e:any)=>{
      const type=e?.status?.type||{};
      return{
        state:type.state,
        completed:Boolean(type.completed),
        isLive:String(type.state||"").toLowerCase()==="in",
        isFinal:Boolean(type.completed)||String(type.state||"").toLowerCase()==="post",
      };
    });
    const slateDate=activeSlateDate(games);
    return NextResponse.json({success:true,sport,activeSlateDate:slateDate,calendarDate:today,holdingPreviousSlate:slateDate!==today});
  }catch(e){
    // On schedule failure do not guess that yesterday is live.
    return NextResponse.json({success:true,sport,activeSlateDate:today,calendarDate:today,holdingPreviousSlate:false});
  }
}
