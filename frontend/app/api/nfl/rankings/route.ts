import {retainedNflRankingPayload} from '@/lib/retained-nfl-response';
import {readDurableHistory} from '@/lib/durable-history';
import {independentFootballRankings,footballSlate} from '@/lib/football-slate-rankings';
import {lockedNflBoard} from '@/lib/nfl-locked-board';
import {publishFeaturedBoards} from '@/lib/research-capture';
import {rankingSourceState} from '@/lib/ranking-source-state';
import {attachFittedResearchForecasts} from '@/lib/live-model-forecast';
import {espnParticipation} from "@/lib/player-participation";
import {footballQuarterRows} from "@/lib/football-quarter-stats";
import {footballResearchSample} from "@/lib/football-history";
import {guardRankingPayload} from "@/lib/prop-integrity";
import {getOwlsPayload} from "@/lib/owls-provider";
import {getSgoSupplement,sgoBookGames} from '@/lib/sgo-supplement';
import {footballBookRows,footballQuoteFields,footballQuoteGame} from "@/lib/football-book-quotes";
import {providerFetch as fetch} from "@/lib/provider-fetch";
import {after,NextRequest,NextResponse} from "next/server";
import {NFL_MARKETS,type NflMarketKey,cleanName,safeNumber} from "@/lib/nfl";
import {getEspnNflSchedule,getNflTeamRoster,getNflMarketRows} from "@/lib/nfl-server";
import {nflPredictionProbability,nflGiScore} from "@/lib/nfl-prediction";
import {saveNflPregamePredictions,getNflResultMap,getNflPredictions,type SavedNflPrediction} from "@/lib/nfl-history";

export const dynamic="force-dynamic";
export const revalidate=0;

const OWLS_URL="https://api.owlsinsight.com/api/v1/nfl/props";
const ATHLETE_BASE="https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes";
const CACHE_TTL_MS=10*60_000;
type CacheEntry<T>={expires:number;value:T};
const rosterCache=new Map<string,CacheEntry<any>>();
const modelCache=new Map<string,CacheEntry<{projection:number|null,games:number}>>();
const rosterPending=new Map<string,Promise<any>>();
async function cachedRoster(teamId:string){
 const hit=rosterCache.get(teamId);if(hit&&hit.expires>Date.now())return hit.value;
 let work=rosterPending.get(teamId);if(!work){work=getNflTeamRoster(teamId).then(value=>{rosterCache.set(teamId,{expires:Date.now()+CACHE_TTL_MS,value});return value}).finally(()=>rosterPending.delete(teamId));rosterPending.set(teamId,work)}return work;
}

