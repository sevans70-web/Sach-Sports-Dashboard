import {NextRequest,NextResponse} from "next/server";
import {type NbaMarketKey,NBA_MARKETS} from "@/lib/nba";
import {buildNbaMarketRankings} from "@/lib/nba-rankings-server";
import {nextNbaBoardDay} from '@/lib/nba-slate-board';
import {torontoHistoryDay} from '@/lib/history-archive';

export const dynamic="force-dynamic";
export const revalidate=0;
const allowed=new Set(NBA_MARKETS.map(x=>x[0]));

export async function GET(req:NextRequest){
 const market=(req.nextUrl.searchParams.get("market")||"points") as NbaMarketKey;
 if(!allowed.has(market))return NextResponse.json({success:false,rows:[],error:"Unsupported NBA market"},{status:400});
 const day=req.nextUrl.searchParams.get('day')||undefined;
 if(day&&![torontoHistoryDay(),nextNbaBoardDay()].includes(day))return NextResponse.json({success:false,rows:[],error:'Choose today or tomorrow.'},{status:400});
 const result=await buildNbaMarketRankings(market,undefined,{day});
 return NextResponse.json(result,{status:200,headers:{"Cache-Control":"no-store, no-cache, must-revalidate, max-age=0"}});
}
