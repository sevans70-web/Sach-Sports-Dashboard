import {attachFittedResearchForecasts} from '@/lib/live-model-forecast';
import {attachBasketballPregameContext} from '@/lib/basketball-pregame-context';
import {availablePregameRankings} from '@/lib/ranking-availability';
import {prioritizeModelPicks} from '@/lib/saved-model-pick';
import {rankingResponse} from '@/lib/ranking-response-cache';
import {frozenNbaSlateBoard,savePregameNbaSlateBoard} from '@/lib/nba-slate-board';
import {mainMarketQuotes,quoteMatchesFixture} from "@/lib/main-market-quotes";
import {archiveResearchBoards} from "@/lib/research-capture";
import {footballQuoteFields} from "@/lib/football-book-quotes";
import {guardRankingPayload} from "@/lib/prop-integrity";
import {activeRankingSlate} from "@/lib/active-ranking-slate";
import {getOwlsPayload} from "@/lib/owls-provider";
import {providerFetch as fetch} from "@/lib/provider-fetch";
import {nullableNumber} from "@/lib/provider-fetch";
import {cleanWnbaName,loadWnbaOverview,playerBaseline,type WnbaMarketKey,WNBA_MARKETS,wnbaHeadshot} from "@/lib/wnba";
import {getWnbaPredictions,saveWnbaPredictions} from "@/lib/wnba-history";

const OWLS_URL="https://api.owlsinsight.com/api/v1/wnba/props";
const norm=(v:any)=>String(v??"").toLowerCase().replace(/[^a-z0-9]/g,"");
const safe=(v:any)=>{return nullableNumber(v)};
function median(xs:number[]){const a=xs.filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return null;const i=Math.floor(a.length/2);return a.length%2?a[i]:(a[i-1]+a[i])/2}
function americanProb(v:any){const n=Number(v);if(!Number.isFinite(n)||n===0)return null;return Math.round((n>0?100/(n+100):Math.abs(n)/(Math.abs(n)+100))*1000)/10}
function marketMatches(v:any,m:WnbaMarketKey){const x=norm(v);const aliases:Record<WnbaMarketKey,string[]>={
 points:["points","playerpoints"],rebounds:["rebounds","playerrebounds"],assists:["assists","playerassists"],threes_made:["threesmade","threepointersmade","3pointersmade"],
 pts_rebs_asts:["ptsrebsasts","pointsreboundsassists","pra"],pts_rebs:["ptsrebs","pointsrebounds"],pts_asts:["ptsasts","pointsassists"],rebs_asts:["rebsasts","reboundsassists"],steals:["steals"],blocks:["blocks"]
};return aliases[m].includes(x)}