const OWLS_MARKETS:Record<NflMarketKey,string[]>={
 sacks:["sacks","player_sacks"],tackles:["tackles","solo_tackles"],tackles_assists:["tackles_assists","total_tackles"],
 passing_yards:["passing_yards","passingyards","pass_yards","passyards"],
 passing_tds:["passing_tds","pass_tds","passing_touchdowns","passingtouchdowns"],
 qb_rushing_yards:["rushing_yards","rushingyards","rush_yards","rushyards"],
 passing_rushing_yards:["passing_rushing_yards","pass_rush_yards","passing+rushing_yards","passingrushingyards"],
 rushing_yards:["rushing_yards","rushingyards","rush_yards","rushyards"],
 rushing_tds:["rushing_tds","rush_tds","rushing_touchdowns","rushingtouchdowns","player_rush_tds"],
 receiving_yards:["receiving_yards","receivingyards","reception_yards","receptionyards"],
 receptions:["receptions","receiving_receptions","receivingreceptions"],
 rushing_receiving_yards:["rushing_receiving_yards","rush_receiving_yards","rushing+receiving_yards","rushingreceivingyards"],
 anytime_td:["anytime_td","anytime_touchdown","anytime_touchdown_scorer","touchdown_scorer","touchdowns"],
 first_td:["first_td","first_touchdown","first_touchdown_scorer","first_scorer"],
 q1_passing_yards:["passing_yards_1q","passing_1q_yards","1q_passing_yards","first_quarter_passing_yards"],
 q1_receiving_yards:["receiving_yards_1q","receiving_1q_yards","1q_receiving_yards","first_quarter_receiving_yards"],
 q1_receptions:["receptions_1q","receiving_receptions_1q","1q_receptions","first_quarter_receptions"],
 q1_qb_rushing_yards:["qb_rushing_yards_1q","qb_rushing_1q_yards","1q_qb_rushing_yards","first_quarter_qb_rushing_yards"],
 q1_rushing_yards:["rushing_yards_1q","rushing_1q_yards","1q_rushing_yards","first_quarter_rushing_yards"],
 q1_pass_attempts:["pass_attempts_1q","passing_attempts_1q","1q_pass_attempts","first_quarter_pass_attempts"],
 q1_pass_completions:["pass_completions_1q","passing_completions_1q","1q_pass_completions","first_quarter_pass_completions"],
 q1_rushing_receiving_yards:["rushing_receiving_yards_1q","rush_receiving_yards_1q","1q_rushing_receiving_yards","first_quarter_rushing_receiving_yards"],
 q1_anytime_td:["anytime_td_1q","touchdown_scorer_1q","1q_anytime_td","first_quarter_anytime_td"],
 q1_rush_attempts:["rush_attempts_1q","rushing_attempts_1q","1q_rush_attempts","first_quarter_rush_attempts"],
};
const HISTORY_KEYS:Partial<Record<NflMarketKey,string[]>>={
 sacks:["sacks","totalsacks"],tackles:["solotackles","solo"],tackles_assists:["totaltackles","tackles","combinedtackles"],
 passing_yards:["passingyards","passyards"],
 passing_tds:["passingtouchdowns","passingtds","passtds","td"],
 qb_rushing_yards:["rushingyards","rushyards"],
 passing_rushing_yards:["passingyards","passyards","yds"],
 rushing_yards:["rushingyards","rushyards"],
 rushing_tds:["rushingtouchdowns","rushingtds","rushtds","td"],
 receiving_yards:["receivingyards","receptionyards","recyards"],
 receptions:["receptions","rec"],
 rushing_receiving_yards:["rushingreceivingyards","rushreceivingyards","rushrecyards"],
 anytime_td:["totaltouchdowns","touchdowns","rushingreceivingtouchdowns","td"],
 q1_passing_yards:["passingyards","passyards"],
 q1_receiving_yards:["receivingyards","receptionyards","recyards"],
 q1_rushing_yards:["rushingyards","rushyards"],
};
function norm(v:any){return String(v??"").toLowerCase().replace(/[^a-z0-9]/g,"")}
function median(xs:number[]){const a=xs.filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return null;const i=Math.floor(a.length/2);return a.length%2?a[i]:(a[i-1]+a[i])/2}
function americanProb(v:any){const n=Number(v);if(!Number.isFinite(n)||n===0)return null;return Math.round((n>0?100/(n+100):Math.abs(n)/(Math.abs(n)+100))*1000)/10}
function categoryMatches(v:any,m:NflMarketKey){const x=norm(v);return OWLS_MARKETS[m].some(k=>norm(k)===x)}
function easternDayKey(v:Date|string){const d=typeof v==="string"?new Date(v):v;if(Number.isNaN(d.getTime()))return "";const p=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Toronto",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d);const g=(t:string)=>p.find(x=>x.type===t)?.value||"";return `${g("year")}-${g("month")}-${g("day")}`}
function rowGameTime(row:any,schedule:any[]){if(row.gameTime)return String(row.gameTime);const t=cleanName(String(row.matchup||""));const g=schedule.find(x=>cleanName(`${x.awayTeam} @ ${x.homeTeam}`)===t);return g?.date?String(g.date):""}

async function sharedOwlsGames(){
 const payload=await getOwlsPayload("nfl");return Array.isArray(payload?.data)?payload.data:[];
}
async function fetchOwlsRows(market:NflMarketKey){
 const [owls,sgo]=await Promise.allSettled([getOwlsPayload('nfl'),market.startsWith('q1_')?getSgoSupplement('NFL'):Promise.resolve({data:[]})]);
 const primary=owls.status==='fulfilled'?owls.value:null,extra=sgo.status==='fulfilled'?sgo.value:null;
 if(!primary&&!extra?.data?.length)throw Error('NFL book feeds are unavailable');
 return footballBookRows({data:[...(primary?.data||[]),...sgoBookGames(extra)]},market,OWLS_MARKETS[market],Date.now(),market.startsWith('q1_'));
}

async function resolvePlayer(name:string,teamName:string,matchup:string,schedule:any[]){
 const wanted=cleanName(name);
 const matchupTeams=String(matchup||"").split("@").map(x=>cleanName(x.trim())).filter(Boolean);
 const suppliedTeam=cleanName(teamName);
 const game=schedule.find((g:any)=>{
   const a=cleanName(g.awayTeam),h=cleanName(g.homeTeam);
   return matchupTeams.length===2&&((a===matchupTeams[0]&&h===matchupTeams[1])||(a===matchupTeams[1]&&h===matchupTeams[0]));
 });
 const candidates:string[]=[];
 if(game){
   if(suppliedTeam){
     if(cleanName(game.awayTeam)===suppliedTeam)candidates.push(String(game.awayTeamId||""));
     if(cleanName(game.homeTeam)===suppliedTeam)candidates.push(String(game.homeTeamId||""));
   }
   candidates.push(String(game.awayTeamId||""),String(game.homeTeamId||""));
 }
 for(const teamId of [...new Set(candidates.filter(Boolean))]){
   try{
     const roster=await cachedRoster(teamId);
     const exact=roster.players.find((p:any)=>cleanName(p.name)===wanted);
     const loose=roster.players.find((p:any)=>{
       const n=cleanName(p.name);return n&&wanted&&(n.includes(wanted)||wanted.includes(n));
     });
     const p=exact||loose;
     if(p)return {id:p.id,headshot:p.headshot,teamName:roster.teamName||teamName,teamId,position:p.position,teamLogo:roster.teamLogo};
   }catch{}
 }
 // Search is only a fallback. We require an athlete-shaped result, not merely any search node with the same name.
 try{
   const r=await fetch(`https://site.web.api.espn.com/apis/search/v2?query=${encodeURIComponent(name)}&limit=30&sport=football`,{cache:"no-store"});
   if(r.ok){
     const payload=await r.json(),nodes:any[]=[];
     const walk=(v:any)=>{if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==="object"){nodes.push(v);Object.values(v).forEach(walk)}};walk(payload);
     const matches=nodes.filter(n=>cleanName(String(n.displayName||n.fullName||n.name||n.title||""))===wanted)
       .filter(n=>n.position||n.headshot||n.team)
       .sort((a,b)=>Number(Boolean(b.position))+Number(Boolean(b.team))-Number(Boolean(a.position))-Number(Boolean(a.team)));
     const n=matches[0]||{};
     const id=String(n.id||n.uid||"");
     if(id)return {id,headshot:String(n.headshot?.href||n.image?.href||n.image?.url||""),teamName:String(n.team?.displayName||n.team?.name||teamName||""),teamId:String(n.team?.id||n.teamId||""),position:String(n.position?.abbreviation||n.positionAbbreviation||""),teamLogo:""};
   }
 }catch{}
 return {id:"",headshot:"",teamName:teamName||"NFL",teamId:"",position:"",teamLogo:""};
}
async function modelOnlyRows(market:NflMarketKey,schedule:any[]){
 if(market==="first_td"||market.startsWith("q1_")||["sacks","tackles","tackles_assists"].includes(market))return [];
 const positions=market.startsWith("passing")||market==="qb_rushing_yards"?new Set(["QB"]):
   market.startsWith("rushing")?new Set(["RB","FB"]):new Set(["WR","TE","RB","FB"]);
 const games=schedule.filter(g=>g.state==="pre"&&easternDayKey(g.date)>=easternDayKey(new Date()));
 const jobs=games.flatMap(g=>[{g,id:String(g.awayTeamId),name:g.awayTeam},{g,id:String(g.homeTeamId),name:g.homeTeam}]);
 return (await Promise.all(jobs.map(async({g,id,name})=>{
  const roster=await cachedRoster(id);
  return roster.players.filter((p:any)=>positions.has(String(p.position).toUpperCase())).slice(0,market.startsWith("passing")?5:6).map((p:any)=>({
   playerName:p.name,teamName:name,matchup:`${g.awayTeam} @ ${g.homeTeam}`,gameTime:g.date,line:null,prob:null,bookmakerCount:0,earlyModel:true,
   profile:{id:p.id,headshot:p.headshot,teamName:name,teamId:id,position:p.position,teamLogo:roster.teamLogo}
  }));
 }))).flat();
}
async function fetchLog(id:string,season:number){const r=await fetch(`${ATHLETE_BASE}/${encodeURIComponent(id)}/gamelog?season=${season}`,{cache:"no-store",headers:{"User-Agent":"Mozilla/5.0","Accept":"application/json, text/plain, */*","Origin":"https://www.espn.com","Referer":"https://www.espn.com/"}});if(!r.ok)throw 0;return r.json()}
async function model(id:string,market:NflMarketKey,asOf:string){
 if(!id||market==="first_td"||market.startsWith("q1_"))return {projection:null,games:0};
 const cutoff=Number.isFinite(Date.parse(asOf))?asOf:new Date().toISOString();
 const season=Number(cutoff.slice(0,4));
 try{
  const payload=await fetchLog(id,season);
  const combined:Record<string,string[][]>={passing_rushing_yards:[["passingyards","passyards"],["rushingyards","rushyards"]],rushing_receiving_yards:[["rushingyards","rushyards"],["receivingyards","receptionyards"]],anytime_td:[["rushingtouchdowns","rushingtds"],["receivingtouchdowns","receivingtds"]]};
  return footballResearchSample(payload,combined[market]||HISTORY_KEYS[market]||[],market,cutoff,season);
 }catch{return {projection:null,games:0}}
}

