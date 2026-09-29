import {NextRequest,NextResponse} from "next/server";
import {NHL_MARKETS,type NhlMarketKey} from "@/lib/nhl";
import {getNhlPredictions,nhlDay} from "@/lib/nhl-history";
export const dynamic="force-dynamic";export const revalidate=0;
const markets=NHL_MARKETS.map(x=>x[0]) as NhlMarketKey[];const allowed=new Set<NhlMarketKey>(markets);
function dayOffset(n:number){const d=new Date();d.setDate(d.getDate()+n);return nhlDay(d)}
function range(period:string){if(period==="Yesterday")return[dayOffset(-1)];if(period==="Week")return Array.from({length:7},(_,i)=>dayOffset(-i));if(period==="Month")return Array.from({length:31},(_,i)=>dayOffset(-i));if(period==="Season")return Array.from({length:370},(_,i)=>dayOffset(-i));return[dayOffset(0)]}
export async function GET(req:NextRequest){
 const p=req.nextUrl.searchParams.get("market") as NhlMarketKey|null,period=req.nextUrl.searchParams.get("period")||"Today";
 if(p&&!allowed.has(p))return NextResponse.json({connected:false,hits:0,settled:0,pending:0,total:0,hitRate:null,results:[]});
 const use=p?[p]:markets,all:any[]=[];let connected=false;
 for(const d of range(period))for(const m of use){const x=await getNhlPredictions(m,d);connected=connected||x.connected;all.push(...x.predictions)}
 const settled=all.filter(x=>x.status==="hit"||x.status==="miss"),hits=settled.filter(x=>x.status==="hit").length,pending=all.filter(x=>x.status==="pending").length;
 return NextResponse.json({success:true,connected,hits,settled:settled.length,pending,total:all.length,hitRate:settled.length?Math.round(hits/settled.length*1000)/10:null,results:all.sort((a,b)=>String(b.savedAt).localeCompare(String(a.savedAt))).slice(0,100),updatedAt:new Date().toISOString()},{headers:{"Cache-Control":"no-store, no-cache, must-revalidate, max-age=0"}})
}
