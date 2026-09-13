import {NextRequest,NextResponse} from "next/server";
import {CFB_MARKETS,type CfbMarketKey,cleanName} from "@/lib/cfb";
import {getEspnCfbSchedule} from "@/lib/cfb-server";
import {cfbDay,getCfbPredictions,saveGradedCfbPredictions,type SavedCfbPrediction} from "@/lib/cfb-history";

export const dynamic="force-dynamic"; export const revalidate=0;
const ATHLETE_BASE="https://site.web.api.espn.com/apis/common/v3/sports/football/college-football/athletes";
const KEYS:Partial<Record<CfbMarketKey,string[]>>={
 passing_yards:["passingyards","passyards","yds"],pass_completions:["completions","passingcompletions","cmp"],
 rushing_yards:["rushingyards","rushyards","yds"],receiving_yards:["receivingyards","receptionyards","recyards","yds"],
 receptions:["receptions","rec"],anytime_td:["totaltouchdowns","touchdowns","rushingreceivingtouchdowns","td"]
};
const norm=(v:any)=>String(v??"").toLowerCase().replace(/[^a-z0-9]/g,"");
async function log(id:string,season:number){const r=await fetch(`${ATHLETE_BASE}/${encodeURIComponent(id)}/gamelog?season=${season}`,{cache:"no-store",headers:{"User-Agent":"Mozilla/5.0",Accept:"application/json, text/plain, */*"}});return r.ok?r.json():null}
function actualFrom(payload:any,m:CfbMarketKey,day:string){
 if(!payload||m==="first_td")return null;
 const names=(Array.isArray(payload.names)?payload.names:[]).map(norm);let ix=-1;
 for(const k of KEYS[m]||[]){ix=names.findIndex((n:string)=>n===k);if(ix>=0)break} if(ix<0)return null;
 const events=payload.events||{};
 for(const st of payload.seasonTypes||[])for(const c of st.categories||[])if(c?.type==="event")for(const ev of c.events||[]){
   const id=String(ev?.eventId||""); const meta=events[id]||{};
   const date=meta?.gameDate||meta?.date||meta?.startDate||ev?.gameDate||ev?.date||"";
   if(date&&cfbDay(date)!==day)continue;
   const v=Number(Array.isArray(ev.stats)?ev.stats[ix]:NaN);if(Number.isFinite(v))return v;
 }
 return null;
}
function settle(p:SavedCfbPrediction,actual:number){
 if(p.market==="anytime_td"||p.market==="first_td")return actual>0?"hit":"miss";
 if(p.sportsbookLine==null)return "void";
 if(actual>p.sportsbookLine)return "hit"; if(actual<p.sportsbookLine)return "miss"; return "push";
}
async function firstTdResult(gameId:string,playerName:string){
 try{
  const r=await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/college-football/summary?event=${encodeURIComponent(gameId)}`,{cache:"no-store",headers:{"User-Agent":"Mozilla/5.0",Accept:"application/json, text/plain, */*"}});
  if(!r.ok)return null;
  const payload=await r.json();
  const plays=Array.isArray(payload?.scoringPlays)?payload.scoringPlays:[];
  const td=plays.find((x:any)=>{
    const t=cleanName(String(x?.scoringType?.name||x?.scoringType?.abbreviation||x?.type?.text||""));
    const text=cleanName(String(x?.text||x?.shortText||""));
    return t.includes("touchdown")||t==="td"||text.includes("touchdown");
  });
  if(!td)return 0;
  const text=cleanName(String(td?.text||td?.shortText||""));
  const player=cleanName(playerName);
  const last=player.split(" ").filter(Boolean).pop()||player;
  return text.includes(player)||(last.length>=3&&text.split(" ").includes(last))?1:0;
 }catch{return null}
}
function daysFor(period:string){
 const n=period==="Today"?1:period==="Yesterday"?1:period==="Week"?7:period==="Month"?31:370;
 const offset=period==="Yesterday"?1:0,days:string[]=[];
 for(let i=offset;i<offset+n;i++){const d=new Date();d.setDate(d.getDate()-i);days.push(cfbDay(d))} return days;
}
export async function GET(req:NextRequest){
 const period=req.nextUrl.searchParams.get("period")||"Today",group=req.nextUrl.searchParams.get("group")||"QB";
 const marketParam=req.nextUrl.searchParams.get("market") as CfbMarketKey|null;
 const markets=(marketParam?[marketParam]:CFB_MARKETS.map(x=>x[0])).filter(m=>CFB_MARKETS.some(x=>x[0]===m));
 try{
   const schedule=await getEspnCfbSchedule(),days=daysFor(period),all:SavedCfbPrediction[]=[];let connected=true;
   for(const day of days)for(const market of markets){
     const got=await getCfbPredictions(market,day);connected=connected&&got.connected;let changed=false;
     for(const p of got.predictions){
       if(p.status!=="pending"){all.push(p);continue}
       const game=schedule.find((g:any)=>cleanName(`${g.awayTeam} @ ${g.homeTeam}`)===cleanName(p.matchup));
       if(!game?.completed){all.push(p);continue}
       if(p.market==="first_td"){
         const actual=await firstTdResult(String(game.id||""),p.playerName);
         if(actual!=null){p.actual=actual;p.status=settle(p,actual);p.gradedAt=new Date().toISOString();changed=true}
         all.push(p);continue;
       }
       const payload=await log(p.playerId,Number(p.gameDate.slice(0,4))||2026),actual=actualFrom(payload,p.market,p.gameDate);
       if(actual!=null){p.actual=actual;p.status=settle(p,actual);p.gradedAt=new Date().toISOString();changed=true}
       all.push(p);
     }
     if(changed)await saveGradedCfbPredictions(market,day,got.predictions,got.id);
   }
   const groupMarkets=group==="QB"?new Set(["passing_yards","pass_completions"]):new Set(["rushing_yards","receiving_yards","receptions","anytime_td","first_td"]);
   const scoped=marketParam?all:all.filter(p=>groupMarkets.has(p.market));
   const settled=scoped.filter(p=>p.status==="hit"||p.status==="miss"),hits=scoped.filter(p=>p.status==="hit").length,pending=scoped.filter(p=>p.status==="pending").length;
   return NextResponse.json({success:true,connected,period,group,market:marketParam,total:scoped.length,hits,settled:settled.length,pending,
     hitRate:settled.length?Math.round(hits/settled.length*1000)/10:null,predictions:scoped.sort((a,b)=>b.savedAt.localeCompare(a.savedAt))});
 }catch(e){return NextResponse.json({success:false,connected:false,hits:0,settled:0,pending:0,hitRate:null,predictions:[],error:e instanceof Error?e.message:"CFB performance unavailable"},{status:500})}
}
