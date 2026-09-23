import {NextRequest,NextResponse} from "next/server";
import {type WnbaMarketKey,WNBA_MARKETS} from "@/lib/wnba";
import {buildWnbaMarketRankings} from "@/lib/wnba-rankings-server";

export const dynamic="force-dynamic";
export const revalidate=0;
const allowed=new Set(WNBA_MARKETS.map(x=>x[0]));

export async function GET(req:NextRequest){
 const market=(req.nextUrl.searchParams.get("market")||"points") as WnbaMarketKey;
 if(!allowed.has(market))return NextResponse.json({success:false,rows:[],error:"Unsupported WNBA market"},{status:400});
 const result=await buildWnbaMarketRankings(market);
 return NextResponse.json(result,{status:200,headers:{"Cache-Control":"no-store, no-cache, must-revalidate, max-age=0"}});
}
