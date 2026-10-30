import {attachBasketballPregameContext} from '@/lib/basketball-pregame-context';
import {limitAvailablePregameRankings} from '@/lib/ranking-availability';
import {cbbFixtureIdentity,cbbQuotePlayerName,cbbQuoteTeam} from '@/lib/cbb-fixture-identity';
import {attachFittedResearchForecasts} from '@/lib/live-model-forecast';
import {fixtureQuoteRows,mainMarketQuotes,quoteMatchesFixture} from "@/lib/main-market-quotes";
import {archiveResearchBoards} from "@/lib/research-capture";
import {footballQuoteFields} from "@/lib/football-book-quotes";
import {guardRankingPayload} from "@/lib/prop-integrity";
import {cleanCbbName,loadCbbOverview,playerBaseline,type CbbMarketKey,CBB_MARKETS,cbbHeadshot} from "@/lib/cbb";
import {getCbbPredictions,saveCbbPredictions} from "@/lib/cbb-history";
import {getOwlsPayload} from "@/lib/owls-provider";
import {nullableNumber} from "@/lib/provider-fetch";
import {activeRankingSlate} from "@/lib/active-ranking-slate";

const OWLS_URL="https://api.owlsinsight.com/api/v1/cbb/props";
const norm=(v:any)=>String(v??"").toLowerCase().replace(/[^a-z0-9]/g,"");
const safe=nullableNumber;
function median(xs:number[]){const a=xs.filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return null;const i=Math.floor(a.length/2);return a.length%2?a[i]:(a[i-1]+a[i])/2}
function americanProb(v:any){const n=Number(v);if(!Number.isFinite(n)||n===0)return null;return Math.round((n>0?100/(n+100):Math.abs(n)/(Math.abs(n)+100))*1000)/10}
function marketMatches(v:any,m:CbbMarketKey){const x=norm(v);const aliases:Record<CbbMarketKey,string[]>={
 points:["points","playerpoints"],rebounds:["rebounds","playerrebounds"],assists:["assists","playerassists"],threes_made:["threesmade","threepointersmade","3pointersmade"],
 pts_rebs_asts:["ptsrebsasts","pointsreboundsassists","pra"],pts_rebs:["ptsrebs","pointsrebounds"],pts_asts:["ptsasts","pointsassists"],rebs_asts:["rebsasts","reboundsassists"],steals:["steals"],blocks:["blocks"]
};return aliases[m].includes(x)}

