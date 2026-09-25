export const NBA_SEASON = "2026"; // 2025-26 completed regular-season baseline

export const NBA_MARKETS = [
  ["points","Points","PTS"],["rebounds","Rebounds","REB"],["assists","Assists","AST"],
  ["threes_made","3-Pointers Made","3PM"],["pts_rebs_asts","Points + Rebounds + Assists","PRA"],
  ["pts_rebs","Points + Rebounds","P+R"],["pts_asts","Points + Assists","P+A"],
  ["rebs_asts","Rebounds + Assists","R+A"],["steals","Steals","STL"],["blocks","Blocks","BLK"],["first_basket","First Basket","1ST"],
] as const;
export type NbaMarketKey=(typeof NBA_MARKETS)[number][0];

export type NbaPlayer={
  playerId:number;playerName:string;team:string;gamesPlayed:number|null;minutesPerGame:number|null;
  pointsPerGame:number|null;reboundsPerGame:number|null;assistsPerGame:number|null;threesPerGame:number|null;
  stealsPerGame:number|null;blocksPerGame:number|null
};
export type NbaGame={gameId:string;tipoff:string|null;awayTeam:string;awayAbbr:string;awayLogo:string|null;awayScore:number|null;homeTeam:string;homeAbbr:string;homeLogo:string|null;homeScore:number|null;status:string;state:string;detail?:string};
export type NbaOverview={season:string;updatedAt:string;players:NbaPlayer[];games:NbaGame[];warnings:string[]};

