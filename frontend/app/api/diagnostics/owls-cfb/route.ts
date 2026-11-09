import {NextRequest,NextResponse} from 'next/server';
import {COLLEGE_AUDIT_BOOKS,getOwlsPayload,owlsFailureCategory} from '@/lib/owls-provider';
import {mainMarketQuotes} from '@/lib/main-market-quotes';
import {owlsFeedSummary} from '@/lib/owls-feed-summary';
export const dynamic='force-dynamic';
export const revalidate=0;
/** Shares the ranking feed cache and runtime binding reader. Never returns raw
 * provider responses, which may contain account information or reflected keys. */
export async function GET(req:NextRequest){
 const sport=req.nextUrl.searchParams.get('sport')||'cfb';
 if(!['nba','cfb','cbb'].includes(sport))return NextResponse.json({ok:false,error:'Unsupported sport'},{status:400});
 const requestedBook=req.nextUrl.searchParams.get('book');
 const book=COLLEGE_AUDIT_BOOKS.find(item=>item===requestedBook);
 if(requestedBook&&(sport!=='cbb'||!book))return NextResponse.json({ok:false,error:'Unsupported college audit book'},{status:400});
 const providerSport=sport==='cfb'?'ncaaf':sport==='cbb'?'ncaab':'nba';
 const testedEndpoint=`/api/v1/${providerSport}/props`+(book?'/'+book:'');
 const headers={'Cache-Control':'no-store'};
 try{
  const payload=await getOwlsPayload(sport==='cfb'?'ncaaf':sport as 'nba'|'cbb',book);
  const upcomingPoints=book?mainMarketQuotes(payload,'points',prop=>['points','playerpoints'].includes(String(prop.category??prop.market??prop.type).toLowerCase().replace(/[^a-z0-9]/g,''))).filter(quote=>Date.parse(quote.gameTime)>Date.now()).length:undefined;
  return NextResponse.json({ok:true,sport,testedEndpoint,...owlsFeedSummary(payload),upcomingPoints},{headers});
 }catch(error){
  return NextResponse.json({ok:false,sport,testedEndpoint,error:owlsFailureCategory(error)},{status:503,headers});
 }
}
