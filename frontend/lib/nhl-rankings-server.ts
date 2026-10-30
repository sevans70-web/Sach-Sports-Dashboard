import {limitAvailablePregameRankings} from '@/lib/ranking-availability';
import {attachFittedResearchForecasts} from '@/lib/live-model-forecast';
import {getSgoSupplement,sgoBookGames} from '@/lib/sgo-supplement';
import {prioritizeModelPicks} from '@/lib/saved-model-pick';
import {rankingResponse} from '@/lib/ranking-response-cache';
import {recordNoteFields} from "@/lib/record-notes";
import {uniqueQuoteFixture,mainMarketQuotes,quoteMatchesFixture} from "@/lib/main-market-quotes";
import {archiveResearchBoards} from "@/lib/research-capture";
import {footballQuoteFields} from "@/lib/football-book-quotes";
import {guardRankingPayload} from "@/lib/prop-integrity";
import {getOwlsPayload} from "@/lib/owls-provider";
import {uniqueRankingRows} from "@/lib/unique-ranking-rows";
import {nbaPropMatchesGame as propMatchesGame} from "@/lib/nba-game-match";
import {providerFetch as fetch} from "@/lib/provider-fetch";
import {nullableNumber} from "@/lib/provider-fetch";
import {cleanNhlName,loadNhlOverview,nhlHeadshot,playerBaseline,todaysNhlGames,type NhlMarketKey} from "@/lib/nhl";
import {getNhlPredictions,nhlDay,saveNhlSlate} from "@/lib/nhl-history";
import {activeRankingSlate} from "@/lib/active-ranking-slate";
const OWLS_URL="https://api.owlsinsight.com/api/v1/nhl/props";
const norm=(v:any)=>String(v??"").toLowerCase().replace(/[^a-z0-9]/g,"");
const num=(v:any)=>{return nullableNumber(v)};
const median=(xs:number[])=>{const a=xs.filter(Number.isFinite).sort((a,b)=>a-b);if(!a.length)return null;const i=Math.floor(a.length/2);return a.length%2?a[i]:(a[i-1]+a[i])/2};
function match(v:any,m:NhlMarketKey){const x=norm(v);const a:Record<NhlMarketKey,string[]>={shots_on_goal:["shotsongoal","playershotsongoal","shots"],points:["points","playerpoints"],goals:["goals","playergoals","anytimegoalscorer"],assists:["assists","playerassists"],blocked_shots:["blockedshots","blocks","playerblockedshots"],goalie_saves:["goaliesaves","saves","playersaves"]};return a[m].includes(x)}
async function owls(){
 const [primary,supplement]=await Promise.allSettled([getOwlsPayload('nhl'),getSgoSupplement('NHL')]);
 const data=[...(primary.status==='fulfilled'?primary.value?.data||[]:[]),...sgoBookGames(supplement.status==='fulfilled'?supplement.value:null)];
 if(!data.length&&primary.status==='rejected')throw primary.reason;
 return {data};
}
function board(payload:any,market:NhlMarketKey){return mainMarketQuotes(payload,market,p=>match(p.category??p.market??p.type,market))}
async function buildNhlRankingsRaw(m:NhlMarketKey){
 const [overview,payload]=await Promise.all([loadNhlOverview(),owls().catch(()=>null)]),b=payload?board(payload,m):[],byName=new Map(overview.players.map(p=>[cleanNhlName(p.playerName),p]));
 const todayGames=activeRankingSlate(overview.games,nhlDay),activeTeams=new Set(todayGames.flatMap(g=>[g.awayAbbr,g.homeAbbr])),rows:any[]=[];
 for(const x of b){const p=byName.get(cleanNhlName(x.playerName));if(!p||!activeTeams.has(p.team)||(m==='goalie_saves'&&p.position!=='G'))continue;const game=uniqueQuoteFixture(x,todayGames,p.team);if(!game)continue;const base=playerBaseline(p,m),edge=base!=null&&x.line!=null?base-x.line:null,reliability=Math.min(1,(p.gamesPlayed||0)/30),gi=Math.round((55+Math.min(25,Math.abs(edge||0)*7)+reliability*15)*10)/10;rows.push({...footballQuoteFields(x),playerId:p.playerId,playerName:p.playerName,teamId:p.team,season:game.season,teamName:p.team,teamLogo:p.team===game.awayAbbr?game.awayLogo:game.homeLogo,matchup:`${game.awayTeam} @ ${game.homeTeam}`,gameTime:game.tipoff||"",gameId:game.gameId,gameState:game.state,gameStatus:game.status,headshot:nhlHeadshot(p.playerId,p.team),sportsbookLine:x.line,bookmakerCount:x.bookmakerCount,modelProjection:base,modelProbability:edge==null?null:Math.max(50,Math.min(82,Math.round((55+Math.abs(edge)*5+reliability*5)*10)/10)),giScore:gi,prediction:edge==null?null:edge>=0?"OVER":"UNDER",marketBacked:true,summary:`${overview.season} baseline ${base==null?"loading":base.toFixed(2)} vs verified line ${x.line}. GI adds recent-season sample reliability, role and active matchup context.`})}
 rows.splice(0,rows.length,...uniqueRankingRows(rows));
 const used=new Set(rows.map(x=>cleanNhlName(x.playerName)));
 for(const p of [...overview.players].sort((a,b)=>(playerBaseline(b,m)??-1)-(playerBaseline(a,m)??-1))){if(used.has(cleanNhlName(p.playerName))||!activeTeams.has(p.team)||(m==='goalie_saves'&&p.position!=='G'))continue;const base=playerBaseline(p,m);if(base==null)continue;const game=todayGames.find(g=>[g.awayAbbr,g.homeAbbr].includes(p.team));if(!game)continue;rows.push({playerId:p.playerId,playerName:p.playerName,teamId:p.team,season:game.season,teamName:p.team,teamLogo:p.team===game.awayAbbr?game.awayLogo:game.homeLogo,matchup:`${game.awayTeam} @ ${game.homeTeam}`,gameTime:game.tipoff||"",gameId:game.gameId,gameState:game.state,gameStatus:game.status,headshot:nhlHeadshot(p.playerId,p.team),sportsbookLine:null,bookmakerCount:0,modelProjection:base,modelProbability:null,giScore:Math.round((55+Math.min(1,(p.gamesPlayed||0)/30)*15+Math.min(20,base*3))*10)/10,prediction:null,marketBacked:false,summary:`${overview.season} statistical baseline ${base.toFixed(2)}. No verified sportsbook line is currently available, so this is a model-only active-slate ranking and is not graded.`})}
 const pool=uniqueRankingRows(rows.sort((a,b)=>b.giScore-a.giScore));
 // Started boards retain their original public limit; only pregame pools backfill.
 const started=pool.some(r=>['in','post'].includes(r.gameState)||Date.parse(r.gameTime)<=Date.now());
 const ranked=(started?pool.slice(0,25):pool).map((x,i)=>({...x,rank:i+1}));
 const saved=await saveNhlSlate(m,ranked,false);
 const byKey=new Map(saved.predictions.map(p=>[String(p.playerId)+"|"+p.gameId,p]));
 const frozen=ranked.map(row=>{
   const p=byKey.get(String(row.playerId)+"|"+row.gameId);
   if(!p)return row;
   const started=row.gameState==="in"||row.gameState==="post"||Boolean(p.gameTime&&Date.parse(p.gameTime)<=Date.now());
   return {...row,...recordNoteFields(p),rank:row.rank,sportsbookLine:p.sportsbookLine,bookmakerCount:p.bookmakerCount,modelProjection:p.modelProjection,modelProbability:p.modelProbability,prediction:p.pickSide,resultStatus:p.status,actualResult:p.actual,resultSymbol:p.status==="hit"?"✅ HIT":p.status==="miss"?"❌ MISS":p.status==="push"?"➖ PUSH":p.status==="void"?"VOID":"",marketBacked:p.sportsbookLine!=null,frozen:started,lockedAtPuckDrop:started,summary:started?"Frozen pregame prediction · live game status.":row.summary};
 });
 return {success:true,market:m,rows:frozen,locked:frozen.some(r=>r.frozen),updatedAt:new Date().toISOString(),source:payload?"Owls Insight NHL props + NHL API":"NHL API model watch · sportsbook lines pending"};
}