export function torontoCbbDay(v:Date|string){
 const d=typeof v==="string"?new Date(v):v;if(Number.isNaN(d.getTime()))return"";
 const parts=new Intl.DateTimeFormat("en-US",{timeZone:"America/Toronto",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d);
 const get=(t:string)=>parts.find(x=>x.type===t)?.value||"";return `${get("year")}-${get("month")}-${get("day")}`;
}

async function fetchOwlsPayload(){
 return getOwlsPayload("cbb");
}

function boardForMarket(payload:any,market:CbbMarketKey){return mainMarketQuotes(payload,market,p=>marketMatches(p.category??p.market??p.type,market)).map(q=>{const identity=cbbQuotePlayerName(q.playerName);return {...q,providerPlayerName:q.playerName,providerTeamTag:identity.teamTag,playerName:identity.name}})}

function baselineRows(overview:any,market:CbbMarketKey){
 const today=torontoCbbDay(new Date());
 const playable=(overview.games||[]).filter((g:any)=>{
   const gameDay=torontoCbbDay(g.tipoff||"");
   return g.state!=="post" && gameDay>=today;
 }).sort((a:any,b:any)=>new Date(a.tipoff||0).getTime()-new Date(b.tipoff||0).getTime());
 const nextDay=playable.length?torontoCbbDay(playable[0].tipoff||""):"";
 const nextGames=nextDay?playable.filter((g:any)=>torontoCbbDay(g.tipoff||"")===nextDay):[];
 const gameByTeam=new Map<string,any>();
 for(const g of nextGames){
   if(g.awayAbbr)gameByTeam.set(String(g.awayAbbr).toUpperCase(),g);
   if(g.homeAbbr)gameByTeam.set(String(g.homeAbbr).toUpperCase(),g);
 }
 const candidates=(overview.players||[]).map((p:any)=>{
   const baseline=playerBaseline(p,market);if(baseline==null||Number(p?.gamesPlayed||0)<20)return null;
   const team=String(p.team||"").toUpperCase();
   const game=gameByTeam.get(team);
   // During the active season, a model-watch row must belong to the next
   // scheduled slate. Outside the schedule window, keep the baseline board.
   if(nextGames.length&&!game)return null;
   const reliability=Math.min(1,Math.max(0,Number(p?.gamesPlayed||0)/82));
   const matchup=game?`${game.awayTeam} @ ${game.homeTeam}`:"2025–26 regular-season baseline";
   return{...cbbFixtureIdentity(game,team),playerId:p.playerId,playerName:p.playerName,teamName:p.team||"CBB",teamLogo:game?(String(game.awayAbbr).toUpperCase()===team?game.awayLogo:game.homeLogo)||"":"",matchup,gameTime:game?.tipoff||"",gameId:game?.gameId||"",gameState:game?.state||"pre",gameStatus:game?.status||(game?"Scheduled":"Baseline"),headshot:cbbHeadshot(p.playerId),sportsbookLine:null,bookmakerCount:0,modelProjection:baseline,modelProbability:null,giScore:Math.round((baseline*10+reliability)*10)/10,prediction:null,marketBacked:false,earlyModel:true,summary:game?`Next-slate model watch · 2025–26 baseline ${baseline.toFixed(1)} · sportsbook line pending`:`2025–26 statistical baseline ${baseline.toFixed(1)}. This offseason ranking is model-only and is not saved or graded as a sportsbook prediction.`};
 }).filter(Boolean).sort((a:any,b:any)=>Number(b.modelProjection||0)-Number(a.modelProjection||0)||Number(b.giScore||0)-Number(a.giScore||0)).map((x:any,i:number)=>({...x,rank:i+1}));
 return candidates;
}

function rowsForMarket(payload:any,overview:any,market:CbbMarketKey){
 const board=boardForMarket(payload,market);const byName=new Map(overview.players.map((p:any)=>[cleanCbbName(p.playerName),p]));const today=torontoCbbDay(new Date());
 const matched=fixtureQuoteRows(board,activeRankingSlate(overview.games,torontoCbbDay),(b:any)=>{const p:any=byName.get(cleanCbbName(b.playerName));return cbbQuoteTeam(b,p);},cleanCbbName);
 const rows=matched.map(({quote:b,game}:any)=>{
  const p:any=byName.get(cleanCbbName(b.playerName));const team=cbbQuoteTeam(b,p);
  const gameDay=torontoCbbDay(game.tipoff||"");if(b.gameTime&&torontoCbbDay(b.gameTime)!==gameDay)return null;
  const actualMatchup=`${game.awayTeam} @ ${game.homeTeam}`,actualTime=game.tipoff||b.gameTime,teamLogo=String(game.awayAbbr).toUpperCase()===team?game.awayLogo:game.homeLogo;
  const baseline=playerBaseline(p,market);const edge:number|null=baseline!=null&&b.line!=null?baseline-b.line:null;
  const reliability=Math.min(1,Math.max(0,(p?.gamesPlayed??0)/30));const edgePct=edge!=null&&b.line?Math.min(1,Math.abs(edge)/Math.max(1,Math.abs(b.line))):0;
  
  const modelProbability=edge==null?null:Math.max(50,Math.min(82,Math.round((54+Math.abs(edge)*2.2+reliability*5)*10)/10));
  const gi=Math.round((50+edgePct*35+reliability*15)*10)/10;
  return{...cbbFixtureIdentity(game,team),playerId:p?.playerId||cleanCbbName(b.playerName),playerName:b.playerName,teamName:team||p?.team||"CBB",teamLogo:teamLogo||"",matchup:actualMatchup,gameTime:actualTime,gameId:game.gameId||"",gameState:game.state||"pre",gameStatus:game.status||"Scheduled",headshot:p?cbbHeadshot(p.playerId):"",...footballQuoteFields(b),providerGameTime:b.gameTime,providerMatchup:b.matchup,providerPlayerName:b.providerPlayerName,providerTeamTag:b.providerTeamTag,sportsbookLine:b.line,bookmakerCount:b.bookmakerCount,modelProjection:baseline,modelProbability,giScore:gi,prediction:edge==null?null:edge>=0?"OVER":"UNDER",marketBacked:true,summary:baseline==null||edge==null?`Verified sportsbook line ${b.line}. Statistical baseline is still loading.`:`2025–26 baseline ${baseline.toFixed(1)} vs verified line ${Number(b.line).toFixed(1)} (${edge>=0?"+":""}${edge.toFixed(1)} edge). ${b.bookmakerCount} sportsbook source${b.bookmakerCount===1?"":"s"} currently represented.`}
 }).filter(Boolean) as any[];
 
 if(!rows.length)return baselineRows(overview,market);
 const used=new Set(rows.map((x:any)=>cleanCbbName(x.playerName)));
 const fill=baselineRows(overview,market).filter((x:any)=>!used.has(cleanCbbName(x.playerName)));
 rows.sort((a:any,b:any)=>b.giScore-a.giScore);
 return [...rows,...fill].map((x:any,i:number)=>({...x,rank:i+1}));
}

async function buildCbbMarketRankingsRaw(market:CbbMarketKey,shared?:{payload:any;overview:any}){
 try{
  const overview=shared?.overview??await loadCbbOverview();
  let payload:any=shared?.payload??{data:[]};let owlsOk=Boolean(shared?.payload);
  if(!shared){try{payload=await fetchOwlsPayload();owlsOk=true}catch{owlsOk=false}}
  const ranked=rowsForMarket(payload,overview,market);
  if(ranked.length){const marketBacked=ranked.filter((x:any)=>x.marketBacked&&x.sportsbookLine!=null&&x.modelProjection!=null&&x.prediction);const saved=marketBacked.length?await saveCbbPredictions(market,marketBacked).catch(()=>false):false;return {success:true,market,rows:ranked,saved,updatedAt:new Date().toISOString(),source:owlsOk?"Owls Insight CBB props + ESPN CBB data":"ESPN 2025–26 baseline fallback"};}
  const baseline=baselineRows(overview,market);if(baseline.length)return {success:true,market,rows:baseline,saved:false,updatedAt:new Date().toISOString(),source:"ESPN 2025–26 baseline fallback"};
  throw new Error(owlsOk?`No current ${market} market rows are available.`:"Owls Insight CBB props are not currently available.");
 }catch(e:any){
  const today=torontoCbbDay(new Date());
  const saved=await getCbbPredictions(market,today).catch(()=>({connected:false,predictions:[]} as any));
  const fallback=(saved.predictions||[]).filter((x:any)=>x.status==="pending").sort((a:any,b:any)=>Number(a.rank||999)-Number(b.rank||999)).slice(0,25).map((x:any,i:number)=>({rank:Number(x.rank||0)||i+1,playerId:x.playerId,playerName:x.playerName,teamName:x.teamName,teamLogo:x.teamLogo||"",headshot:x.headshot||"",matchup:x.matchup,gameTime:x.gameTime,gameId:x.gameId||"",sportsbookLine:x.sportsbookLine,modelProjection:x.modelProjection,modelProbability:x.modelProbability,giScore:x.giScore,bookmakerCount:x.bookmakerCount,prediction:x.pickSide,frozen:true,marketBacked:true,summary:"Last successful CBB ranking snapshot retained while live data refreshes."}));
  return {success:fallback.length>0,market,rows:fallback,cached:fallback.length>0,source:fallback.length?"Saved CBB ranking snapshot":"Owls Insight",error:String(e?.message||e),updatedAt:new Date().toISOString()};
 }
}

export async function captureAllCbbMarkets(){
 const [payload,overview]=await Promise.all([fetchOwlsPayload().catch(()=>({data:[]})),loadCbbOverview()]);
 const results=await Promise.all(CBB_MARKETS.map(async([market])=>{
  try{return await buildCbbMarketRankings(market,{payload,overview})}
  catch(e:any){return {success:false,market,rows:[],saved:false,error:String(e?.message||e)}}
 }));
 const research=await archiveResearchBoards("cbb",results);
 return {...research,success:research.researchArchived||results.some(x=>x.success&&x.saved===true),verifiedPredictions:results.reduce((n,x:any)=>n+(x.saved===true?(x.rows||[]).filter((r:any)=>r.recommendationEligible===true).length:0),0),warning:"Research snapshots archived separately; no validated CBB betting picks are available.",markets:results.map(x=>({market:x.market,rows:x.rows?.length||0,saved:x.saved===true,success:x.success,error:x.error||null})),updatedAt:new Date().toISOString()};
}

export async function buildCbbMarketRankings(...args:Parameters<typeof buildCbbMarketRankingsRaw>){
 const contextual=await attachBasketballPregameContext(await buildCbbMarketRankingsRaw(...args),"cbb");
 return attachFittedResearchForecasts(guardRankingPayload(limitAvailablePregameRankings(contextual),"cbb"),"cbb");
}
