import {NextRequest,NextResponse} from "next/server";
import {type CbbMarketKey,CBB_MARKETS} from "@/lib/cbb";
import {buildCbbMarketRankings} from "@/lib/cbb-rankings-server";

export const dynamic="force-dynamic";
export const revalidate=0;
const allowed=new Set(CBB_MARKETS.map(x=>x[0]));

export async function GET(req:NextRequest){
 const market=(req.nextUrl.searchParams.get("market")||"points") as CbbMarketKey;
 if(!allowed.has(market))return NextResponse.json({success:false,rows:[],error:"Unsupported CBB market"},{status:400});
 const result=await buildCbbMarketRankings(market);
 return NextResponse.json(result,{status:200,headers:{"Cache-Control":"no-store, no-cache, must-revalidate, max-age=0"}});
}