export async function captureAllNhlMarkets(){
 const markets=(await import("@/lib/nhl")).NHL_MARKETS.map(x=>x[0]);
 const results:any[]=[],boards:any[]=[];
 for(const market of markets){
  try{
   const r=await buildNhlRankings(market);
   boards.push(r);
   const backed=r.rows.filter((x:any)=>x.recommendationEligible===true&&x.resultStatus!=="void").length;
   results.push({market,count:r.rows.length,verifiedPredictions:backed,locked:Boolean((r as any).locked)});
  }catch(e){results.push({market,count:0,verifiedPredictions:0,error:e instanceof Error?e.message:String(e)});}
 }
 const verifiedPredictions=results.reduce((sum:number,r:any)=>sum+r.verifiedPredictions,0);
 const research=await archiveResearchBoards("nhl",boards);
 return {...research,success:research.researchArchived||(results.every(x=>!x.error)&&verifiedPredictions>0),verifiedPredictions,markets:results,updatedAt:new Date().toISOString(),warning:"Research snapshots archived separately; no validated NHL betting picks are available."};
}

export async function buildNhlRankings(...args:Parameters<typeof buildNhlRankingsRaw>){return rankingResponse('nhl|'+args[0],async()=>{
 const payload=await attachFittedResearchForecasts(guardRankingPayload(limitAvailablePregameRankings(await buildNhlRankingsRaw(...args)),'nhl'),'nhl');
 return {...payload,rows:prioritizeModelPicks(payload.rows||[])};
})}
