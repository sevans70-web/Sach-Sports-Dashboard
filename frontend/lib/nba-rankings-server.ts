import {cleanNbaName,loadNbaOverview,playerBaseline,type NbaMarketKey,NBA_MARKETS,nbaHeadshot} from "@/lib/nba";
import {getNbaPredictions,saveNbaPredictions} from "@/lib/nba-history";

const OWLS_URL="https://api.owlsinsight.com/api/v1/nba/props";
const norm=(v:any)=>String(v??"").toLowerCase().replace(/[^a-z0-9]/g,"");
const safe=(v:any)=>{const n=Number(v);return Number.isFinite(n)?n:null};
function median(xs:number[]){const a=xs.filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return null;const i=Math.floor(a.length/2);return a.length%2?a[i]:(a[i-1]+a[i])/2}
function americanProb(v:any){const n=Number(v);if(!Number.isFinite(n)||n===0)return null;return Math.round((n>0?100/(n+100):Math.abs(n)/(Math.abs(n)+100))*1000)/10}
function marketMatches(v:any,m:NbaMarketKey){const x=norm(v);const aliases:Record<NbaMarketKey,string[]>={
 points:["points","playerpoints"],rebounds:["rebounds","playerrebounds"],assists:["assists","playerassists"],threes_made:["threesmade","threepointersmade","3pointersmade"],
 pts_rebs_asts:["ptsrebsasts","pointsreboundsassists","pra"],pts_rebs:["ptsrebs","pointsrebounds"],pts_asts:["ptsasts","pointsassists"],rebs_asts:["rebsasts","reboundsassists"],steals:["steals"],blocks:["blocks"],first_basket:["firstbasket","firstfieldgoal","firstfieldgoalscorer","firstscorer","firstbasketmade"]
};return aliases[m].includes(x)}