function teamLogo(profile:any,row:any,schedule:any[]){
 const team=cleanName(profile.teamName||row.teamName||"");
 const g=schedule.find((x:any)=>cleanName(x.awayTeam)===team||cleanName(x.homeTeam)===team);
 if(!g)return "";return cleanName(g.awayTeam)===team?String(g.awayLogo||""):String(g.homeLogo||"")
}

const ESPN_SUMMARY="https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary";
function matchupGame(schedule:any[],matchup:string){
 const wanted=cleanName(matchup);
 return schedule.find((g:any)=>cleanName(`${g.awayTeam} @ ${g.homeTeam}`)===wanted);
}
function numStat(v:any){
 const raw=String(v??"").replace(/[^0-9.-]/g,"");if(!raw)return null;const n=Number(raw);
 return Number.isFinite(n)?n:null;
}
function statFromSummary(payload:any,playerId:string,playerName:string,category:string,label:string){
 const wantedId=String(playerId||""),wantedName=cleanName(playerName),wantedCategory=cleanName(category),wantedLabel=cleanName(label);
 for(const team of payload?.boxscore?.players||[]){
  for(const group of team?.statistics||[]){
   const groupName=cleanName(group?.name||group?.displayName||group?.shortDisplayName||group?.type||"");
   if(!(groupName===wantedCategory||groupName.includes(wantedCategory)||wantedCategory.includes(groupName)))continue;
   const rawLabels=Array.isArray(group?.labels)?group.labels:Array.isArray(group?.keys)?group.keys:[];
   const labels=rawLabels.map((x:any)=>cleanName(typeof x==="string"?x:(x?.name||x?.displayName||x?.abbreviation||x?.label||"")));
   let ix=labels.findIndex((x:string)=>x===wantedLabel);
   if(ix<0&&wantedLabel==="yds")ix=labels.findIndex((x:string)=>x==="yards"||x.endsWith("yards")||x==="yds");
   if(ix<0&&wantedLabel==="rec")ix=labels.findIndex((x:string)=>x==="receptions"||x==="rec");
   if(ix<0&&wantedLabel==="td")ix=labels.findIndex((x:string)=>x==="touchdowns"||x==="td");
   if(ix<0)continue;
   for(const row of group?.athletes||[]){
    const athlete=row?.athlete||row?.player||{};
    const id=String(athlete?.id||row?.athleteId||row?.playerId||"");
    const name=cleanName(athlete?.displayName||athlete?.fullName||athlete?.name||row?.displayName||row?.name||"");
    const sameId=Boolean(wantedId&&id&&id===wantedId);
    const sameName=Boolean(wantedName&&name&&(name===wantedName||name.includes(wantedName)||wantedName.includes(name)));
    if(sameId||sameName){
     const stats=Array.isArray(row?.stats)?row.stats:Array.isArray(row?.values)?row.values:[];
     const direct=numStat(stats[ix]);
     if(direct!=null)return direct;
    }
   }
  }
 }
 return null;
}

