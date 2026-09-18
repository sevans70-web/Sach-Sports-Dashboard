import {NextRequest,NextResponse} from "next/server";
import {CFB_MARKETS,type CfbMarketKey,cleanName} from "@/lib/cfb";
import {getEspnCfbSchedule,getCfbTeamRoster} from "@/lib/cfb-server";
import {getOwlsCfbRows} from "@/lib/cfb-owls";
import {cfbPredictionProbability,cfbGiScore} from "@/lib/cfb-prediction";
import {saveCfbPregamePredictions,getCfbResultMap} from "@/lib/cfb-history";

export const dynamic="force-dynamic"; export const revalidate=0;
const ATHLETE_BASE="https://site.web.api.espn.com/apis/common/v3/sports/football/college-football/athletes";
const HISTORY_KEYS:Partial<Record<CfbMarketKey,string[]>>={
  passing_yards:["passingyards","passyards","yds"],pass_completions:["completions","passingcompletions","cmp"],
  rushing_yards:["rushingyards","rushyards","yds"],receiving_yards:["receivingyards","receptionyards","recyards","yds"],
  receptions:["receptions","rec"],anytime_td:["totaltouchdowns","touchdowns","rushingreceivingtouchdowns","td"],
};
const norm=(v:any)=>String(v??"").toLowerCase().replace(/[^a-z0-9]/g,"");
function day(v:Date|string){const d=typeof v==="string"?new Date(v):v;if(Number.isNaN(d.getTime()))return "";const p=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Toronto",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d);const g=(t:string)=>p.find(x=>x.type===t)?.value||"";return `${g("year")}-${g("month")}-${g("day")}`}
function rowGameTime(row:any,schedule:any[]){if(row.gameTime)return String(row.gameTime);const t=cleanName(String(row.matchup||""));const g=schedule.find(x=>cleanName(`${x.awayTeam} @ ${x.homeTeam}`)===t);return g?.date?String(g.date):""}

async function resolvePlayer(name:string,teamName:string,matchup:string,schedule:any[]){
  const wanted=cleanName(name),parts=String(matchup||"").split("@").map(x=>cleanName(x.trim())).filter(Boolean),supplied=cleanName(teamName);
  const game=schedule.find((g:any)=>{const a=cleanName(g.awayTeam),h=cleanName(g.homeTeam);return parts.length===2&&((a===parts[0]&&h===parts[1])||(a===parts[1]&&h===parts[0]))});
  const ids:string[]=[];
  if(game){if(supplied){if(cleanName(game.awayTeam)===supplied)ids.push(String(game.awayTeamId||""));if(cleanName(game.homeTeam)===supplied)ids.push(String(game.homeTeamId||""))}ids.push(String(game.awayTeamId||""),String(game.homeTeamId||""))}
  for(const teamId of [...new Set(ids.filter(Boolean))]){
    try{const roster=await getCfbTeamRoster(teamId);const p=roster.players.find(x=>cleanName(x.name)===wanted)||roster.players.find(x=>{const n=cleanName(x.name);return n&&(n.includes(wanted)||wanted.includes(n))});if(p)return {id:p.id,headshot:p.headshot,teamName:roster.teamName||teamName,teamId,position:p.position,teamLogo:roster.teamLogo}}catch{}
  }
  return {id:"",headshot:"",teamName:teamName||"CFB",teamId:"",position:"",teamLogo:""};
}
async function fetchLog(id:string,season:number){const r=await fetch(`${ATHLETE_BASE}/${encodeURIComponent(id)}/gamelog?season=${season}`,{cache:"no-store",headers:{"User-Agent":"Mozilla/5.0",Accept:"application/json, text/plain, */*"}});if(!r.ok)throw 0;return r.json()}
function history(payload:any,market:CfbMarketKey){
  const names=(Array.isArray(payload?.names)?payload.names:[]).map(norm);let ix=-1;
  for(const wanted of HISTORY_KEYS[market]||[]){ix=names.findIndex((n:string)=>n===wanted);if(ix>=0)break}
  if(ix<0)return [];
  const vals:number[]=[];const seen=new Set<string>();
  for(const st of payload?.seasonTypes||[])for(const c of st?.categories||[])if(c?.type==="event")for(const ev of c?.events||[]){const id=String(ev?.eventId||"");if(!id||seen.has(id))continue;const v=Number(Array.isArray(ev?.stats)?ev.stats[ix]:NaN);if(Number.isFinite(v)){seen.add(id);vals.push(v)}}
  return vals;
}
function projection(vals:number[]){const xs=vals.slice(-10);if(!xs.length)return null;let sum=0,w=0;xs.forEach((v,i)=>{const k=i+1;sum+=v*k;w+=k});return Math.round(sum/w*10)/10}
async function model(id:string,market:CfbMarketKey){
  if(!id||market==="first_td")return {projection:null,games:0};
  const blocks=await Promise.all([2025,2026].map(async y=>{try{return history(await fetchLog(id,y),market)}catch{return []}}));
  const vals=blocks.flat();return {projection:projection(vals),games:vals.length};
}

export async function GET(req:NextRequest){
  const market=(req.nextUrl.searchParams.get("market")||"passing_yards") as CfbMarketKey;
  if(!CFB_MARKETS.some(x=>x[0]===market))return NextResponse.json({success:false,error:"Unsupported CFB market"},{status:400});
  try{
    const [owlsRows,schedule]=await Promise.all([getOwlsCfbRows(market),getEspnCfbSchedule()]);
    const today=day(new Date());
    const active=owlsRows.filter(row=>{const t=rowGameTime(row,schedule);const k=t?day(t):"";return !k||k>=today});
    const rows=await Promise.all(active.slice(0,60).map(async row=>{
      const profile=await resolvePlayer(row.playerName,row.teamName,row.matchup,schedule);
      const m=await model(profile.id,market);
      const probability=cfbPredictionProbability(market,m.projection,row.line,row.prob);
      const rankingProbability=probability??row.prob??50;
      return {rank:0,playerId:profile.id||cleanName(row.playerName),playerName:row.playerName,teamName:profile.teamName||row.teamName||"CFB",teamId:profile.teamId,position:profile.position,headshot:profile.headshot,teamLogo:profile.teamLogo,matchup:row.matchup,gameTime:row.gameTime,giScore:cfbGiScore(rankingProbability,row.bookmakerCount,m.games),modelProbability:probability??rankingProbability,sportsbookLine:row.line,sportsbookProbability:row.prob,bookmakerCount:row.bookmakerCount,perGame:m.projection,modelProjection:m.projection,projectionGames:m.games,seasonTotal:null,gamesPlayed:m.games,season:2026,summary:`Sportsbook-backed ${CFB_MARKETS.find(x=>x[0]===market)?.[2]||market} prediction using ${m.games} verified historical game${m.games===1?"":"s"} and ${row.bookmakerCount} sportsbook${row.bookmakerCount===1?"":"s"}.`,marketBacked:true};
    }));
    rows.sort((a,b)=>b.giScore-a.giScore);
    const ranked=rows.slice(0,25).map((r,i)=>({...r,rank:i+1}));
    await saveCfbPregamePredictions(market,ranked,schedule);
    const results=await getCfbResultMap(market,today);
    const withResults=ranked.map(r=>{const p=results.get(`${r.playerId}|${r.matchup}`);const margin=p?.actual!=null&&p.sportsbookLine!=null?p.actual-p.sportsbookLine:null;return p?{...r,resultStatus:p.status,actualResult:p.actual,resultMargin:margin,resultSymbol:p.status==="hit"?"✅":p.status==="miss"?"❌":p.status==="push"?"➖":p.status==="void"?"VOID":""}:r});
    return NextResponse.json({success:true,source:"Owls Insight",market,rows:withResults,sportsbookOnly:true,validRankingCount:withResults.length,updatedAt:new Date().toISOString()});
  }catch(e){
    return NextResponse.json({success:false,source:"Owls Insight",market,rows:[],sportsbookOnly:true,error:e instanceof Error?e.message:"CFB rankings unavailable"},{status:500});
  }
}
