import {NextRequest,NextResponse} from "next/server";
import {GET as gameSlate} from "../game-slate/route";
export const dynamic="force-dynamic";
export async function GET(req:NextRequest){
 const response=await gameSlate(req),data=await response.json(),sport=req.nextUrl.searchParams.get("sport")||"",league=req.nextUrl.searchParams.get("league")||"eng.1";
 const viewAllHref=`/${sport}/games${sport==="soccer"?"?league="+encodeURIComponent(league):""}`;
 return NextResponse.json({...data,title:sport==="nfl"?`WEEK ${data.weekNumber||""} NFL GAMES`:`${sport.toUpperCase()} CURRENT + NEXT GAMES`,viewAllHref,games:(data.games||[]).map((g:any)=>({...g,href:viewAllHref}))},{status:response.status,headers:{"Cache-Control":"no-store"}});
}
