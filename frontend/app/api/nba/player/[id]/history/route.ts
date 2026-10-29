import {basketballQ1Actual} from '@/lib/basketball-period-settlement';
import {retainPlayerHistory} from '@/lib/player-history-cloud';
import {basketballHistorySeasons,basketballHistoryWindow,basketballRegularSeasonGroups} from '@/lib/basketball-history-window';
import {providerFetch as fetch} from "@/lib/provider-fetch";
import {NextRequest,NextResponse} from "next/server";
import type {NbaMarketKey} from "@/lib/nba";
export const dynamic="force-dynamic"; export const revalidate=0;
const BASE="https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes";
const LABELS:Record<NbaMarketKey,string>={points:"Points",rebounds:"Rebounds",assists:"Assists",threes_made:"3-Pointers Made",pts_rebs_asts:"Points + Rebounds + Assists",pts_rebs:"Points + Rebounds",pts_asts:"Points + Assists",rebs_asts:"Rebounds + Assists",steals:"Steals",blocks:"Blocks",first_basket:"First Basket",q1_points:"Q1 Points",q1_rebounds:"Q1 Rebounds",q1_assists:"Q1 Assists",q1_threes_made:"Q1 3-Pointers",q1_pts_rebs_asts:"Q1 PRA"};
const clean=(v:any)=>String(v??"").toLowerCase().replace(/[^a-z0-9]/g,"");
async function fetchLog(id:string,season:number){const r=await fetch(`${BASE}/${encodeURIComponent(id)}/gamelog?season=${season}`,{cache:"no-store",headers:{"User-Agent":"Mozilla/5.0",Accept:"application/json, text/plain, */*",Origin:"https://www.espn.com",Referer:"https://www.espn.com/"}});if(!r.ok)throw new Error(`history ${r.status}`);return r.json()}
function idx(names:string[],keys:string[]){for(const k of keys){const i=names.findIndex(n=>n===k);if(i>=0)return i}return-1}
function indexes(p:any,m:NbaMarketKey){const n=(Array.isArray(p?.names)?p.names:[]).map(clean);const one=(...k:string[])=>idx(n,k);const map:Record<string,number[]>={points:[one("points","pts")],rebounds:[one("rebounds","rebs","reb")],assists:[one("assists","ast")],threes_made:[one("threepointfieldgoalsmade","threepointersmade","3pm")],steals:[one("steals","stl")],blocks:[one("blocks","blk")]};if(m==="pts_rebs_asts")return [one("points","pts"),one("rebounds","rebs","reb"),one("assists","ast")];if(m==="pts_rebs")return [one("points","pts"),one("rebounds","rebs","reb")];if(m==="pts_asts")return [one("points","pts"),one("assists","ast")];if(m==="rebs_asts")return [one("rebounds","rebs","reb"),one("assists","ast")];return (map[m]||[]).filter(x=>x>=0)}
function parse(p:any,season:number,m:NbaMarketKey){const ix=indexes(p,m);if(!ix.length||ix.some(i=>i<0))return[];const events=p?.events||{},out:any[]=[];const seen=new Set<string>();for(const st of basketballRegularSeasonGroups(p))for(const cat of st?.categories||[]){if(cat?.type!=="event")continue;for(const ev of cat?.events||[]){const id=String(ev?.eventId||"");if(!id||seen.has(id))continue;const stats=Array.isArray(ev?.stats)?ev.stats:[];if(ix.some(i=>stats[i]==null||String(stats[i]).trim()===""||!Number.isFinite(Number(stats[i]))))continue;const value=ix.reduce((s,i)=>s+Number(stats[i]),0);const meta=events?.[id]||{};seen.add(id);out.push({season,gameId:id,date:String(meta?.gameDate||ev?.gameDate||""),opponent:String(meta?.opponent?.displayName||meta?.opponent?.abbreviation||""),atVs:String(meta?.atVs||""),value})}}return out}
async function loadHistory(req:NextRequest,{params}:{params:Promise<{id:string}>}){const{id}=await params;const market=(req.nextUrl.searchParams.get("market")||"points") as NbaMarketKey;if(market.startsWith("q1_")){
 const before=req.nextUrl.searchParams.get('before');
 const blocks=await Promise.all(basketballHistorySeasons('nba',before).map(async season=>{try{return parse(await fetchLog(id,season),season,market.slice(3) as NbaMarketKey)}catch{return []}}));
 const games=basketballHistoryWindow(blocks.flat(),before).slice(-8);
 const points=(await Promise.all(games.map(async game=>{try{
  const response=await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${encodeURIComponent(game.gameId)}`,{cache:'no-store',signal:AbortSignal.timeout(5000)});
  if(!response.ok)return null;const payload=await response.json();
  if(String(payload?.header?.id)!==String(game.gameId)||payload?.header?.competitions?.[0]?.status?.type?.completed!==true)return null;
  const value=basketballQ1Actual(payload,{playerId:id},market);
  return value==null?null:{...game,value,period:'q1',source:'Official first-quarter play-by-play reconciled to quarter score'};
 }catch{return null}}))).filter(p=>p!=null);
 return NextResponse.json({success:true,supported:true,points,statLabel:LABELS[market],message:points.length?'':'Complete first-quarter history is unavailable.',updatedAt:new Date().toISOString()});
 }if(market==="first_basket")return NextResponse.json({success:true,supported:false,points:[],statLabel:LABELS[market],message:"Period/event-specific history is not available from the full-game log. Full-game totals are never substituted.",updatedAt:new Date().toISOString()});const before=req.nextUrl.searchParams.get("before");const blocks=await Promise.all(basketballHistorySeasons("nba",before).map(async s=>{try{return parse(await fetchLog(id,s),s,market)}catch{return[]}}));const points=basketballHistoryWindow(blocks.flat(),before);return NextResponse.json({success:true,supported:true,points,statLabel:LABELS[market]||"Player History",message:points.length?"":"No verified game-by-game history was returned.",updatedAt:new Date().toISOString()})}

export async function GET(req:NextRequest,context:{params:Promise<{id:string}>}){
 const {id}=await context.params;const response=await loadHistory(req,context);
 return retainPlayerHistory('nba',id,req.nextUrl.searchParams.get('market')||'points',response,req.nextUrl.searchParams.get('before'));
}
