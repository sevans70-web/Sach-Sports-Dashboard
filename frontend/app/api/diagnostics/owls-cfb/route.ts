import {NextRequest,NextResponse} from 'next/server';
import {getOwlsPayload,owlsFailureCategory} from '@/lib/owls-provider';
import {owlsFeedSummary} from '@/lib/owls-feed-summary';
export const dynamic='force-dynamic';
export const revalidate=0;
/** Shares the ranking feed cache and runtime binding reader. Never returns raw
 * provider responses, which may contain account information or reflected keys. */
export async function GET(req:NextRequest){
 const sport=req.nextUrl.searchParams.get('sport')||'cfb';
 if(!['nba','cfb','cbb'].includes(sport))return NextResponse.json({ok:false,error:'Unsupported sport'},{status:400});
 const providerSport=sport==='cfb'?'ncaaf':sport==='cbb'?'ncaab':'nba';
 const headers={'Cache-Control':'no-store'};
 try{
  const payload=await getOwlsPayload(sport==='cfb'?'ncaaf':sport as 'nba'|'cbb');
  return NextResponse.json({ok:true,sport,testedEndpoint:`/api/v1/${providerSport}/props`,...owlsFeedSummary(payload)},{headers});
 }catch(error){
  return NextResponse.json({ok:false,sport,testedEndpoint:`/api/v1/${providerSport}/props`,error:owlsFailureCategory(error)},{status:503,headers});
 }
}
