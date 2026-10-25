import {verifiedPropQuote} from '@/lib/prop-integrity';
import {after,NextRequest,NextResponse} from "next/server";
import {type NbaMarketKey,NBA_MARKETS} from "@/lib/nba";
import {buildNbaMarketRankings} from "@/lib/nba-rankings-server";
import {readDurableHistory} from '@/lib/durable-history';
import {nbaBoardDates} from '@/lib/nba-board-window';

export const dynamic="force-dynamic";
export const revalidate=0;
const allowed=new Set(NBA_MARKETS.map(x=>x[0]));

export async function GET(req:NextRequest){
 const market=(req.nextUrl.searchParams.get("market")||"points") as NbaMarketKey;
 if(!allowed.has(market))return NextResponse.json({success:false,rows:[],error:"Unsupported NBA market"},{status:400});
 const dates=nbaBoardDates(),requested=req.nextUrl.searchParams.get('day')||undefined;
 const day=requested&&requested in dates?dates[requested as keyof typeof dates]:requested;
 if(day&&!Object.values(dates).includes(day))return NextResponse.json({success:false,rows:[],error:'Choose the previous slate, today or tomorrow.'},{status:400});
 let result,timer:ReturnType<typeof setTimeout>|undefined;
 try{result=await Promise.race([buildNbaMarketRankings(market,undefined,{day,deferHistory:work=>after(async()=>{try{await work()}catch(e){console.error('[nba history replication]',e)}})}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Props timeout')),45000)})]);}
 catch{
  if(market==='first_basket'){
   const board=(await readDurableHistory<any>('nba','featured_first_basket',day||dates.today,true))[0];
   const rows=(board?.rows||[]).filter((row:any)=>row.market==='first_basket'&&row.lineType==='scorer'&&Date.parse(row.gameTime)>Date.now()&&verifiedPropQuote(row));
   if(rows.length)return NextResponse.json({success:true,market,rows,boardFrozen:false,source:'Recent verified first-basket prices',warning:'Refreshing scorer prices; showing recent verified quotes.'},{headers:{'Cache-Control':'no-store'}});
  }
  const saved=(await readDurableHistory<any>('nba','slate_board_'+market,day||dates.today,true))[0];
  const captured=Date.parse(saved?.capturedAt||''),lock=Date.parse(saved?.lockAt||'');
  if(!saved?.rows?.length||!Number.isFinite(captured)||!Number.isFinite(lock)||captured>=lock||Date.now()<lock)return NextResponse.json({success:false,rows:[],error:'Player props are temporarily unavailable. Please retry.'},{status:503,headers:{'Cache-Control':'no-store'}});
  result={success:true,market,boardFrozen:true,boardDay:day||dates.today,boardCapturedAt:saved.capturedAt,source:'saved_pregame_board',warning:'Live updates are temporarily unavailable. Showing the saved pregame board.',rows:saved.rows.map((row:any)=>({...row,boardFrozen:true,boardCapturedAt:saved.capturedAt,boardDay:day||dates.today,gameStatus:'Live status unavailable'}))};
 }
 finally{if(timer)clearTimeout(timer);}
 return NextResponse.json(result,{status:200,headers:{"Cache-Control":"no-store, no-cache, must-revalidate, max-age=0"}});
}
