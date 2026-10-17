import {NextRequest,NextResponse} from "next/server";
import {providerFetch} from "@/lib/provider-fetch";
import {SOCCER_LEAGUES,SOCCER_MARKETS,type SoccerMarketKey} from "@/lib/soccer";
import {extractAppearances,hasSoccerMetric} from "@/lib/soccer-history";
import {readSoccerPredictions,saveSoccerGrades} from "@/lib/soccer-predictions";
import {soccerSettlement,type SoccerPick} from "@/lib/soccer-settlement";
export const dynamic="force-dynamic";
export const revalidate=0;
export async function GET(req:NextRequest){
 const market=req.nextUrl.searchParams.get("market") as SoccerMarketKey|null;
 const league=req.nextUrl.searchParams.get("league");
 const period=req.nextUrl.searchParams.get("period")||"Today";
 if((market&&!SOCCER_MARKETS.some(x=>x[0]===market))||(league&&!SOCCER_LEAGUES.some(x=>x[1]===league))||!["Today","Yesterday","Week","Month","Season"].includes(period))return NextResponse.json({success:false,error:"Unsupported soccer performance filter"},{status:400});
 try{
  const rows=await readSoccerPredictions(period,market||undefined,league||undefined);
  const games=new Map<string,any>();
  const pending=rows.filter(p=>p.status==="pending"&&Date.parse(p.gameTime)<=Date.now());
  const ids=[...new Set(pending.map(p=>`${p.league}|${p.gameId}`))];
  for(let i=0;i<ids.length;i+=8)await Promise.all(ids.slice(i,i+8).map(async key=>{
   const [league,id]=key.split("|");
   try{const response=await providerFetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/summary?event=${encodeURIComponent(id)}`);if(response.ok)games.set(key,await response.json())}catch{}
  }));
  const changed:SoccerPick[]=[];
  for(const pick of pending){
   pick.frozenAt ||= new Date().toISOString();
   const summary=games.get(`${pick.league}|${pick.gameId}`);
   const competition=summary?.header?.competitions?.[0];
   const status=competition?.status?.type||summary?.header?.status?.type;
   if((status?.completed||status?.state==="post")&&Number(competition?.status?.period||2)<=2){
    // A complete roster is required before a missing participant can be voided.
    if(Array.isArray(summary?.rosters)&&summary.rosters.length>=2){
     const appearances=extractAppearances(summary,{gameId:pick.gameId,gameDate:pick.gameTime});
     const appearance=appearances.find(row=>row.playerId===pick.playerId);
     if(!appearance){pick.status="void";pick.gradedAt=new Date().toISOString()}
     else if(hasSoccerMetric(appearance,pick.market)){
      pick.actual=appearance[pick.market];pick.status=soccerSettlement(pick,pick.actual);pick.gradedAt=new Date().toISOString();
     }
    }
   }
   changed.push(pick);
  }
  const writable=changed.length?await saveSoccerGrades(changed):true;
  const settled=rows.filter(p=>p.status==="hit"||p.status==="miss"),hits=settled.filter(p=>p.status==="hit").length;
  return NextResponse.json({success:true,connected:true,writable,period,market,league,hits,settled:settled.length,pending:rows.filter(p=>p.status==="pending").length,total:rows.length,hitRate:settled.length?Math.round(hits/settled.length*1000)/10:null,results:rows.sort((a,b)=>b.savedAt.localeCompare(a.savedAt)).slice(0,100),updatedAt:new Date().toISOString()},{headers:{"Cache-Control":"no-store"}});
 }catch(e){console.error("[soccer grading]",e instanceof Error?e.message:String(e));return NextResponse.json({success:false,connected:false,error:"Soccer prediction history is temporarily unavailable"},{status:503})}
}