function quarterOnePlays(payload:any){
 const all:any[]=[];
 if(Array.isArray(payload?.plays))all.push(...payload.plays);
 if(Array.isArray(payload?.drives?.previous))for(const d of payload.drives.previous)if(Array.isArray(d?.plays))all.push(...d.plays);
 if(payload?.drives?.current&&Array.isArray(payload.drives.current.plays))all.push(...payload.drives.current.plays);
 const seen=new Set<string>();
 return all.filter((play:any)=>{
   const id=String(play?.id||play?.sequenceNumber||`${play?.text||""}|${play?.clock?.displayValue||""}`);
   if(seen.has(id))return false;seen.add(id);
   const period=Number(play?.period?.number??play?.period??play?.quarter??0);
   return period===1;
 });
}
function participantMatches(participant:any,playerId:string,playerName:string){
 const athlete=participant?.athlete||participant?.player||participant||{};
 const id=String(athlete?.id||participant?.athleteId||participant?.playerId||"");
 const name=cleanName(athlete?.displayName||athlete?.fullName||athlete?.name||participant?.displayName||participant?.name||"");
 const wanted=cleanName(playerName),last=wanted.split(" ").filter(Boolean).pop()||wanted;
 return Boolean((playerId&&id&&id===String(playerId))||(wanted&&name&&(name===wanted||name.includes(wanted)||wanted.includes(name)))||(last.length>=3&&name.split(" ").includes(last)));
}
function firstTdFromSummary(payload:any,playerName:string){
 const plays=Array.isArray(payload?.scoringPlays)?payload.scoringPlays:[];
 const td=plays.find((x:any)=>{
  const kind=cleanName(x?.scoringType?.name||x?.scoringType?.abbreviation||x?.type?.text||"");
  const text=cleanName(x?.text||x?.shortText||"");
  return kind.includes("touchdown")||kind==="td"||text.includes("touchdown");
 });
 if(!td)return 0;
 const text=cleanName(td?.text||td?.shortText||""),name=cleanName(playerName),last=name.split(" ").filter(Boolean).pop()||name;
 return text.includes(name)||(last.length>=3&&text.split(" ").includes(last))?1:0;
}
function q1TouchdownsFromSummary(payload:any,playerName:string){
 const name=cleanName(playerName),last=name.split(" ").filter(Boolean).pop()||name;let count=0;
 for(const drive of payload?.drives?.previous||[])for(const play of drive?.plays||[]){
  const q=Number(play?.period?.number??play?.period??0);if(q!==1)continue;
  const text=cleanName(play?.text||play?.shortText||"");
  const playerHit=text.includes(name)||(last.length>=3&&text.split(" ").includes(last));
  if(playerHit&&/touchdown| td /.test(` ${text} `))count+=1;
 }
 return count||0;
}
function currentMarketStat(payload:any,market:NflMarketKey,playerId:string,playerName:string){
 const passingYds=()=>statFromSummary(payload,playerId,playerName,"passing","YDS");
 const passingTd=()=>statFromSummary(payload,playerId,playerName,"passing","TD");
 const rushingYds=()=>statFromSummary(payload,playerId,playerName,"rushing","YDS");
 const receivingYds=()=>statFromSummary(payload,playerId,playerName,"receiving","YDS");
 const receptions=()=>statFromSummary(payload,playerId,playerName,"receiving","REC");
 const rushingTd=()=>statFromSummary(payload,playerId,playerName,"rushing","TD");
 const receivingTd=()=>statFromSummary(payload,playerId,playerName,"receiving","TD");
 if(market==="passing_yards")return passingYds();
 if(market==="passing_tds")return passingTd();
 if(market==="qb_rushing_yards"||market==="rushing_yards")return rushingYds();
 if(market==="rushing_tds")return rushingTd();
 if(market==="receiving_yards")return receivingYds();
 if(market==="receptions")return receptions();
 if(["sacks","tackles","tackles_assists"].includes(market))return statFromSummary(payload,playerId,playerName,"defensive",market==="sacks"?"SACKS":market==="tackles"?"SOLO":"TOT");
 if(market==="passing_rushing_yards"){const a=passingYds(),b=rushingYds();return a==null&&b==null?null:(a||0)+(b||0)}
 if(market==="rushing_receiving_yards"){const a=rushingYds(),b=receivingYds();return a==null&&b==null?null:(a||0)+(b||0)}
 if(market==="anytime_td"){const a=rushingTd(),b=receivingTd();return a==null&&b==null?null:(a||0)+(b||0)}
 if(market==="first_td")return firstTdFromSummary(payload,playerName);

 return null;
}
async function liveContext(rows:any[],schedule:any[],market:NflMarketKey){
 const gameMap=new Map<string,any>();
 for(const row of rows){const g=matchupGame(schedule,row.matchup);if(g?.id)gameMap.set(String(g.id),g)}
 const summaries=new Map<string,any>();
 await Promise.all([...gameMap.values()].filter((g:any)=>g.state==="in"||g.completed||g.state==="post").map(async(g:any)=>{
  try{const r=await fetch(`${ESPN_SUMMARY}?event=${encodeURIComponent(g.id)}`,{cache:"no-store"});if(r.ok)summaries.set(String(g.id),await r.json())}catch{}
 }));
 return rows.map(row=>{
  const g=matchupGame(schedule,row.matchup);
  if(!g)return row;
  const payload=summaries.get(String(g.id));
  const participant=payload&&String(payload?.header?.id)===String(g.id)?espnParticipation(payload,"nfl").find(p=>p.playerId===String(row.playerId)):null;
  const current=payload&&String(payload?.header?.id)===String(g.id)?footballQuarterRows(payload).find(p=>p.playerId===String(row.playerId))?.stats[market]??null:null;
  const line=Number(row.sportsbookLine);
  const pct=current!=null&&Number.isFinite(line)&&line>0?Math.max(0,Math.min(200,Math.round(current/line*100))):null;
  return {...row,participationConfirmed:participant?.participationConfirmed===true,starterConfirmed:participant?.starterConfirmed===true,participationGameId:String(g.id),gameId:String(g.id||""),gameState:String(g.state||"pre"),gameStatus:String(g.status||""),gameTime:row.gameTime||g.date||"",liveCurrent:current,liveProgressPct:pct};
 });
}