type JsonRecord=Record<string,unknown>;
const STATS_URL="https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/statistics/byathlete";
const SCOREBOARD_URL="https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard";
const averageAliases={minutesPerGame:["avgminutes","minutespergame","minpergame"],pointsPerGame:["avgpoints","pointspergame","ptspergame"],reboundsPerGame:["avgrebounds","reboundspergame","rebpergame"],assistsPerGame:["avgassists","assistspergame","astpergame"],threesPerGame:["avgthreepointfieldgoalsmade","threepointfieldgoalsmadepergame","threepointersmadepergame","fg3mpergame"],stealsPerGame:["avgsteals","stealspergame","stlpergame"],blocksPerGame:["avgblocks","blockspergame","blkpergame"]} as const;
const totalAliases={minutesPerGame:["minutes","min"],pointsPerGame:["points","pts"],reboundsPerGame:["rebounds","rebs","reb"],assistsPerGame:["assists","ast"],threesPerGame:["threepointfieldgoalsmade","threepointersmade","fg3m","3pm"],stealsPerGame:["steals","stl"],blocksPerGame:["blocks","blk"]} as const;
function record(v:unknown):JsonRecord{return v&&typeof v==="object"&&!Array.isArray(v)?v as JsonRecord:{}}
function list(v:unknown):unknown[]{return Array.isArray(v)?v:[]}
function text(v:unknown):string{return typeof v==="string"||typeof v==="number"?String(v):""}
function number(v:unknown):number|null{if(typeof v==="number"&&Number.isFinite(v))return v;const n=Number(String(v??"").replaceAll(",",""));return Number.isFinite(n)?n:null}
function normalized(v:unknown):string{return text(v).toLowerCase().replace(/[^a-z0-9]/g,"")}
function firstStat(stats:Map<string,number>,aliases:readonly string[]):number|null{for(const alias of aliases){const v=stats.get(alias);if(v!==undefined)return v}return null}
function perGame(stats:Map<string,number>,field:keyof typeof averageAliases,games:number|null):number|null{const avg=firstStat(stats,averageAliases[field]);if(avg!==null)return avg;const total=firstStat(stats,totalAliases[field]);return total!==null&&games&&games>0?total/games:null}
function categoryLabels(payload:JsonRecord):string[][]{return list(payload.categories).map(v=>{const c=record(v);return list(c.names??c.labels).map(text)})}
function flattenStats(entry:JsonRecord,fallback:string[][]):Map<string,number>{const out=new Map<string,number>();list(entry.categories).forEach((v,i)=>{const c=record(v);const own=list(c.names??c.labels);const labels=own.length?own.map(text):(fallback[i]??[]);const totals=c.values??c.totals;if(totals&&typeof totals==="object"&&!Array.isArray(totals)){Object.entries(totals as JsonRecord).forEach(([label,value])=>{const n=number(value);if(n!==null)out.set(normalized(label),n)});return}list(totals).forEach((value,index)=>{const n=number(value);if(n!==null&&labels[index])out.set(normalized(labels[index]),n)})});return out}
function parsePlayers(payloads:JsonRecord[]):NbaPlayer[]{const players=new Map<number,NbaPlayer>();payloads.forEach(payload=>{const labels=categoryLabels(payload);list(payload.athletes).forEach(v=>{const entry=record(v),athlete=record(entry.athlete);const id=number(text(athlete.id??athlete.uid).split(":").at(-1)?.split("~").at(-1));const name=text(athlete.displayName??athlete.fullName);if(id===null||!name)return;const team=record(athlete.team),stats=flattenStats(entry,labels),games=firstStat(stats,["gamesplayed","games","gp"]);players.set(id,{playerId:id,playerName:name,team:text(athlete.teamShortName??athlete.teamAbbreviation??team.abbreviation)||"—",gamesPlayed:games,minutesPerGame:perGame(stats,"minutesPerGame",games),pointsPerGame:perGame(stats,"pointsPerGame",games),reboundsPerGame:perGame(stats,"reboundsPerGame",games),assistsPerGame:perGame(stats,"assistsPerGame",games),threesPerGame:perGame(stats,"threesPerGame",games),stealsPerGame:perGame(stats,"stealsPerGame",games),blocksPerGame:perGame(stats,"blocksPerGame",games)})})});return [...players.values()]}
async function fetchJson(url:string,revalidate:number):Promise<JsonRecord>{const response=await fetch(url,{headers:{Accept:"application/json","User-Agent":"Sach-Sports/1.0"},next:{revalidate}});if(!response.ok)throw new Error(`Provider returned ${response.status}`);return record(await response.json())}
async function loadPlayers():Promise<NbaPlayer[]>{const base={region:"us",lang:"en",contentorigin:"espn",isqualified:"false",limit:"500",sort:"offensive.avgPoints:desc",season:NBA_SEASON,seasontype:"2"};const first=await fetchJson(`${STATS_URL}?${new URLSearchParams({...base,page:"1"})}`,21600);const pages=Math.min(number(record(first.pagination).pages)??1,8);const remaining=await Promise.all(Array.from({length:Math.max(0,pages-1)},(_,i)=>fetchJson(`${STATS_URL}?${new URLSearchParams({...base,page:String(i+2)})}`,21600)));return parsePlayers([first,...remaining])}
function dateKey(date:Date):string{return date.toISOString().slice(0,10).replaceAll("-","")}
function competitor(c:JsonRecord,side:"home"|"away"):JsonRecord{return record(list(c.competitors).find(v=>text(record(v).homeAway)===side))}
async function loadGames():Promise<NbaGame[]>{
 // ESPN's scoreboard endpoint is reliable for a single YYYYMMDD date. Large
 // date ranges can return an empty events array during the preseason/offseason,
 // so query individual days instead. This window includes recent games for live/
 // final state plus the next 45 days, which comfortably reaches the next slate.
 const now=new Date();
 const dates=Array.from({length:48},(_,i)=>{const d=new Date(now);d.setUTCDate(d.getUTCDate()-2+i);return dateKey(d)});
 const payloads=await Promise.all(dates.map(d=>fetchJson(`${SCOREBOARD_URL}?dates=${d}&limit=100`,900).catch(()=>({events:[]} as JsonRecord))));
 const seen=new Set<string>();const games:NbaGame[]=[];
 for(const payload of payloads)for(const v of list(payload.events)){
  const e=record(v),id=text(e.id);if(!id||seen.has(id))continue;
  const c=record(list(e.competitions)[0]);if(!Object.keys(c).length)continue;
  const away=competitor(c,"away"),home=competitor(c,"home"),at=record(away.team),ht=record(home.team),status=record(record(e.status).type);
  seen.add(id);games.push({gameId:id,tipoff:text(e.date)||null,awayTeam:text(at.displayName)||"Away",awayAbbr:text(at.abbreviation),awayLogo:text(at.logo)||null,awayScore:number(away.score),homeTeam:text(ht.displayName)||"Home",homeAbbr:text(ht.abbreviation),homeLogo:text(ht.logo)||null,homeScore:number(home.score),status:text(status.shortDetail??status.description)||"Scheduled",state:text(status.state)||"pre",detail:text(record(e.status).displayClock)});
 }
 return games.sort((a,b)=>new Date(a.tipoff||0).getTime()-new Date(b.tipoff||0).getTime());
}
export async function loadNbaOverview():Promise<NbaOverview>{const warnings:string[]=[];const [pr,gr]=await Promise.allSettled([loadPlayers(),loadGames()]);const players=pr.status==="fulfilled"?pr.value:[],games=gr.status==="fulfilled"?gr.value:[];if(pr.status==="rejected")warnings.push("NBA player statistics are temporarily unavailable.");if(gr.status==="rejected")warnings.push("The NBA schedule is temporarily unavailable.");return{season:NBA_SEASON,updatedAt:new Date().toISOString(),players,games,warnings}}
export function nbaHeadshot(playerId:number|string):string{return `https://a.espncdn.com/i/headshots/nba/players/full/${playerId}.png`}
export function cleanNbaName(v:string){return v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,"")}
export function playerBaseline(p:NbaPlayer|undefined,market:NbaMarketKey):number|null{
 if(!p)return null;const a=p.pointsPerGame,r=p.reboundsPerGame,s=p.assistsPerGame;
 const sum=(...xs:(number|null)[])=>xs.some(x=>x==null)?null:xs.reduce<number>((t,x)=>t+(x??0),0);
 return market==="first_basket"?null:market==="points"?a:market==="rebounds"?r:market==="assists"?s:market==="threes_made"?p.threesPerGame:market==="pts_rebs_asts"?sum(a,r,s):market==="pts_rebs"?sum(a,r):market==="pts_asts"?sum(a,s):market==="rebs_asts"?sum(r,s):market==="steals"?p.stealsPerGame:p.blocksPerGame;
}