export function torontoWnbaDay(v:Date|string){
 const d=typeof v==="string"?new Date(v):v;if(Number.isNaN(d.getTime()))return"";
 const parts=new Intl.DateTimeFormat("en-US",{timeZone:"America/Toronto",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d);
 const get=(t:string)=>parts.find(x=>x.type===t)?.value||"";return `${get("year")}-${get("month")}-${get("day")}`;
}

async function fetchOwlsPayload(){return getOwlsPayload("wnba")}

function boardForMarket(payload:any,market:WnbaMarketKey){return mainMarketQuotes(payload,market,p=>marketMatches(p.category??p.market??p.type,market))}

function gameForRow(games:any[],team:string,b:any){
 const teamGames=games.filter(g=>[g.awayAbbr,g.homeAbbr].map((x:any)=>String(x).toUpperCase()).includes(team));
 if(!teamGames.length)return undefined;
 const propDay=torontoWnbaDay(b.gameTime||"");
 const sameDay=propDay?teamGames.filter(g=>torontoWnbaDay(g.tipoff||"")===propDay):[];
 const pool=sameDay.length?sameDay:teamGames;
 const target=new Date(b.gameTime||0).getTime();
 return [...pool].sort((a,c)=>Math.abs(new Date(a.tipoff||0).getTime()-target)-Math.abs(new Date(c.tipoff||0).getTime()-target))[0];
}

function rowsForMarket(payload:any,overview:any,market:WnbaMarketKey){
 const board=boardForMarket(payload,market);const byName=new Map(overview.players.map((p:any)=>[cleanWnbaName(p.playerName),p]));const today=torontoWnbaDay(new Date());
 const activeGames:any[]=activeRankingSlate(overview.games,torontoWnbaDay);
 const uniqueBoard=[...board.reduce((acc:Map<string,any>,b:any)=>{const key=cleanWnbaName(b.playerName);const existing=acc.get(key);if(!existing||Number(b.bookmakerCount||0)>Number(existing.bookmakerCount||0))acc.set(key,b);return acc},new Map<string,any>()).values()] as any[];
 const rows=uniqueBoard.map((b:any)=>{
  const p:any=byName.get(cleanWnbaName(b.playerName));const team=String(p?.team||"").toUpperCase();const game=gameForRow(activeGames,team,b);if(!game||!quoteMatchesFixture(b,game))return null;
  const gameDay=torontoWnbaDay(game.tipoff||""),propDay=torontoWnbaDay(b.gameTime||"");if(propDay&&propDay!==gameDay)return null;
  const actualMatchup=`${game.awayTeam} @ ${game.homeTeam}`,actualTime=game.tipoff||b.gameTime,teamLogo=String(game.awayAbbr).toUpperCase()===team?game.awayLogo:game.homeLogo;
  const baseline=playerBaseline(p,market);const edge:number|null=baseline!=null&&b.line!=null?baseline-b.line:null;
  const reliability=Math.min(1,Math.max(0,(p?.gamesPlayed??0)/30));const edgePct=edge!=null&&b.line?Math.min(1,Math.abs(edge)/Math.max(1,Math.abs(b.line))):0;
  const gi=Math.round((50+edgePct*35+reliability*15)*10)/10;const modelProbability=edge==null?null:Math.max(50,Math.min(82,Math.round((54+Math.abs(edge)*2.2+reliability*5)*10)/10));
  return{playerId:p?.playerId||cleanWnbaName(b.playerName),playerName:b.playerName,teamName:p?.team||"WNBA",teamLogo:teamLogo||"",matchup:actualMatchup,gameTime:actualTime,gameId:game.gameId||"",gameState:game.state||"pre",gameStatus:game.status||"Scheduled",headshot:p?wnbaHeadshot(p.playerId):"",...footballQuoteFields(b),sportsbookLine:b.line,bookmakerCount:b.bookmakerCount,modelProjection:baseline,modelProbability,giScore:gi,prediction:edge==null?null:edge>=0?"OVER":"UNDER",summary:baseline==null||edge==null?`Verified sportsbook line ${b.line}. Statistical baseline is still loading.`:`2026 baseline ${baseline.toFixed(1)} vs verified line ${Number(b.line).toFixed(1)} (${edge>=0?"+":""}${edge.toFixed(1)} edge). ${b.bookmakerCount} sportsbook source${b.bookmakerCount===1?"":"s"} currently represented.`}
 }).filter(Boolean) as any[];

 // Owls can expose only a small market-backed board (often five players). Keep those
 // verified-line candidates first, then fill the ranking board from eligible players
 // whose teams have an active game today. Model-only fillers are NEVER persisted as
 // sportsbook predictions because sportsbookLine remains null.
 const used=new Set(rows.map((x:any)=>cleanWnbaName(x.playerName)));
 const activeTeams=new Set(activeGames.flatMap((g:any)=>[String(g.awayAbbr||"").toUpperCase(),String(g.homeAbbr||"").toUpperCase()]));
 const fillers=overview.players.map((p:any)=>{
   const team=String(p?.team||"").toUpperCase();
   if(!activeTeams.has(team)||used.has(cleanWnbaName(p.playerName)))return null;
   const baseline=playerBaseline(p,market);if(baseline==null)return null;
   const game=activeGames.find((g:any)=>[g.awayAbbr,g.homeAbbr].map((x:any)=>String(x).toUpperCase()).includes(team));
   if(!game)return null;
   const reliability=Math.min(1,Math.max(0,(p?.gamesPlayed??0)/30));
   return{playerId:p.playerId,playerName:p.playerName,teamName:p.team||"WNBA",teamLogo:String(game.awayAbbr).toUpperCase()===team?game.awayLogo||"":game.homeLogo||"",matchup:`${game.awayTeam} @ ${game.homeTeam}`,gameTime:game.tipoff||"",gameId:game.gameId||"",gameState:game.state||"pre",gameStatus:game.status||"Scheduled",headshot:wnbaHeadshot(p.playerId),sportsbookLine:null,bookmakerCount:0,modelProjection:baseline,modelProbability:null,giScore:Math.round((50+reliability*15)*10)/10,prediction:null,marketBacked:false,summary:`2026 statistical baseline ${baseline.toFixed(1)}. No verified sportsbook line is currently available, so this player is ranked as a model-only eligible candidate and is not saved for grading.`};
 }).filter(Boolean) as any[];
 rows.sort((a:any,b:any)=>b.giScore-a.giScore);
 fillers.sort((a:any,b:any)=>b.modelProjection-a.modelProjection||b.giScore-a.giScore);
 return [...rows,...fillers].slice(0,25).map((x:any,i:number)=>({...x,rank:i+1}));
}

async function buildWnbaMarketRankingsRaw(market:WnbaMarketKey,shared?:{payload:any;overview:any}){
 try{
  const source:{payload:any;overview:any}=shared||await Promise.all([fetchOwlsPayload().catch(()=>({data:[]})),loadWnbaOverview()]).then(([payload,overview])=>({payload,overview}));
  const ranked=rowsForMarket(source.payload,source.overview,market).map((row:any)=>{
   const game=source.overview.games.find((g:any)=>String(g.gameId)===String(row.gameId));
   const teamId=String(row.teamName).toUpperCase()===String(game?.awayAbbr).toUpperCase()?game?.awayTeamId:String(row.teamName).toUpperCase()===String(game?.homeAbbr).toUpperCase()?game?.homeTeamId:null;
   return {...row,teamId:teamId?String(teamId):'',season:String(source.overview.season)};
  });
  const verified=ranked.filter((x:any)=>x.sportsbookLine!=null&&x.prediction&&x.modelProjection!=null);
  const saved=verified.length>0?await saveWnbaPredictions(market,verified).catch(()=>false):false;
  return {success:true,market,rows:ranked,saved,updatedAt:new Date().toISOString(),source:ranked.some((x:any)=>x.sportsbookLine!=null)?"Owls Insight WNBA props + ESPN":"ESPN WNBA model watch",verifiedPredictions:verified.length};
 }catch(e:any){
  const today=torontoWnbaDay(new Date());
  const saved=await getWnbaPredictions(market,today).catch(()=>({connected:false,predictions:[]} as any));
  const fallback=(saved.predictions||[]).filter((x:any)=>x.status==="pending").sort((a:any,b:any)=>Number(a.rank||999)-Number(b.rank||999)).slice(0,25).map((x:any,i:number)=>({rank:Number(x.rank||0)||i+1,playerId:x.playerId,playerName:x.playerName,teamName:x.teamName,teamLogo:x.teamLogo||"",headshot:x.headshot||"",matchup:x.matchup,gameTime:x.gameTime,gameId:x.gameId||"",sportsbookLine:x.sportsbookLine,modelProjection:x.modelProjection,modelProbability:x.modelProbability,giScore:x.giScore,bookmakerCount:x.bookmakerCount,prediction:x.pickSide,frozen:true,marketBacked:true,summary:"Last successful WNBA ranking snapshot retained while live data refreshes."}));
  return {success:fallback.length>0,market,rows:fallback,cached:fallback.length>0,source:fallback.length?"Saved WNBA ranking snapshot":"Owls Insight",error:String(e?.message||e),updatedAt:new Date().toISOString()};
 }
}

export async function captureAllWnbaMarkets(){
 const [payload,overview]=await Promise.all([fetchOwlsPayload().catch(()=>({data:[]})),loadWnbaOverview()]);
 const results=await Promise.all(WNBA_MARKETS.map(async([market])=>{
  try{return await buildWnbaMarketRankings(market,{payload,overview})}
  catch(e:any){return {success:false,market,rows:[],saved:false,error:String(e?.message||e)}}
 }));
 const research=await archiveResearchBoards("wnba",results);
 return {...research,success:research.researchArchived||results.some(x=>x.success&&x.saved!==false),verifiedPredictions:results.reduce((n,x)=>n+((x as any).verifiedPredictions||0),0),warning:"Research snapshots archived separately; no validated WNBA betting picks are available.",markets:results.map(x=>({market:x.market,rows:x.rows?.length||0,saved:x.saved===true,success:x.success,error:x.error||null})),updatedAt:new Date().toISOString()};
}

export async function buildWnbaMarketRankings(...args:Parameters<typeof buildWnbaMarketRankingsRaw>){
 return rankingResponse('wnba|'+args[0],async()=>{
 const overview=args[1]?.overview||await loadWnbaOverview();
 const today=torontoWnbaDay(new Date());
 const current=overview.games.filter((g:any)=>torontoWnbaDay(g.tipoff||'')===today);
 const games=current.length?current:activeRankingSlate(overview.games,torontoWnbaDay);
 const day=games[0]?.tipoff?torontoWnbaDay(games[0].tipoff):torontoWnbaDay(new Date());
 const frozen=await frozenNbaSlateBoard(args[0],games,Date.now(),day,'wnba');
 if(frozen)return frozen;
 const source=args[1]||{overview,payload:await fetchOwlsPayload().catch(()=>({data:[]}))};
 const contextual=availablePregameRankings(await attachBasketballPregameContext(await buildWnbaMarketRankingsRaw(args[0],source),'wnba'));
 const payload=await attachFittedResearchForecasts(guardRankingPayload(contextual,'wnba'),'wnba');
 return savePregameNbaSlateBoard({...payload,rows:prioritizeModelPicks(payload.rows||[])},games,Date.now(),day,'wnba');
 },Boolean(args[1]));
}