const refreshes=new Set<string>();
export async function GET(req:NextRequest){return rankings(req)}
async function rankings(req:NextRequest,refresh=false):Promise<Response>{
 const market=(req.nextUrl.searchParams.get("market")||"passing_yards") as NflMarketKey;
 if(!NFL_MARKETS.some(x=>x[0]===market))return rankingJson({success:false,error:"Unsupported NFL market"},{status:400});
 let locked:any=null;
 try{
  const lockSchedule=await getEspnNflSchedule();
  locked=await lockedNflBoard(market,lockSchedule);
  if(!refresh){
   const day=easternDayKey(new Date()),published=(await readDurableHistory<any>('nfl','featured_'+market,day,true))[0];
   const retained=retainedNflRankingPayload(locked,published,market,day);
   if(retained){
    const key=market+'|'+day;
    if(!refreshes.has(key)){refreshes.add(key);after(async()=>{try{await rankings(req,true)}catch(e){console.error('[NFL background refresh]',market,e)}finally{refreshes.delete(key)}})}
    return NextResponse.json(retained,{headers:{'Cache-Control':'no-store'}});
   }
  }
  let providerError:string|null=null;
  const [owlsRows,schedule]=await Promise.all([fetchOwlsRows(market).catch(async(e)=>{
    providerError=e instanceof Error?e.message:String(e);
    // Legacy fallback rows have already lost per-book prices and market structure.
    // They cannot establish a verified O/U quote; fall back to model watch instead.
    return [];
  }),getEspnNflSchedule()]),today=easternDayKey(new Date());
  const candidates=owlsRows.length?owlsRows:await modelOnlyRows(market,schedule);
  const frozenSlates=new Set(locked?.lockedSlates||[]);
  const active=candidates.filter((row:any)=>{if(row.quoteVersion===1&&!footballQuoteGame(row,schedule))return false;const t=rowGameTime(row,schedule);if(frozenSlates.has(footballSlate(t)))return false;if(!t||Date.parse(t)<=Date.now())return false;const k=easternDayKey(t);return !k||k>=today});
  // Resolve beyond the first 25 sportsbook rows. Position filtering and alias de-duplication
  // happen later, so stopping at 25 here can incorrectly leave a market with only 12-18 players.
  const built=await Promise.all(active.slice(0,150).map(async(row:any)=>{
   const profile=row.profile||await resolvePlayer(row.playerName,row.teamName,row.matchup,schedule);
   const quoteGame=row.quoteVersion===1?footballQuoteGame(row,schedule):null;
   if(row.quoteVersion===1&&(!profile.id||!quoteGame||![String(quoteGame.awayTeamId),String(quoteGame.homeTeamId)].includes(String(profile.teamId))))return null;
   const pos=String(profile.position||"").toUpperCase();
   const qbOnly=market==="qb_rushing_yards"||market==="q1_qb_rushing_yards";
   const nonQbRush=market==="rushing_yards"||market==="q1_rushing_yards";
   if(qbOnly&&pos&&pos!=="QB")return null;
   if(nonQbRush&&pos==="QB")return null;
   const m=await model(profile.id,market,row.gameTime||new Date().toISOString());
   if(row.earlyModel&&(m.projection==null||m.games<2))return null;
   const probability=nflPredictionProbability(market,m.projection,row.line,row.prob);
   const rankingProbability=probability??row.prob??50;
   const game=matchupGame(schedule,row.matchup);
   return {...footballQuoteFields(row),market,rank:0,playerId:profile.id||cleanName(row.playerName),playerName:row.playerName,teamName:profile.teamName||row.teamName||"NFL",teamId:profile.teamId,position:profile.position,headshot:profile.headshot,teamLogo:profile.teamLogo||teamLogo(profile,row,schedule),matchup:row.matchup,gameTime:row.gameTime||game?.date||"",gameId:String(game?.id||""),giScore:row.earlyModel?Math.round((50+Math.min(20,m.games)+Math.min(20,(m.projection||0)/(market=== "passing_yards"?15:market.endsWith("yards")?5:1)))*10)/10:nflGiScore(rankingProbability,row.bookmakerCount,m.games),modelProbability:probability,sportsbookLine:row.line,sportsbookProbability:row.prob,bookmakerCount:row.bookmakerCount,perGame:m.projection,modelProjection:m.projection,projectionGames:m.games,researchCohort:m,seasonTotal:null,gamesPlayed:m.games,season:2026,summary:(()=>{
     const label=NFL_MARKETS.find(x=>x[0]===market)?.[2]||market;
     const edge=row.line!=null&&m.projection!=null?Number(m.projection)-Number(row.line):null;
     const edgeText=edge==null?"":` The model sits ${Math.abs(edge).toFixed(1)} ${edge>=0?"above":"below"} the current line.`;
     const probText=probability!=null?` Model probability is ${Number(probability).toFixed(0)}%.`:"";
     const q1=market.startsWith("q1_")?" This is a first-quarter market and is graded only on Q1 production.":"";
     if(row.earlyModel)return `Sach model watch: ${m.games} verified recent games support a ${m.projection} ${label} baseline. Sportsbook line unavailable; this row is not a wager prediction and is not graded.`;
     return `${label}: ${m.games} verified recent game${m.games===1?"":"s"} and ${row.bookmakerCount} sportsbook${row.bookmakerCount===1?"":"s"} support the ranking.${edgeText}${probText}${q1}`;
   })(),marketBacked:!row.earlyModel};
  }));
  // Resolve sportsbook naming variants (for example "Travis Etienne" and
  // "Travis Etienne Jr.") to one athlete before ranking.  Prefer the row with
  // the deepest book coverage, then the higher GI score.
  const resolved=built.filter(Boolean) as any[];
  const unique=new Map<string,any>();
  for(const row of resolved){
    const key=row.marketBacked===false&&["passing_yards","passing_tds","passing_rushing_yards"].includes(market)?`${row.teamId}|${row.gameId}`:String(row.playerId||cleanName(row.playerName));
    const prior=unique.get(key);
    if(!prior||(row.marketBacked===false&&Number(row.modelProjection)>Number(prior.modelProjection))||Number(row.bookmakerCount||0)>Number(prior.bookmakerCount||0)||(Number(row.bookmakerCount||0)===Number(prior.bookmakerCount||0)&&Number(row.giScore||0)>Number(prior.giScore||0))) unique.set(key,row);
  }
  const rows=[...unique.values()];
  // Rolling slate priority: today's playable slate gets a meaningful boost without excluding
  // elite future-week plays. After today's games are final, the next available game day becomes primary.
  const playableDays=[...new Set(schedule.filter((g:any)=>!g.completed&&g.state!=="post").map((g:any)=>easternDayKey(g.date)).filter(Boolean))].sort();
  const primaryDay=playableDays.includes(today)?today:(playableDays[0]||today);
  const nextDay=playableDays.find((d:string)=>d>primaryDay)||"";
  const priority=(r:any)=>{const day=easternDayKey(rowGameTime(r,schedule));return day===primaryDay?12:day===nextDay?3:0};
  rows.sort((a,b)=>(b.giScore+priority(b))-(a.giScore+priority(a))||b.giScore-a.giScore);const boardDay=schedule.some((g:any)=>easternDayKey(g.date)===today)?today:primaryDay;const ranked=independentFootballRankings(rows,25,boardDay);
  // Storage is optional for rendering a fresh board, never for overwriting
  // historical records. Failed reads stay failed on the persistence path.
  const savedToday=await getNflPredictions(market,today).catch(e=>{
   console.error('[NFL history read]',market,e instanceof Error?e.message:String(e));
   return {connected:false,writable:false,predictions:[] as SavedNflPrediction[],snapshotCount:0};
  });
  const results=new Map<string,SavedNflPrediction>();
  for(const p of savedToday.predictions){results.set(`${p.playerId}|game:${p.gameId}`,p);results.set(`${p.playerId}|matchup:${cleanName(p.matchup)}`,p)}
  const historySaved=false;
  after(async()=>{try{await saveNflPregamePredictions(market,ranked,schedule)}catch(e){console.error('[NFL history save]',market,e instanceof Error?e.message:String(e))}});
  const withResults=ranked.map(r=>{const p=results.get(`${r.playerId}|game:${r.gameId}`)||results.get(`${r.playerId}|matchup:${cleanName(r.matchup)}`);const margin=p?.actual!=null&&p.sportsbookLine!=null?p.actual-p.sportsbookLine:null;return p?{...r,resultStatus:p.status,actualResult:p.actual,resultMargin:margin,resultSymbol:p.status==="hit"?"✅":p.status==="miss"?"❌":p.status==="push"?"➖":p.status==="void"?"VOID":""}:r});
  const liveRows=await liveContext(withResults,schedule,market);

  // NFL must behave like the MLB daily board: once a player reaches kickoff in the
  // tracked Top 25, that prediction stays visible for the rest of the day even if
  // the sportsbook feed removes the completed game.  Current pregame rows can still
  // move, enter and drop; started/final rows are locked from the Supabase snapshot.
  const liveKeys=new Set(liveRows.map((r:any)=>`${r.playerId}|${r.gameId||cleanName(r.matchup)}`));
  const gameFor=(p:SavedNflPrediction)=>p.gameId?schedule.find((g:any)=>String(g.id)===String(p.gameId)):matchupGame(schedule,p.matchup);
  const started=(g:any)=>Boolean(g&&(g.state==="in"||g.completed||g.state==="post"));
  const archived=savedToday.predictions
    .filter((p:SavedNflPrediction)=>started(gameFor(p))&&!liveKeys.has(`${p.playerId}|${p.gameId||cleanName(p.matchup)}`))
    .sort((a:SavedNflPrediction,b:SavedNflPrediction)=>Number(a.lastSeenRank||a.originalRank||99)-Number(b.lastSeenRank||b.originalRank||99))
    .map((p:SavedNflPrediction)=>{
      const g=gameFor(p);
      const margin=p.actual!=null&&p.sportsbookLine!=null?p.actual-p.sportsbookLine:null;
      return {...footballQuoteFields(p),originalResearchPick:p.pickSide,originalResearchSavedAt:p.savedAt,rank:Number(p.lastSeenRank||p.originalRank||99),playerId:p.playerId,playerName:p.playerName,teamName:p.teamName,teamId:p.teamId||"",position:p.position||"",
        headshot:p.headshot||(/^\d+$/.test(p.playerId)?`https://a.espncdn.com/i/headshots/nfl/players/full/${p.playerId}.png`:""),teamLogo:p.teamLogo||"",matchup:p.matchup,gameTime:p.gameTime,
        giScore:p.giScore,modelProbability:p.modelProbability,modelProjection:p.modelProjection,projectionGames:null,sportsbookLine:p.sportsbookLine,sportsbookProbability:null,bookmakerCount:p.bookmakerCount,
        perGame:p.modelProjection,seasonTotal:null,gamesPlayed:null,season:2026,summary:`Frozen pregame ${NFL_MARKETS.find(x=>x[0]===market)?.[2]||market} prediction. This player remains on today's board after kickoff so the original pick can be graded.`,marketBacked:true,
        resultStatus:p.status,actualResult:p.actual,resultMargin:margin,resultSymbol:p.status==="hit"?"✅":p.status==="miss"?"❌":p.status==="push"?"➖":p.status==="void"?"VOID":"",
        gameId:String(g?.id||""),gameState:g?.completed?"post":String(g?.state||"post"),gameStatus:String(g?.status||""),liveCurrent:p.actual,liveProgressPct:p.actual!=null&&p.sportsbookLine&&p.sportsbookLine>0?Math.max(0,Math.min(200,Math.round(p.actual/p.sportsbookLine*100))):null};
    });
  const currentGameFor=(r:any)=>r.gameId?schedule.find((g:any)=>String(g.id)===String(r.gameId)):matchupGame(schedule,r.matchup);
  const observedArchived=market.startsWith('q1_')?await liveContext(archived,schedule,market):archived;
  const liveByKey=new Map([...observedArchived,...liveRows].map((r:any)=>[`${r.playerId}|${r.gameId||cleanName(r.matchup)}`,r]));
  // HARD KICKOFF LOCK: rebuild started rows from the durable pregame snapshot.
  // Live feeds may update Current/Actual and game status, but never rank, line,
  // projection, confidence or GI after kickoff.
  const frozenStarted=savedToday.predictions.filter((p:SavedNflPrediction)=>started(gameFor(p))).map((p:SavedNflPrediction)=>{
    const g=gameFor(p);
    const key=`${p.playerId}|${p.gameId||cleanName(p.matchup)}`;
    const live=liveByKey.get(key) as any;
    const margin=p.actual!=null&&p.sportsbookLine!=null?p.actual-p.sportsbookLine:null;
    return {...footballQuoteFields(p),originalResearchPick:p.pickSide,originalResearchSavedAt:p.savedAt,rank:Number(p.lastSeenRank||p.originalRank||99),playerId:p.playerId,playerName:p.playerName,teamName:p.teamName,teamId:p.teamId||live?.teamId||"",position:p.position||live?.position||"",headshot:p.headshot||live?.headshot||"",teamLogo:p.teamLogo||live?.teamLogo||"",matchup:p.matchup,gameTime:p.gameTime,giScore:p.giScore,modelProbability:p.modelProbability,modelProjection:p.modelProjection,projectionGames:live?.projectionGames??null,researchCohort:live?.researchCohort,...(market.startsWith("q1_")?{quarterObservationChecked:true,observedQuarterValue:live?.liveCurrent??null}:{}),sportsbookLine:p.sportsbookLine,sportsbookProbability:p.sportsbookProbability??null,bookmakerCount:p.bookmakerCount,perGame:p.modelProjection,seasonTotal:null,gamesPlayed:live?.gamesPlayed??null,season:2026,summary:`Frozen pregame ${NFL_MARKETS.find(x=>x[0]===market)?.[2]||market} prediction. Rank, line, projection and confidence were locked at kickoff.`,marketBacked:true,resultStatus:p.status,actualResult:market.startsWith("q1_")?live?.liveCurrent??null:p.actual,resultMargin:margin,resultSymbol:p.status==="hit"?"✅ HIT":p.status==="miss"?"❌ MISS":p.status==="push"?"➖ PUSH":p.status==="void"?"VOID":"",gameId:String(g?.id||p.gameId||""),gameState:g?.completed?"post":String(g?.state||"in"),gameStatus:String(g?.status||live?.gameStatus||""),participationConfirmed:live?.participationConfirmed===true,starterConfirmed:live?.starterConfirmed===true,participationGameId:String(g?.id||p.gameId||""),liveCurrent:market.startsWith("q1_")?live?.liveCurrent??null:live?.liveCurrent??p.actual,liveProgressPct:live?.liveProgressPct??null,frozen:true,lockedAtKickoff:true};
  });
  const futureCurrent=liveRows.filter((r:any)=>!started(currentGameFor(r)));
  const lockedKeys=new Set(frozenStarted.map((r:any)=>`${r.playerId}|${r.gameId||cleanName(r.matchup)}`));
  const lockedRanks=new Set(frozenStarted.map((r:any)=>Number(r.rank)).filter((n:number)=>n>=1&&n<=25));
  const merged:any[]=[...frozenStarted.filter((r:any)=>Number(r.rank)>=1&&Number(r.rank)<=25)];
  let futureIndex=0;
  const future=futureCurrent.filter((r:any)=>!lockedKeys.has(`${r.playerId}|${r.gameId||cleanName(r.matchup)}`));
  for(let slot=1;slot<=75&&futureIndex<future.length;slot++){if(lockedRanks.has(slot))continue;merged.push({...future[futureIndex++],rank:slot});}
  merged.sort((a:any,b:any)=>Number(a.rank)-Number(b.rank));
  return await rankingJson({...rankingSourceState(merged.length,providerError),providerError,degraded:Boolean(providerError),source:providerError?"Sach model watch + available sportsbook feeds + saved daily slate":"Owls Insight + frozen daily slate",market,rows:independentFootballRankings(merged,25,boardDay),boardDay,sportsbookOnly:merged.every(r=>r.marketBacked),validRankingCount:merged.length,recoveredPredictions:savedToday.predictions.length,recoveredSnapshots:Number(savedToday.snapshotCount||0),historySaved,historyConnected:savedToday.connected,historyWritable:savedToday.writable,updatedAt:new Date().toISOString()},{headers:{"Cache-Control":"no-store, no-cache, must-revalidate, max-age=0","Pragma":"no-cache"}},locked);
 }catch(e){if(locked?.rows?.length)return NextResponse.json(locked,{headers:{'Cache-Control':'no-store'}});console.error("[NFL RANKINGS API]",market,e instanceof Error?e.message:String(e));return rankingJson({success:false,source:"Owls Insight",market,rows:[],sportsbookOnly:true,error:e instanceof Error?e.message:"NFL rankings unavailable"},{status:500,headers:{"Cache-Control":"no-store, no-cache, must-revalidate, max-age=0","Pragma":"no-cache"}})}
}

async function rankingJson(payload:any,init?:ResponseInit,locked?:any){let source=guardRankingPayload(payload,"nfl");if(locked?.rows?.length){const frozen=new Set(locked.lockedSlates);source={...source,rows:source.rows.filter((r:any)=>!frozen.has(r.slateKey))};}let board=await attachFittedResearchForecasts(source,"nfl");if(locked?.rows?.length){const slates=new Set(locked.lockedSlates);board={...board,lockedSlates:locked.lockedSlates,rows:[...locked.rows,...board.rows.filter((r:any)=>!slates.has(r.slateKey))]};}board={...board,validRankingCount:board.rows.length,publicRankingCount:board.rows.length};after(async()=>{try{await publishFeaturedBoards("nfl",[board])}catch(e){console.error("[featured publication]",e)}});return NextResponse.json(board,init)}