export function torontoNbaDay(v:Date|string){
 const d=typeof v==="string"?new Date(v):v;if(Number.isNaN(d.getTime()))return"";
 const parts=new Intl.DateTimeFormat("en-US",{timeZone:"America/Toronto",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d);
 const get=(t:string)=>parts.find(x=>x.type===t)?.value||"";return `${get("year")}-${get("month")}-${get("day")}`;
}

async function fetchOwlsPayload(){
 const key=process.env.OWLS_INSIGHT_API_KEY;if(!key)throw new Error("OWLS_INSIGHT_API_KEY is missing from Railway.");
 const r=await fetch(OWLS_URL,{headers:{Authorization:`Bearer ${key}`,Accept:"application/json"},cache:"no-store"});
 if(!r.ok)throw new Error(`Owls Insight returned ${r.status}`);
 return r.json();
}

function boardForMarket(payload:any,market:NbaMarketKey){
 const games=Array.isArray(payload?.data)?payload.data:[];const grouped=new Map<string,any>();
 for(const game of games){
  const away=String(game.awayTeam||game.away_team||""),home=String(game.homeTeam||game.home_team||"");
  const matchup=away&&home?`${away} @ ${home}`:String(game.name||"");
  const gameTime=String(game.commenceTime||game.commence_time||game.startTime||game.date||"");
  for(const book of Array.isArray(game.books)?game.books:[])for(const prop of Array.isArray(book.props)?book.props:[]){
   if(!marketMatches(prop.category??prop.market??prop.type,market))continue;
   const playerName=String(prop.playerName||prop.player_name||prop.name||"").trim();if(!playerName)continue;
   const playerTeam=String(prop.teamAbbr||prop.team_abbr||prop.team||prop.playerTeam||prop.player_team||"").toUpperCase();
   const line=safe(prop.line??prop.point??prop.total);if(line==null&&market!=="first_basket")continue;
   const over=safe(prop.overPrice??prop.over_price??prop.overOdds??prop.over_odds??prop.price??prop.odds??prop.americanOdds);
   const k=`${cleanNbaName(playerName)}|${cleanNbaName(matchup)}`;
   const cur=grouped.get(k)??{playerName,playerTeam,matchup,gameTime,lines:[],prices:[],books:new Set<string>()};
   if(line!=null)cur.lines.push(line);if(over!=null)cur.prices.push(over);cur.books.add(String(book.key||book.name||book.title||"book"));grouped.set(k,cur);
  }
 }
 return [...grouped.values()].map((x:any)=>({playerName:x.playerName,playerTeam:x.playerTeam,matchup:x.matchup,gameTime:x.gameTime,line:median(x.lines),bookProbability:americanProb(median(x.prices)),bookmakerCount:x.books.size}));
}

function gameForRow(games:any[],team:string,b:any){
 const teamGames=games.filter(g=>[g.awayAbbr,g.homeAbbr].map((x:any)=>String(x).toUpperCase()).includes(team));
 if(!teamGames.length)return undefined;
 const propDay=torontoNbaDay(b.gameTime||"");
 const sameDay=propDay?teamGames.filter(g=>torontoNbaDay(g.tipoff||"")===propDay):[];
 const pool=sameDay.length?sameDay:teamGames;
 const target=new Date(b.gameTime||0).getTime();
 return [...pool].sort((a,c)=>Math.abs(new Date(a.tipoff||0).getTime()-target)-Math.abs(new Date(c.tipoff||0).getTime()-target))[0];
}

function rowsForMarket(payload:any,overview:any,market:NbaMarketKey){
 const board=boardForMarket(payload,market);const byName=new Map(overview.players.map((p:any)=>[cleanNbaName(p.playerName),p]));const today=torontoNbaDay(new Date());
 const uniqueBoard=[...board.reduce((acc:Map<string,any>,b:any)=>{const key=cleanNbaName(b.playerName);const existing=acc.get(key);if(!existing||Number(b.bookmakerCount||0)>Number(existing.bookmakerCount||0))acc.set(key,b);return acc},new Map<string,any>()).values()] as any[];
 const rows=uniqueBoard.map((b:any)=>{
  const p:any=byName.get(cleanNbaName(b.playerName));const team=String(b.playerTeam||p?.team||"").toUpperCase();const game=gameForRow(overview.games,team,b);if(!game)return null;
  const gameDay=torontoNbaDay(game.tipoff||"");const active=game.state==="in"||(gameDay===today&&game.state!=="post");if(!active)return null;
  const actualMatchup=`${game.awayTeam} @ ${game.homeTeam}`,actualTime=game.tipoff||b.gameTime,teamLogo=String(game.awayAbbr).toUpperCase()===team?game.awayLogo:game.homeLogo;
  const baseline=playerBaseline(p,market);const edge:number|null=baseline!=null&&b.line!=null?baseline-b.line:null;
  const reliability=Math.min(1,Math.max(0,(p?.gamesPlayed??0)/30));const edgePct=edge!=null&&b.line?Math.min(1,Math.abs(edge)/Math.max(1,Math.abs(b.line))):0;
  const firstBasket=market==="first_basket";
  const modelProbability=firstBasket?b.bookProbability:(edge==null?null:Math.max(50,Math.min(82,Math.round((54+Math.abs(edge)*2.2+reliability*5)*10)/10)));
  const gi=Math.round((firstBasket?(45+(modelProbability??0)*0.4+reliability*15):(50+edgePct*35+reliability*15))*10)/10;
  return{playerId:p?.playerId||cleanNbaName(b.playerName),playerName:b.playerName,teamName:team||p?.team||"NBA",teamLogo:teamLogo||"",matchup:actualMatchup,gameTime:actualTime,gameId:game.gameId||"",gameState:game.state||"pre",gameStatus:game.status||"Scheduled",headshot:p?nbaHeadshot(p.playerId):"",sportsbookLine:b.line,bookmakerCount:b.bookmakerCount,modelProjection:firstBasket?null:baseline,modelProbability,giScore:gi,prediction:firstBasket?"FIRST BASKET":edge==null?null:edge>=0?"OVER":"UNDER",summary:firstBasket?`First Basket candidate backed by ${b.bookmakerCount} sportsbook source${b.bookmakerCount===1?"":"s"}${modelProbability!=null?` with ${modelProbability.toFixed(1)}% market-implied probability`:""}. Starter status and opening-possession context are incorporated when available.`:baseline==null||edge==null?`Verified sportsbook line ${b.line}. Statistical baseline is still loading.`:`2026 baseline ${baseline.toFixed(1)} vs verified line ${Number(b.line).toFixed(1)} (${edge>=0?"+":""}${edge.toFixed(1)} edge). ${b.bookmakerCount} sportsbook source${b.bookmakerCount===1?"":"s"} currently represented.`}
 }).filter(Boolean) as any[];

 // Owls can expose only a small market-backed board (often five players). Keep those
 // verified-line candidates first, then fill the ranking board from eligible players
 // whose teams have an active game today. Model-only fillers are NEVER persisted as
 // sportsbook predictions because sportsbookLine remains null.
 const used=new Set(rows.map((x:any)=>cleanNbaName(x.playerName)));
 const activeGames=overview.games.filter((g:any)=>{
   const gameDay=torontoNbaDay(g.tipoff||"");
   return g.state==="in"||(gameDay===today&&g.state!=="post");
 });
 const activeTeams=new Set(activeGames.flatMap((g:any)=>[String(g.awayAbbr||"").toUpperCase(),String(g.homeAbbr||"").toUpperCase()]));
 const fillers=market==="first_basket"?[]:overview.players.map((p:any)=>{
   const team=String(p?.team||"").toUpperCase();
   if(!activeTeams.has(team)||used.has(cleanNbaName(p.playerName)))return null;
   const baseline=playerBaseline(p,market);if(baseline==null)return null;
   const game=activeGames.find((g:any)=>[g.awayAbbr,g.homeAbbr].map((x:any)=>String(x).toUpperCase()).includes(team));
   if(!game)return null;
   const reliability=Math.min(1,Math.max(0,(p?.gamesPlayed??0)/30));
   return{playerId:p.playerId,playerName:p.playerName,teamName:p.team||"NBA",teamLogo:String(game.awayAbbr).toUpperCase()===team?game.awayLogo||"":game.homeLogo||"",matchup:`${game.awayTeam} @ ${game.homeTeam}`,gameTime:game.tipoff||"",gameId:game.gameId||"",gameState:game.state||"pre",gameStatus:game.status||"Scheduled",headshot:nbaHeadshot(p.playerId),sportsbookLine:null,bookmakerCount:0,modelProjection:baseline,modelProbability:null,giScore:Math.round((50+reliability*15)*10)/10,prediction:null,marketBacked:false,summary:`2026 statistical baseline ${baseline.toFixed(1)}. No verified sportsbook line is currently available, so this player is ranked as a model-only eligible candidate and is not saved for grading.`};
 }).filter(Boolean) as any[];
 rows.sort((a:any,b:any)=>b.giScore-a.giScore);
 fillers.sort((a:any,b:any)=>b.giScore-a.giScore);
 return [...rows,...fillers].slice(0,25).map((x:any,i:number)=>({...x,rank:i+1}));
}

export async function buildNbaMarketRankings(market:NbaMarketKey,shared?:{payload:any;overview:any}){
 try{
  const source=shared??{payload:await fetchOwlsPayload(),overview:await loadNbaOverview()};
  const ranked=rowsForMarket(source.payload,source.overview,market);
  const saved=await saveNbaPredictions(market,ranked).catch(()=>false);
  return {success:true,market,rows:ranked,saved,updatedAt:new Date().toISOString(),source:"Owls Insight NBA props + ESPN NBA schedule/status"};
 }catch(e:any){
  const today=torontoNbaDay(new Date());
  const saved=await getNbaPredictions(market,today).catch(()=>({connected:false,predictions:[]} as any));
  const fallback=(saved.predictions||[]).filter((x:any)=>x.status==="pending").sort((a:any,b:any)=>Number(a.rank||999)-Number(b.rank||999)).slice(0,25).map((x:any,i:number)=>({rank:Number(x.rank||0)||i+1,playerId:x.playerId,playerName:x.playerName,teamName:x.teamName,teamLogo:x.teamLogo||"",headshot:x.headshot||"",matchup:x.matchup,gameTime:x.gameTime,gameId:x.gameId||"",sportsbookLine:x.sportsbookLine,modelProjection:x.modelProjection,modelProbability:x.modelProbability,giScore:x.giScore,bookmakerCount:x.bookmakerCount,prediction:x.pickSide,frozen:true,marketBacked:true,summary:"Last successful NBA ranking snapshot retained while live data refreshes."}));
  return {success:fallback.length>0,market,rows:fallback,cached:fallback.length>0,source:fallback.length?"Saved NBA ranking snapshot":"Owls Insight",error:String(e?.message||e),updatedAt:new Date().toISOString()};
 }
}

export async function captureAllNbaMarkets(){
 const [payload,overview]=await Promise.all([fetchOwlsPayload(),loadNbaOverview()]);
 const results=await Promise.all(NBA_MARKETS.map(async([market])=>{
  try{return await buildNbaMarketRankings(market,{payload,overview})}
  catch(e:any){return {success:false,market,rows:[],saved:false,error:String(e?.message||e)}}
 }));
 return {success:results.some(x=>x.success&&x.saved!==false),markets:results.map(x=>({market:x.market,rows:x.rows?.length||0,saved:x.saved!==false,success:x.success,error:x.error||null})),updatedAt:new Date().toISOString()};
}
