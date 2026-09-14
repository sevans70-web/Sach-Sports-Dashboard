import {NextRequest,NextResponse} from "next/server";
import {NFL_MARKETS,type NflMarketKey,cleanName,safeNumber} from "@/lib/nfl";
import {getEspnNflSchedule,getNflTeamRoster} from "@/lib/nfl-server";
import {nflPredictionProbability,nflGiScore} from "@/lib/nfl-prediction";
import {saveNflPregamePredictions,getNflResultMap,getNflPredictions,type SavedNflPrediction} from "@/lib/nfl-history";

export const dynamic="force-dynamic";
export const revalidate=0;

const OWLS_URL="https://api.owlsinsight.com/api/v1/nfl/props";
const ATHLETE_BASE="https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes";

const OWLS_MARKETS:Record<NflMarketKey,string[]>={
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
 q1_passing_yards:["q1_passing_yards","1q_passing_yards","first_quarter_passing_yards","1st_quarter_passing_yards","passing_yards_1q","passing_yards_first_quarter","player_pass_yds_1q"],
 q1_qb_rushing_yards:["q1_rushing_yards","1q_rushing_yards","first_quarter_rushing_yards","1st_quarter_rushing_yards","rushing_yards_1q","rushing_yards_first_quarter","player_rush_yds_1q"],
 q1_rushing_yards:["q1_rushing_yards","1q_rushing_yards","first_quarter_rushing_yards","1st_quarter_rushing_yards","rushing_yards_1q","rushing_yards_first_quarter","player_rush_yds_1q"],
 q1_receiving_yards:["q1_receiving_yards","1q_receiving_yards","first_quarter_receiving_yards","1st_quarter_receiving_yards","receiving_yards_1q","receiving_yards_first_quarter","player_reception_yds_1q"],
};
const HISTORY_KEYS:Partial<Record<NflMarketKey,string[]>>={
 passing_yards:["passingyards","passyards","yds"],
 passing_tds:["passingtouchdowns","passingtds","passtds","td"],
 qb_rushing_yards:["rushingyards","rushyards","yds"],
 passing_rushing_yards:["passingyards","passyards","yds"],
 rushing_yards:["rushingyards","rushyards","yds"],
 rushing_tds:["rushingtouchdowns","rushingtds","rushtds","td"],
 receiving_yards:["receivingyards","receptionyards","recyards","yds"],
 receptions:["receptions","rec"],
 rushing_receiving_yards:["rushingyards","rushyards","yds"],
 anytime_td:["totaltouchdowns","touchdowns","rushingreceivingtouchdowns","td"],
 q1_passing_yards:["passingyards","passyards","yds"],
 q1_qb_rushing_yards:["rushingyards","rushyards","yds"],
 q1_rushing_yards:["rushingyards","rushyards","yds"],
 q1_receiving_yards:["receivingyards","receptionyards","recyards","yds"],
};
function norm(v:any){return String(v??"").toLowerCase().replace(/[^a-z0-9]/g,"")}
function median(xs:number[]){const a=xs.filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return null;const i=Math.floor(a.length/2);return a.length%2?a[i]:(a[i-1]+a[i])/2}
function americanProb(v:any){const n=Number(v);if(!Number.isFinite(n)||n===0)return null;return Math.round((n>0?100/(n+100):Math.abs(n)/(Math.abs(n)+100))*1000)/10}
function categoryMatches(v:any,m:NflMarketKey){const x=norm(v);return OWLS_MARKETS[m].some(k=>norm(k)===x)}
function easternDayKey(v:Date|string){const d=typeof v==="string"?new Date(v):v;if(Number.isNaN(d.getTime()))return "";const p=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Toronto",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d);const g=(t:string)=>p.find(x=>x.type===t)?.value||"";return `${g("year")}-${g("month")}-${g("day")}`}
function rowGameTime(row:any,schedule:any[]){if(row.gameTime)return String(row.gameTime);const t=cleanName(String(row.matchup||""));const g=schedule.find(x=>cleanName(`${x.awayTeam} @ ${x.homeTeam}`)===t);return g?.date?String(g.date):""}

async function fetchOwlsRows(market:NflMarketKey){
 const key=process.env.OWLS_INSIGHT_API_KEY;if(!key)throw new Error("OWLS_INSIGHT_API_KEY is missing from Railway.");
 const r=await fetch(OWLS_URL,{headers:{Authorization:`Bearer ${key}`,Accept:"application/json"},cache:"no-store"});
 if(!r.ok)throw new Error(`Owls Insight returned ${r.status}`);
 const payload=await r.json(),games=Array.isArray(payload?.data)?payload.data:[],grouped=new Map<string,any>();
 for(const game of games){
  const away=String(game.awayTeam||game.away_team||""),home=String(game.homeTeam||game.home_team||"");
  const matchup=away&&home?`${away} @ ${home}`:String(game.name||""),gameTime=String(game.commenceTime||game.commence_time||game.startTime||game.date||"");
  for(const book of Array.isArray(game.books)?game.books:[])for(const prop of Array.isArray(book.props)?book.props:[]){
   if(!categoryMatches(prop.category??prop.market??prop.type,market))continue;
   const playerName=String(prop.playerName||prop.player_name||prop.name||"").trim();if(!playerName)continue;
   const teamName=String(prop.team||prop.teamName||prop.team_name||"");
   const line=safeNumber(prop.line??prop.point??prop.total),overPrice=safeNumber(prop.overPrice??prop.over_price??prop.price??prop.odds);
   const td=market==="anytime_td"||market==="first_td";if(!td&&line==null)continue;if(td&&overPrice==null&&line==null)continue;
   const k=`${cleanName(playerName)}|${cleanName(matchup)}`,cur=grouped.get(k)??{playerName,teamName,matchup,gameTime,lines:[],prices:[],books:new Set<string>()};
   if(line!=null)cur.lines.push(line);if(overPrice!=null)cur.prices.push(overPrice);cur.books.add(String(book.key||book.name||book.title||"book"));if(!cur.teamName&&teamName)cur.teamName=teamName;grouped.set(k,cur);
  }
 }
 return [...grouped.values()].map((x:any)=>({playerName:x.playerName,teamName:x.teamName,matchup:x.matchup,gameTime:x.gameTime,line:median(x.lines),prob:americanProb(median(x.prices)),bookmakerCount:x.books.size}));
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
     const roster=await getNflTeamRoster(teamId);
     const exact=roster.players.find(p=>cleanName(p.name)===wanted);
     const loose=roster.players.find(p=>{
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
async function fetchLog(id:string,season:number){const r=await fetch(`${ATHLETE_BASE}/${encodeURIComponent(id)}/gamelog?season=${season}`,{cache:"no-store",headers:{"User-Agent":"Mozilla/5.0","Accept":"application/json, text/plain, */*","Origin":"https://www.espn.com","Referer":"https://www.espn.com/"}});if(!r.ok)throw 0;return r.json()}
function statIndex(payload:any,market:NflMarketKey){
 const names=(Array.isArray(payload?.names)?payload.names:[]).map(norm);
 for(const wanted of HISTORY_KEYS[market]||[]){
   const i=names.findIndex((n:string)=>n===wanted);
   if(i>=0)return i;
 }
 return -1;
}
function history(payload:any,market:NflMarketKey){
 const ix=statIndex(payload,market);
 if(ix<0)return [];
 const vals:number[]=[];const seen=new Set<string>();
 for(const st of payload?.seasonTypes||[]){
   for(const c of st?.categories||[]){
     if(c?.type!=="event")continue;
     for(const ev of c?.events||[]){
       const eventId=String(ev?.eventId||"");
       if(!eventId||seen.has(eventId))continue;
       const raw=Array.isArray(ev?.stats)?ev.stats[ix]:undefined;
       const value=Number(raw);
       if(!Number.isFinite(value))continue;
       seen.add(eventId);vals.push(value);
     }
   }
 }
 return vals;
}
function projection(vals:number[]){const xs=vals.slice(-10);if(!xs.length)return null;let sum=0,w=0;xs.forEach((v,i)=>{const k=i+1;sum+=v*k;w+=k});return Math.round(sum/w*10)/10}
async function model(id:string,market:NflMarketKey){
 if(!id||market==="first_td")return {projection:null,games:0};
 const blocks=await Promise.all([2025,2026].map(async y=>{try{return history(await fetchLog(id,y),market)}catch{return []}}));
 const vals=blocks.flat();
 let projected=projection(vals);
 if(projected!=null&&market.startsWith("q1_")) projected=Math.round(projected*0.25*10)/10;
 return {projection:projected,games:vals.length}
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
 const n=Number(String(v??"").replace(/[^0-9.-]/g,""));
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
function q1StatFromSummary(payload:any,playerId:string,playerName:string,kind:"passing"|"rushing"|"receiving"){
 let total=0,matched=false;
 for(const play of quarterOnePlays(payload)){
   const yards=numStat(play?.statYardage??play?.yards??play?.yardage);
   const text=String(play?.text||play?.shortText||play?.description||"");
   const participants=Array.isArray(play?.participants)?play.participants:[];
   let roleMatch=false;
   for(const participant of participants){
     if(!participantMatches(participant,playerId,playerName))continue;
     const role=cleanName(participant?.type||participant?.role||participant?.statType||participant?.participantType||"");
     if(kind==="passing"&&(role.includes("passer")||role.includes("passing")||role.includes("pass")))roleMatch=true;
     if(kind==="rushing"&&(role.includes("rusher")||role.includes("rushing")||role.includes("rush")))roleMatch=true;
     if(kind==="receiving"&&(role.includes("receiver")||role.includes("receiving")||role.includes("reception")||role.includes("target")))roleMatch=true;
   }
   if(!roleMatch){
     const cleanText=cleanName(text),wanted=cleanName(playerName),last=wanted.split(" ").filter(Boolean).pop()||wanted;
     const hasName=cleanText.includes(wanted)||(last.length>=3&&cleanText.split(" ").includes(last));
     if(hasName){
       if(kind==="passing"&&/\bpass(?:es|ed)?\b/i.test(text)&&!/^.*\bto\b/i.test(text.slice(0,Math.max(0,text.toLowerCase().indexOf(last)))) )roleMatch=true;
       if(kind==="receiving"&&/\bpass(?:es|ed)?\b.*\bto\b/i.test(text))roleMatch=true;
       if(kind==="rushing"&&!/\bpass(?:es|ed)?\b/i.test(text)&&( /\bfor\s+-?\d+\s+yards?\b/i.test(text)||/\brun\b|\brush\b/i.test(text)))roleMatch=true;
     }
   }
   if(!roleMatch)continue;
   let value=yards;
   if(value==null){const m=text.match(/for\s+(-?\d+)\s+yards?/i);value=m?Number(m[1]):null}
   if(value!=null&&Number.isFinite(value)){total+=value;matched=true}
 }
 return matched?total:0;
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
 if(market==="passing_rushing_yards"){const a=passingYds(),b=rushingYds();return a==null&&b==null?null:(a||0)+(b||0)}
 if(market==="rushing_receiving_yards"){const a=rushingYds(),b=receivingYds();return a==null&&b==null?null:(a||0)+(b||0)}
 if(market==="anytime_td"){const a=rushingTd(),b=receivingTd();return a==null&&b==null?null:(a||0)+(b||0)}
 if(market==="first_td")return firstTdFromSummary(payload,playerName);
 if(market==="q1_passing_yards")return q1StatFromSummary(payload,playerId,playerName,"passing");
 if(market==="q1_qb_rushing_yards"||market==="q1_rushing_yards")return q1StatFromSummary(payload,playerId,playerName,"rushing");
 if(market==="q1_receiving_yards")return q1StatFromSummary(payload,playerId,playerName,"receiving");
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
  const current=payload?currentMarketStat(payload,market,row.playerId,row.playerName):null;
  const line=Number(row.sportsbookLine);
  const pct=current!=null&&Number.isFinite(line)&&line>0?Math.max(0,Math.min(200,Math.round(current/line*100))):null;
  return {...row,gameId:String(g.id||""),gameState:String(g.state||"pre"),gameStatus:String(g.status||""),gameTime:row.gameTime||g.date||"",liveCurrent:current,liveProgressPct:pct};
 });
}

export async function GET(req:NextRequest){
 const market=(req.nextUrl.searchParams.get("market")||"passing_yards") as NflMarketKey;
 if(!NFL_MARKETS.some(x=>x[0]===market))return NextResponse.json({success:false,error:"Unsupported NFL market"},{status:400});
 try{
  const [owlsRows,schedule]=await Promise.all([fetchOwlsRows(market),getEspnNflSchedule()]),today=easternDayKey(new Date());
  const active=owlsRows.filter((row:any)=>{const t=rowGameTime(row,schedule);if(!t)return true;const k=easternDayKey(t);return !k||k>=today});
  const built=await Promise.all(active.slice(0,60).map(async(row:any)=>{
   const profile=await resolvePlayer(row.playerName,row.teamName,row.matchup,schedule);
   const pos=String(profile.position||"").toUpperCase();
   const qbOnly=market==="qb_rushing_yards"||market==="q1_qb_rushing_yards";
   const nonQbRush=market==="rushing_yards"||market==="q1_rushing_yards";
   if(qbOnly&&pos!=="QB")return null;
   if(nonQbRush&&pos==="QB")return null;
   const m=await model(profile.id,market);
   const probability=nflPredictionProbability(market,m.projection,row.line,row.prob);
   const rankingProbability=probability??row.prob??50;
   const game=matchupGame(schedule,row.matchup);
   return {rank:0,playerId:profile.id||cleanName(row.playerName),playerName:row.playerName,teamName:profile.teamName||row.teamName||"NFL",teamId:profile.teamId,position:profile.position,headshot:profile.headshot,teamLogo:profile.teamLogo||teamLogo(profile,row,schedule),matchup:row.matchup,gameTime:row.gameTime||game?.date||"",gameId:String(game?.id||""),giScore:nflGiScore(rankingProbability,row.bookmakerCount,m.games),modelProbability:probability,sportsbookLine:row.line,sportsbookProbability:row.prob,bookmakerCount:row.bookmakerCount,perGame:m.projection,modelProjection:m.projection,projectionGames:m.games,seasonTotal:null,gamesPlayed:m.games,season:2026,summary:(()=>{
     const label=NFL_MARKETS.find(x=>x[0]===market)?.[2]||market;
     const edge=row.line!=null&&m.projection!=null?Number(m.projection)-Number(row.line):null;
     const edgeText=edge==null?"":` The model sits ${Math.abs(edge).toFixed(1)} ${edge>=0?"above":"below"} the current line.`;
     const probText=probability!=null?` Model probability is ${Number(probability).toFixed(0)}%.`:"";
     const q1=market.startsWith("q1_")?" This is a first-quarter market and is graded only on Q1 production.":"";
     return `${label}: ${m.games} verified recent game${m.games===1?"":"s"} and ${row.bookmakerCount} sportsbook${row.bookmakerCount===1?"":"s"} support the ranking.${edgeText}${probText}${q1}`;
   })(),marketBacked:true};
  }));
  const rows=built.filter(Boolean) as any[];
  rows.sort((a,b)=>b.giScore-a.giScore);const ranked=rows.slice(0,25).map((r,i)=>({...r,rank:i+1}));
  const historySaved=await saveNflPregamePredictions(market,ranked,schedule);
  const results=await getNflResultMap(market,today);
  const withResults=ranked.map(r=>{const p=results.get(`${r.playerId}|game:${r.gameId}`)||results.get(`${r.playerId}|matchup:${cleanName(r.matchup)}`);const margin=p?.actual!=null&&p.sportsbookLine!=null?p.actual-p.sportsbookLine:null;return p?{...r,resultStatus:p.status,actualResult:p.actual,resultMargin:margin,resultSymbol:p.status==="hit"?"✅":p.status==="miss"?"❌":p.status==="push"?"➖":p.status==="void"?"VOID":""}:r});
  const liveRows=await liveContext(withResults,schedule,market);

  // NFL must behave like the MLB daily board: once a player reaches kickoff in the
  // tracked Top 25, that prediction stays visible for the rest of the day even if
  // the sportsbook feed removes the completed game.  Current pregame rows can still
  // move, enter and drop; started/final rows are locked from the Supabase snapshot.
  const savedToday=await getNflPredictions(market,today);
  const liveKeys=new Set(liveRows.map((r:any)=>`${r.playerId}|${r.gameId||cleanName(r.matchup)}`));
  const gameFor=(p:SavedNflPrediction)=>p.gameId?schedule.find((g:any)=>String(g.id)===String(p.gameId)):matchupGame(schedule,p.matchup);
  const started=(g:any)=>Boolean(g&&(g.state==="in"||g.completed||g.state==="post"));
  const archived=savedToday.predictions
    .filter((p:SavedNflPrediction)=>started(gameFor(p))&&!liveKeys.has(`${p.playerId}|${p.gameId||cleanName(p.matchup)}`))
    .sort((a:SavedNflPrediction,b:SavedNflPrediction)=>Number(a.lastSeenRank||a.originalRank||99)-Number(b.lastSeenRank||b.originalRank||99))
    .map((p:SavedNflPrediction)=>{
      const g=gameFor(p);
      const margin=p.actual!=null&&p.sportsbookLine!=null?p.actual-p.sportsbookLine:null;
      return {rank:Number(p.lastSeenRank||p.originalRank||99),playerId:p.playerId,playerName:p.playerName,teamName:p.teamName,teamId:p.teamId||"",position:p.position||"",
        headshot:p.headshot||(/^\d+$/.test(p.playerId)?`https://a.espncdn.com/i/headshots/nfl/players/full/${p.playerId}.png`:""),teamLogo:p.teamLogo||"",matchup:p.matchup,gameTime:p.gameTime,
        giScore:p.giScore,modelProbability:p.modelProbability,modelProjection:p.modelProjection,projectionGames:null,sportsbookLine:p.sportsbookLine,sportsbookProbability:null,bookmakerCount:p.bookmakerCount,
        perGame:p.modelProjection,seasonTotal:null,gamesPlayed:null,season:2026,summary:`Frozen pregame ${NFL_MARKETS.find(x=>x[0]===market)?.[2]||market} prediction. This player remains on today's board after kickoff so the original pick can be graded.`,marketBacked:true,
        resultStatus:p.status,actualResult:p.actual,resultMargin:margin,resultSymbol:p.status==="hit"?"✅":p.status==="miss"?"❌":p.status==="push"?"➖":p.status==="void"?"VOID":"",
        gameId:String(g?.id||""),gameState:g?.completed?"post":String(g?.state||"post"),gameStatus:String(g?.status||""),liveCurrent:p.actual,liveProgressPct:p.actual!=null&&p.sportsbookLine&&p.sportsbookLine>0?Math.max(0,Math.min(200,Math.round(p.actual/p.sportsbookLine*100))):null};
    });
  const currentGameFor=(r:any)=>r.gameId?schedule.find((g:any)=>String(g.id)===String(r.gameId)):matchupGame(schedule,r.matchup);
  const startedCurrent=liveRows.filter((r:any)=>started(currentGameFor(r)));
  const futureCurrent=liveRows.filter((r:any)=>!started(currentGameFor(r)));
  const lockedKeys=new Set([...startedCurrent,...archived].map((r:any)=>`${r.playerId}|${r.gameId||cleanName(r.matchup)}`));
  const merged=[...startedCurrent,...archived,...futureCurrent.filter((r:any)=>!lockedKeys.has(`${r.playerId}|${r.gameId||cleanName(r.matchup)}`))]
    .slice(0,25).map((r:any,i:number)=>({...r,rank:i+1}));
  return NextResponse.json({success:true,source:"Owls Insight + frozen daily slate",market,rows:merged,sportsbookOnly:true,validRankingCount:merged.length,recoveredPredictions:savedToday.predictions.length,recoveredSnapshots:Number(savedToday.snapshotCount||0),historySaved,historyConnected:savedToday.connected,historyWritable:savedToday.writable,updatedAt:new Date().toISOString()},{headers:{"Cache-Control":"no-store, no-cache, must-revalidate, max-age=0","Pragma":"no-cache"}});
 }catch(e){return NextResponse.json({success:false,source:"Owls Insight",market,rows:[],sportsbookOnly:true,error:e instanceof Error?e.message:"NFL rankings unavailable"},{status:500,headers:{"Cache-Control":"no-store, no-cache, must-revalidate, max-age=0","Pragma":"no-cache"}})}
}
