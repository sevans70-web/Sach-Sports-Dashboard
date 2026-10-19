import {NextRequest,NextResponse} from "next/server";
import {providerFetch} from "@/lib/provider-fetch";
import {basketballObservedRows} from "@/lib/observed-player-stats";
import {espnParticipation} from "@/lib/player-participation";
import {officialAvailabilityRows} from '@/lib/record-notes';
export const dynamic="force-dynamic";
export const revalidate=0;
const paths:Record<string,string>={nba:"nba",wnba:"wnba",cbb:"mens-college-basketball"};
export async function GET(req:NextRequest){
 const sport=req.nextUrl.searchParams.get("sport")||"",gameId=req.nextUrl.searchParams.get("gameId")||"";
 if(!paths[sport]||!/^\d+$/.test(gameId))return NextResponse.json({success:false,rows:[],error:"Valid basketball sport and official gameId required"},{status:400});
 try{
  const response=await providerFetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/${paths[sport]}/summary?event=${gameId}`,{cache:"no-store"});
  if(!response.ok)throw Error(`Official boxscore unavailable (${response.status})`);
  const payload=await response.json();
  if(String(payload?.header?.id||"")!==gameId)throw Error("Basketball boxscore game identity mismatch");
  const status=payload.header?.competitions?.[0]?.status?.type;
  return NextResponse.json({success:true,sport,gameId,state:status?.state||"pre",rows:basketballObservedRows(payload),participants:espnParticipation(payload,sport),availability:officialAvailabilityRows(payload,sport,gameId),updatedAt:new Date().toISOString()},{headers:{"Cache-Control":"no-store"}});
 }catch(e){return NextResponse.json({success:false,rows:[],gameId,error:e instanceof Error?e.message:"Live stats unavailable"},{status:502,headers:{"Cache-Control":"no-store"}})}
}
