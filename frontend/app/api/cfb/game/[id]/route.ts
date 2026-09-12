import { NextRequest, NextResponse } from "next/server";
import { type CfbMarketKey } from "@/lib/cfb";
import { getCfbGameIntelligence } from "@/lib/cfb-server";

export const dynamic="force-dynamic";

export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  const props=(req.nextUrl.searchParams.get("props")||"")
    .split(",").filter(Boolean) as CfbMarketKey[];
  try{
    return NextResponse.json({
      success:true,
      intelligence:await getCfbGameIntelligence(id,props),
      updatedAt:new Date().toISOString(),
    });
  }catch(e){
    return NextResponse.json({
      success:false,
      intelligence:null,
      error:e instanceof Error?e.message:"Game Intelligence unavailable",
    },{status:500});
  }
}