export type NbaRosterPlayer={playerId:string;playerName:string;position:string;starter:boolean;active:boolean;headshot:string};
export type NbaGameRoster={teamId:string;teamName:string;teamAbbr:string;teamLogo:string;players:NbaRosterPlayer[]};
export async function loadNbaGameRosters(gameId:string):Promise<NbaGameRoster[]>{
 try{
  const payload=await fetchJson(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${encodeURIComponent(gameId)}`,60);
  const box=record(payload.boxscore);const groups=list(box.players);const out:NbaGameRoster[]=[];
  for(const raw of groups){const g=record(raw),team=record(g.team);const players:NbaRosterPlayer[]=[];
   for(const statRaw of list(g.statistics)){const stat=record(statRaw);for(const rowRaw of list(stat.athletes)){const row=record(rowRaw),ath=record(row.athlete);const id=text(ath.id);if(!id)continue;const pos=record(ath.position);players.push({playerId:id,playerName:text(ath.displayName??ath.fullName)||"Player",position:text(pos.abbreviation??pos.name),starter:Boolean(row.starter),active:row.didNotPlay!==true,headshot:text(record(ath.headshot).href)||nbaHeadshot(id)});}}
   const dedup=[...new Map(players.map(x=>[x.playerId,x])).values()].sort((a,b)=>Number(b.starter)-Number(a.starter)||a.playerName.localeCompare(b.playerName));
   out.push({teamId:text(team.id),teamName:text(team.displayName??team.name)||"NBA Team",teamAbbr:text(team.abbreviation),teamLogo:text(team.logo),players:dedup});
  }return out;
 }catch{return []}
}
