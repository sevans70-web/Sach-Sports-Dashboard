import {NextRequest,NextResponse} from "next/server";
import {CFB_MARKETS,type CfbMarketKey,cleanName,safeNumber} from "@/lib/cfb";
import {getEspnCfbSchedule} from "@/lib/cfb-server";
import {cfbDay,getCfbPredictions,getCfbPredictionsForDays,saveGradedCfbPredictions,type SavedCfbPrediction} from "@/lib/cfb-history";

export const dynamic="force-dynamic"; export const revalidate=0;
const SUMMARY="https://site.api.espn.com/apis/site/v2/sports/football/college-football/summary";
const LABELS:Record<CfbMarketKey,string[]>={passing_yards:["passingyards","passing yards","pass yds","yds"],pass_completions:["completions","passing completions","cmp"],rushing_yards:["rushingyards","rushing yards","rush yds","car-yds"],receiving_yards:["receivingyards","receiving yards","rec yds"],receptions:["receptions","rec"],anytime_td:["totaltouchdowns","touchdowns","td"],first_td:["first touchdown","firsttd"]};
const norm=(v:any)=>String(v??"").toLowerCase().replace(/[^a-z0-9]/g,"");
async function summary(id:string){const r=await fetch(`${SUMMARY}?event=${encodeURIComponent(id)}`,{cache:"no-store",headers:{Accept:"application/json","User-Agent":"Mozilla/5.0"}});return r.ok?r.json():null}
function statIndex(labels:any[],market:CfbMarketKey){const n=labels.map(norm),a=LABELS[market].map(norm);for(const x of a){const i=n.findIndex((v:string)=>v===x);if(i>=0)return i}for(const x of a){const i=n.findIndex((v:string)=>v&&(v.includes(x)||x.includes(v)));if(i>=0)return i}return -1}
function actualFromSummary(payload:any,market:CfbMarketKey,playerId:string,playerName:string){
  if(!payload||market==="first_td")return null;
  for(const team of Array.isArray(payload?.boxscore?.players)?payload.boxscore.players:[]){
    for(const group of team?.statistics||[]){
      const ix=statIndex(Array.isArray(group?.labels)?group.labels:[],market);if(ix<0)continue;
      for(const row of group?.athletes||[]){const a=row?.athlete||{},id=String(a.id||""),name=cleanName(a.displayName||a.fullName||"");if((playerId&&id===playerId)||name===cleanName(playerName)){const v=safeNumber((row?.stats||[])[ix]);if(v!=null)return Number(v)}}
    }
  }
  return null;
}
function firstTdResult(payload:any,playerName:string){const plays=Array.isArray(payload?.scoringPlays)?payload.scoringPlays:[],td=plays.find((x:any)=>{const t=cleanName(String(x?.scoringType?.name||x?.scoringType?.abbreviation||x?.type?.text||"")),text=cleanName(String(x?.text||x?.shortText||""));return t.includes("touchdown")||t==="td"||text.includes("touchdown")});if(!td)return 0;const text=cleanName(String(td?.text||td?.shortText||"")),player=cleanName(playerName),last=player.split(" ").filter(Boolean).pop()||player;return text.includes(player)||(last.length>=3&&text.split(" ").includes(last))?1:0}
function settle(p:SavedCfbPrediction,actual:number){if(p.market==="anytime_td"||p.market==="first_td")return actual>0?"hit":"miss";if(p.sportsbookLine==null)return "void";if(actual===p.sportsbookLine)return "push";const pick=p.pick||(p.modelProjection!=null&&p.modelProjection<p.sportsbookLine?"under":"over");return pick==="under"?(actual<p.sportsbookLine?"hit":"miss"):(actual>p.sportsbookLine?"hit":"miss")}
function daysFor(period:string){const n=period==="Today"?1:period==="Yesterday"?1:period==="Week"?7:period==="Month"?31:370,offset=period==="Yesterday"?1:0,days:string[]=[];for(let i=offset;i<offset+n;i++){const d=new Date();d.setDate(d.getDate()-i);days.push(cfbDay(d))}return days}
function windowName(v:string){const d=new Date(v);if(Number.isNaN(d.getTime()))return "Other";const h=Number(new Intl.DateTimeFormat("en-US",{timeZone:"America/Toronto",hour:"numeric",hourCycle:"h23"}).format(d));return h<14?"12 PM":h<18?"Afternoon":"Evening"}
export async function GET(req:NextRequest){
  const period=req.nextUrl.searchParams.get("period")||"Today",group=req.nextUrl.searchParams.get("group")||"QB",marketParam=req.nextUrl.searchParams.get("market") as CfbMarketKey|null,windowParam=req.nextUrl.searchParams.get("window");
  const markets=(marketParam?[marketParam]:CFB_MARKETS.map(x=>x[0])).filter(m=>CFB_MARKETS.some(x=>x[0]===m)) as CfbMarketKey[],days=daysFor(period);
  try{
    const [schedule,batch]=await Promise.all([getEspnCfbSchedule(),getCfbPredictionsForDays(markets,days)]);const all=[...batch.predictions],byBucket=new Map<string,SavedCfbPrediction[]>(),summaryCache=new Map<string,any>();
    for(const p of all){const k=`${p.market}|${p.gameDate}`;byBucket.set(k,[...(byBucket.get(k)||[]),p])}
    for(const [bucket,predictions] of byBucket){const [market,day]=bucket.split("|") as [CfbMarketKey,string];let changed=false;
      for(const p of predictions){if(p.status!=="pending")continue;const game=schedule.find((g:any)=>(p.gameId&&String(g.id)===String(p.gameId))||cleanName(`${g.awayTeam} @ ${g.homeTeam}`)===cleanName(p.matchup));if(!game?.completed)continue;let payload=summaryCache.get(String(game.id));if(payload===undefined){payload=await summary(String(game.id));summaryCache.set(String(game.id),payload)}if(!payload)continue;const actual=market==="first_td"?firstTdResult(payload,p.playerName):actualFromSummary(payload,market,p.playerId,p.playerName);if(actual!=null){p.actual=actual;p.status=settle(p,actual);p.gradedAt=new Date().toISOString();changed=true}}
      if(changed){const db=await getCfbPredictions(market,day);const merged=db.predictions.map(old=>predictions.find(p=>p.key===old.key)||old);await saveGradedCfbPredictions(market,day,merged,db.id)}
    }
    const groupMarkets=group==="QB"?new Set(["passing_yards","pass_completions"]):new Set(["rushing_yards","receiving_yards","receptions","anytime_td","first_td"]);let scoped=marketParam?all:all.filter(p=>groupMarkets.has(p.market));if(windowParam)scoped=scoped.filter(p=>windowName(p.gameTime)===windowParam);const settled=scoped.filter(p=>p.status==="hit"||p.status==="miss"),hits=scoped.filter(p=>p.status==="hit").length,pending=scoped.filter(p=>p.status==="pending").length;
    return NextResponse.json({success:true,connected:batch.connected,period,group,market:marketParam,window:windowParam,total:scoped.length,hits,settled:settled.length,pending,hitRate:settled.length?Math.round(hits/settled.length*1000)/10:null,windows:["12 PM","Afternoon","Evening"],predictions:scoped.sort((a,b)=>b.savedAt.localeCompare(a.savedAt))});
  }catch(e){return NextResponse.json({success:false,connected:false,hits:0,settled:0,pending:0,total:0,hitRate:null,predictions:[],error:e instanceof Error?e.message:"CFB performance unavailable"},{status:500})}
}
