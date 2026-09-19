import {NextRequest,NextResponse} from "next/server";
import {cleanWnbaName,loadWnbaOverview,playerBaseline,type WnbaMarketKey,WNBA_MARKETS,wnbaHeadshot} from "@/lib/wnba";
import {getWnbaPredictions,saveWnbaPredictions} from "@/lib/wnba-history";

const OWLS_URL="https://api.owlsinsight.com/api/v1/wnba/props";
const allowed=new Set(WNBA_MARKETS.map(x=>x[0]));
const norm=(v:any)=>String(v??"").toLowerCase().replace(/[^a-z0-9]/g,"");
const safe=(v:any)=>{const n=Number(v);return Number.isFinite(n)?n:null};
function median(xs:number[]){const a=xs.filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return null;const i=Math.floor(a.length/2);return a.length%2?a[i]:(a[i-1]+a[i])/2}
function americanProb(v:any){const n=Number(v);if(!Number.isFinite(n)||n===0)return null;return Math.round((n>0?100/(n+100):Math.abs(n)/(Math.abs(n)+100))*1000)/10}
function marketMatches(v:any,m:WnbaMarketKey){const x=norm(v);const aliases:Record<WnbaMarketKey,string[]>={
 points:["points","playerpoints"],rebounds:["rebounds","playerrebounds"],assists:["assists","playerassists"],threes_made:["threesmade","threepointersmade","3pointersmade"],
 pts_rebs_asts:["ptsrebsasts","pointsreboundsassists","pra"],pts_rebs:["ptsrebs","pointsrebounds"],pts_asts:["ptsasts","pointsassists"],rebs_asts:["rebsasts","reboundsassists"],steals:["steals"],blocks:["blocks"]
};return aliases[m].includes(x)}
async function owls(market:WnbaMarketKey){
 const key=process.env.OWLS_INSIGHT_API_KEY;if(!key)throw new Error("OWLS_INSIGHT_API_KEY is missing from Railway.");
 const r=await fetch(OWLS_URL,{headers:{Authorization:`Bearer ${key}`,Accept:"application/json"},cache:"no-store"});if(!r.ok)throw new Error(`Owls Insight returned ${r.status}`);
 const payload=await r.json();const games=Array.isArray(payload?.data)?payload.data:[];const grouped=new Map<string,any>();
 for(const game of games){const away=String(game.awayTeam||game.away_team||""),home=String(game.homeTeam||game.home_team||"");const matchup=away&&home?`${away} @ ${home}`:String(game.name||"");const gameTime=String(game.commenceTime||game.commence_time||game.startTime||game.date||"");
  for(const book of Array.isArray(game.books)?game.books:[])for(const prop of Array.isArray(book.props)?book.props:[]){if(!marketMatches(prop.category??prop.market??prop.type,market))continue;const playerName=String(prop.playerName||prop.player_name||prop.name||"").trim();if(!playerName)continue;const line=safe(prop.line??prop.point??prop.total);if(line==null)continue;const over=safe(prop.overPrice??prop.over_price??prop.overOdds??prop.over_odds);const k=`${cleanWnbaName(playerName)}|${cleanWnbaName(matchup)}`,cur=grouped.get(k)??{playerName,matchup,gameTime,lines:[],prices:[],books:new Set<string>()};cur.lines.push(line);if(over!=null)cur.prices.push(over);cur.books.add(String(book.key||book.name||book.title||"book"));grouped.set(k,cur)}
 }
 return [...grouped.values()].map((x:any)=>({playerName:x.playerName,matchup:x.matchup,gameTime:x.gameTime,line:median(x.lines),bookProbability:americanProb(median(x.prices)),bookmakerCount:x.books.size}));
}
function torontoDay(v:Date|string){
 const d=typeof v==="string"?new Date(v):v;if(Number.isNaN(d.getTime()))return"";
 const parts=new Intl.DateTimeFormat("en-US",{timeZone:"America/Toronto",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d);
 const get=(t:string)=>parts.find(x=>x.type===t)?.value||"";return `${get("year")}-${get("month")}-${get("day")}`;
}
function gameForRow(games:any[],team:string,b:any){
 const teamGames=games.filter(g=>[g.awayAbbr,g.homeAbbr].map((x:any)=>String(x).toUpperCase()).includes(team));
 if(!teamGames.length)return undefined;
 const propDay=torontoDay(b.gameTime||"");
 const sameDay=propDay?teamGames.filter(g=>torontoDay(g.tipoff||"")===propDay):[];
 const pool=sameDay.length?sameDay:teamGames;
 const target=new Date(b.gameTime||0).getTime();
 return [...pool].sort((a,c)=>Math.abs(new Date(a.tipoff||0).getTime()-target)-Math.abs(new Date(c.tipoff||0).getTime()-target))[0];
}
export async function GET(req:NextRequest){
 const market=(req.nextUrl.searchParams.get("market")||"points") as WnbaMarketKey;if(!allowed.has(market))return NextResponse.json({success:false,rows:[],error:"Unsupported WNBA market"},{status:400});
 try{const [board,overview]=await Promise.all([owls(market),loadWnbaOverview()]);const byName=new Map(overview.players.map(p=>[cleanWnbaName(p.playerName),p]));const today=torontoDay(new Date());
  const uniqueBoard=[...board.reduce((acc:Map<string,any>,b:any)=>{const key=cleanWnbaName(b.playerName);const existing=acc.get(key);if(!existing||Number(b.bookmakerCount||0)>Number(existing.bookmakerCount||0))acc.set(key,b);return acc},new Map<string,any>()).values()] as any[];
  const rows=uniqueBoard.map((b:any)=>{const p=byName.get(cleanWnbaName(b.playerName));const team=String(p?.team||"").toUpperCase();const game=gameForRow(overview.games,team,b);if(!game)return null;
   // Active rankings are today's pregame/live slate. A game that crosses midnight remains until ESPN marks it final.
   const gameDay=torontoDay(game.tipoff||"");const active=game.state==="in"||(gameDay===today&&game.state!=="post");if(!active)return null;
   const actualMatchup=`${game.awayTeam} @ ${game.homeTeam}`,actualTime=game.tipoff||b.gameTime,teamLogo=String(game.awayAbbr).toUpperCase()===team?game.awayLogo:game.homeLogo;const baseline=playerBaseline(p,market);const edge:number|null=baseline!=null&&b.line!=null?baseline-b.line:null;const reliability=Math.min(1,Math.max(0,(p?.gamesPlayed??0)/30));const edgePct=edge!=null&&b.line?Math.min(1,Math.abs(edge)/Math.max(1,Math.abs(b.line))):0;const gi=Math.round((50+edgePct*35+reliability*15)*10)/10;const modelProbability=edge==null?null:Math.max(50,Math.min(82,Math.round((54+Math.abs(edge)*2.2+reliability*5)*10)/10));return{playerId:p?.playerId||cleanWnbaName(b.playerName),playerName:b.playerName,teamName:p?.team||"WNBA",teamLogo:teamLogo||"",matchup:actualMatchup,gameTime:actualTime,gameId:game.gameId||"",gameState:game.state||"pre",gameStatus:game.status||"Scheduled",headshot:p?wnbaHeadshot(p.playerId):"",sportsbookLine:b.line,bookmakerCount:b.bookmakerCount,modelProjection:baseline,modelProbability,giScore:gi,prediction:edge==null?null:edge>=0?"OVER":"UNDER",summary:baseline==null||edge==null?`Verified sportsbook line ${b.line}. Statistical baseline is still loading.`:`2026 baseline ${baseline.toFixed(1)} vs verified line ${Number(b.line).toFixed(1)} (${edge>=0?"+":""}${edge.toFixed(1)} edge). ${b.bookmakerCount} sportsbook source${b.bookmakerCount===1?"":"s"} currently represented.`}}).filter(Boolean) as any[];
  rows.sort((a:any,b:any)=>b.giScore-a.giScore);const ranked=rows.slice(0,25).map((x:any,i:number)=>({...x,rank:i+1}));await saveWnbaPredictions(market,ranked).catch(()=>false);return NextResponse.json({success:true,market,rows:ranked,updatedAt:new Date().toISOString(),source:"Owls Insight WNBA props + ESPN WNBA schedule/status"});
 }catch(e:any){
   // Never blank a working dashboard because Owls/ESPN has a temporary slow or
   // failed refresh. Rehydrate the last durable rankings from saved predictions.
   const today=torontoDay(new Date());
   const saved=await getWnbaPredictions(market,today).catch(()=>({connected:false,predictions:[]} as any));
   const fallback=(saved.predictions||[])
     .filter((x:any)=>x.status==="pending")
     .sort((a:any,b:any)=>Number(a.rank||999)-Number(b.rank||999))
     .slice(0,25)
     .map((x:any,i:number)=>({
       rank:Number(x.rank||0)||i+1,playerId:x.playerId,playerName:x.playerName,
       teamName:x.teamName,teamLogo:x.teamLogo||"",headshot:x.headshot||"",
       matchup:x.matchup,gameTime:x.gameTime,gameId:x.gameId||"",
       sportsbookLine:x.sportsbookLine,modelProjection:x.modelProjection,
       modelProbability:x.modelProbability,giScore:x.giScore,
       bookmakerCount:x.bookmakerCount,prediction:x.pickSide,
       frozen:true,marketBacked:true,
       summary:"Last successful WNBA ranking snapshot retained while live data refreshes."
     }));
   return NextResponse.json({
     success:fallback.length>0,market,rows:fallback,cached:fallback.length>0,
     source:fallback.length?"Saved WNBA ranking snapshot":"Owls Insight",
     error:String(e?.message||e),updatedAt:new Date().toISOString()
   },{status:200});
 }
}
