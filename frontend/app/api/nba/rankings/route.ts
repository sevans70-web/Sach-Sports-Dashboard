import {NextRequest,NextResponse} from "next/server";
import {type NbaMarketKey,NBA_MARKETS} from "@/lib/nba";
import {buildNbaMarketRankings} from "@/lib/nba-rankings-server";

export const dynamic="force-dynamic";
export const revalidate=0;
const allowed=new Set(NBA_MARKETS.map(x=>x[0]));

export async function GET(req:NextRequest){
 const market=(req.nextUrl.searchParams.get("market")||"points") as NbaMarketKey;
 if(!allowed.has(market))return NextResponse.json({success:false,rows:[],error:"Unsupported NBA market"},{status:400});
 const result=await buildNbaMarketRankings(market);
 return NextResponse.json(result,{status:200,headers:{"Cache-Control":"no-store, no-cache, must-revalidate, max-age=0"}});
}
