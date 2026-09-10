import batterHistory from "@/data/mlb_performance_history.json";
import pitcherHistory from "@/data/mlb_pitcher_performance_history.json";
import type { MlbGame, RankingRow } from "./mlb";

const MLB_SCHEDULE = "https://statsapi.mlb.com/api/v1/schedule";
const MLB_FEED = "https://statsapi.mlb.com/api/v1.1/game";
const MLB_API = "https://statsapi.mlb.com/api/v1";
const TORONTO = "America/Toronto";

function safe(obj: unknown, path: string[], fallback: unknown = null): any {
  let current: any = obj;
  for (const key of path) {
    if (!current || typeof current !== "object") return fallback;
    current = current[key];
    if (current === undefined || current === null) return fallback;
  }
  return current;
}

function torontoDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TORONTO, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function statusGroup(abstractState: string, detailed: string) {
  const a = abstractState.toLowerCase();
  const d = detailed.toLowerCase();
  if (a === "final") return "final" as const;
  if (/(delay|postpon|suspend|warmup)/.test(d)) return "preview" as const;
  if (a === "live") return "live" as const;
  if (a === "preview" || /(scheduled|pre-game|pregame)/.test(d)) return "preview" as const;
  return "other" as const;
}

export async function getSchedule(date?: string): Promise<{ games: MlbGame[]; fetchedAt: string; date: string; lineupsConfirmed: number }> {
  const requestedDate = date || torontoDate();
  const url = new URL(MLB_SCHEDULE);
  url.searchParams.set("sportId", "1");
  url.searchParams.set("date", requestedDate);
  url.searchParams.set("hydrate", "team,probablePitcher,venue,linescore");
  const response = await fetch(url, { next: { revalidate: 30 } });
  if (!response.ok) throw new Error(`MLB schedule returned ${response.status}`);
  const payload = await response.json();
  const rawGames = payload?.dates?.flatMap((d: any) => d.games || []) || [];
  const games: MlbGame[] = rawGames.map((game: any) => {
    const detailed = String(safe(game, ["status", "detailedState"], "Scheduled"));
    const abstractState = String(safe(game, ["status", "abstractGameState"], "Preview"));
    const group = statusGroup(abstractState, detailed);
    const delayed = /(delay|postpon|suspend)/i.test(detailed);
    const gameDate = String(game.gameDate || "");
    const startTime = gameDate ? new Intl.DateTimeFormat("en-US", { timeZone: TORONTO, hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(gameDate)) : "Time TBA";
    const side = (name: "away" | "home") => ({
      id: safe(game, ["teams", name, "team", "id"], null),
      name: String(safe(game, ["teams", name, "team", "name"], name)),
      score: safe(game, ["teams", name, "score"], null),
      probablePitcher: String(safe(game, ["teams", name, "probablePitcher", "fullName"], "Not announced")),
    });
    return {
      gamePk: Number(game.gamePk), gameDate, startTime,
      status: detailed, statusCode: String(safe(game, ["status", "codedGameState"], "")),
      statusGroup: group, isDelayed: delayed, isLive: group === "live", isFinal: group === "final",
      venue: String(safe(game, ["venue", "name"], "Venue TBA")), away: side("away"), home: side("home"),
    };
  });
  let lineupsConfirmed = 0;
  try {
    const feeds = await Promise.all(games.map(async g => {
      try { return await getGameFeed(String(g.gamePk)); } catch { return null; }
    }));
    lineupsConfirmed = feeds.reduce((n, f) => {
      const awayCount = Array.isArray(f?.away?.lineup) ? f.away.lineup.length : 0;
      const homeCount = Array.isArray(f?.home?.lineup) ? f.home.lineup.length : 0;
      return n + (awayCount >= 9 ? 1 : 0) + (homeCount >= 9 ? 1 : 0);
    }, 0);
  } catch {}
  return { games, fetchedAt: new Date().toISOString(), date: requestedDate, lineupsConfirmed };
}

function supabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  return { url: url.replace(/\/$/, ""), key };
}

async function supabaseRows(path: string) {
  const { url, key } = supabaseConfig();
  if (!url || !key) return { rows: [] as any[], connected: false, error: "Supabase environment variables are missing from the Next.js Railway service." };
  try {
    const res = await fetch(`${url}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" }, cache: "no-store" });
    if (!res.ok) return { rows: [], connected: false, error: `Supabase returned ${res.status}` };
    return { rows: await res.json(), connected: true, error: "" };
  } catch (error) {
    return { rows: [], connected: false, error: error instanceof Error ? error.message : "Supabase request failed" };
  }
}

export async function getSourceSnapshot(sourceName: string) {
  const result = await supabaseRows(`source_snapshots?select=id,source_name,game_date,payload,created_at&source_name=eq.${encodeURIComponent(sourceName)}&order=created_at.desc&limit=1`);
  const row = result.rows?.[0] || null;
  return { connected: result.connected, error: result.error, row, payload: row?.payload || {} };
}

function rowsFrom(payload: any, key: string): RankingRow[] {
  const value = payload?.[key];
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.rankings)) return value.rankings;
  return [];
}

export async function getRankings() {
  const [batters, pitchers] = await Promise.all([
    getSourceSnapshot("mlb_game_intelligence"),
    getSourceSnapshot("mlb_pitcher_intelligence"),
  ]);
  const batter: Record<string, RankingRow[]> = {};
  for (const key of ["home_runs","hits","total_bases","runs","rbis","walks","stolen_bases","hits_runs_rbis"]) batter[key] = rowsFrom(batters.payload, key);
  const pitcherRoot = pitchers.payload?.rankings || pitchers.payload || {};
  const pitcher: Record<string, RankingRow[]> = {};
  for (const key of ["strikeouts","outs_recorded","hits_allowed","walks_allowed","earned_runs"]) pitcher[key] = rowsFrom(pitcherRoot, key);
  return {
    batter, pitcher,
    connected: batters.connected || pitchers.connected,
    batterConnected: batters.connected, pitcherConnected: pitchers.connected,
    errors: [batters.error, pitchers.error].filter(Boolean),
    updatedAt: batters.row?.created_at || pitchers.row?.created_at || null,
    dataDate: batters.row?.game_date || pitchers.row?.game_date || null,
  };
}


const BATTER_CATEGORIES = ["home_runs","hits","total_bases","runs","rbis","walks","stolen_bases","hits_runs_rbis"] as const;
const PITCHER_CATEGORIES = ["strikeouts","outs_recorded","hits_allowed","walks_allowed","earned_runs"] as const;

function torontoDay(offsetDays=0){
  const now=new Date(Date.now()+offsetDays*86400000);
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:TORONTO,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now);
  const get=(t:string)=>parts.find(x=>x.type===t)?.value||"";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function historyRowKey(r:any,pitcher=false){
  const person=pitcher?(r?.pitcher_id||r?.player_id||r?.pitcher_name||r?.player_name):(r?.player_id||r?.batter_id||r?.player_name||r?.player);
  const personKey=String(person||"").trim().toLowerCase();
  return pitcher?`${rowGamePk(r)}:${personKey}`:personKey;
}
function rowQuality(r:any,pitcher=false){
  const settled=pitcher?(r?.finalized===true&&r?.actual!=null):(typeof r?.correct==="boolean");
  const actual=pitcher?(r?.actual!=null):Object.keys(r||{}).some(k=>k.startsWith("actual_"))||r?.actual!=null;
  return [settled?1:0,actual?1:0,String(r?.first_seen_at||"")] as const;
}
function canonicalRows(rows:any[],pitcher=false,limit=25){
  const by=new Map<string,any>(),order:string[]=[];
  for(const raw of Array.isArray(rows)?rows:[]){
    if(!raw||typeof raw!=="object")continue;
    const key=historyRowKey(raw,pitcher); if(!key||key.endsWith(":"))continue;
    if(!by.has(key)){by.set(key,{...raw});order.push(key);continue;}
    const a=rowQuality(raw,pitcher),b=rowQuality(by.get(key),pitcher);
    if(a[0]>b[0]||(a[0]===b[0]&&a[1]>b[1])||(a[0]===b[0]&&a[1]===b[1]&&a[2]>b[2]))by.set(key,{...raw});
  }
  return order.slice(0,limit).map(k=>by.get(k));
}
function mergeDay(primary:any,fallback:any,pitcher=false){
  const out:any={captured_at:[String(primary?.captured_at||""),String(fallback?.captured_at||"")].sort().pop()||"",categories:{}};
  const a=primary?.categories||{},b=fallback?.categories||{};
  for(const cat of new Set([...Object.keys(a),...Object.keys(b)])){
    const all=[...(Array.isArray(b[cat])?b[cat]:[]),...(Array.isArray(a[cat])?a[cat]:[])];
    out.categories[cat]=canonicalRows(all,pitcher,cat==="emerging_power"?10:25);
  }
  return out;
}
function mergeHistory(stored:any,local:any,pitcher=false){
  const out:any={schema_version:Math.max(Number(stored?.schema_version||1),Number(local?.schema_version||1)),days:{}};
  const keys=new Set([...Object.keys(local?.days||{}),...Object.keys(stored?.days||{})]);
  for(const k of [...keys].sort()){
    const a=stored?.days?.[k],b=local?.days?.[k];
    out.days[k]=a&&b?mergeDay(a,b,pitcher):(a||b);
  }
  return out;
}
function rowGamePk(r:any){return String(r?.game_pk||r?.gamePk||r?.game_id||"")}
function rowPlayerId(r:any,pitcher=false){return String(pitcher?(r?.pitcher_id||r?.player_id||""):(r?.player_id||r?.batter_id||""))}
async function getBoxscore(gamePk:string){if(!gamePk)return null;try{const r=await fetch(`${MLB_API}/game/${gamePk}/boxscore`,{next:{revalidate:30}});return r.ok?await r.json():null}catch{return null}}
function playerStats(box:any,id:string,sideStat:"batting"|"pitching"){for(const side of ["away","home"]){const p=box?.teams?.[side]?.players?.[`ID${id}`];if(p?.stats?.[sideStat])return p.stats[sideStat]}return null}
async function finalStatusMap(gamePks:string[]){
  const map=new Map<string,boolean>();
  await Promise.all(gamePks.map(async g=>{try{const sched=await fetch(`${MLB_API}/schedule?sportId=1&gamePk=${encodeURIComponent(g)}`,{next:{revalidate:30}}).then(x=>x.ok?x.json():null);const status=String(sched?.dates?.[0]?.games?.[0]?.status?.abstractGameState||sched?.dates?.[0]?.games?.[0]?.status?.detailedState||"");map.set(g,/final|game over|completed/i.test(status))}catch{map.set(g,false)}}));
  return map;
}
function freezeBatter(row:any,category:string,index:number){return{...row,category,rank:Number(row?.rank||index+1),player_id:row?.player_id,player_name:row?.player_name||row?.player,game_pk:row?.game_pk||row?.gamePk||row?.game_id,gi_score:Number(row?.gi_score||row?.score||0),first_seen_at:new Date().toISOString(),correct:typeof row?.correct==="boolean"?row.correct:null}}
function freezePitcher(row:any,category:string,index:number){return{...row,category,rank:Number(row?.rank||index+1),pitcher_id:row?.pitcher_id||row?.player_id,pitcher_name:row?.pitcher_name||row?.player_name,game_pk:row?.game_pk||row?.gamePk||row?.game_id,projection:Number(row?.projection||0),first_seen_at:new Date().toISOString(),finalized:row?.finalized===true}}
function ensureTodayHistory(history:any,rankings:Record<string,RankingRow[]>,pitcher=false){
  const out=structuredClone(history||{schema_version:1,days:{}});out.days=out.days||{};const day=torontoDay();out.days[day]=out.days[day]||{captured_at:new Date().toISOString(),categories:{}};out.days[day].categories=out.days[day].categories||{};
  for(const cat of (pitcher?PITCHER_CATEGORIES:BATTER_CATEGORIES)){
    const existing=canonicalRows(out.days[day].categories[cat]||[],pitcher,25);const source=Array.isArray(rankings?.[cat])?rankings[cat]:[];
    const seen=new Set(existing.map((r:any)=>historyRowKey(r,pitcher)));const filled=[...existing];
    for(let i=0;i<source.length&&filled.length<25;i++){const row=pitcher?freezePitcher(source[i],cat,i):freezeBatter(source[i],cat,i);const key=historyRowKey(row,pitcher);if(key&&!seen.has(key)){filled.push(row);seen.add(key)}}
    out.days[day].categories[cat]=filled.slice(0,25);
  }
  return out;
}
function numAny(v:any){const n=Number(v);return Number.isFinite(n)?n:0}
function buildEmergingCandidates(raw:any[]){
  const candidates=(Array.isArray(raw)?raw:[]).filter((r:any)=>{
    const rank=numAny(r?.rank||r?.hr_rank),season=r?.season_stats||{};const hr=numAny(r?.season_home_runs||season?.home_runs||season?.homeRuns);const pa=numAny(r?.season_plate_appearances||season?.plate_appearances||season?.plateAppearances||season?.pa);const gi=numAny(r?.gi_score||r?.score);const prob=numAny(r?.home_run_probability||r?.hr_probability||r?.probability);const stat=r?.statcast||{};const barrel=numAny(stat?.barrel_rate),hard=numAny(stat?.hard_hit_rate);return !(rank>=1&&rank<=25)&&hr<=18&&(hr<=15||(pa>0&&pa<=325))&&(gi>=52||prob>=10||barrel>=9||hard>=42||Array.isArray(r?.why)&&r.why.length>0)
  }).map((r:any)=>({...r,season_home_runs:numAny(r?.season_home_runs||r?.season_stats?.home_runs||r?.season_stats?.homeRuns)}));
  candidates.sort((a:any,b:any)=>numAny(b?.gi_score||b?.score)-numAny(a?.gi_score||a?.score));return candidates.slice(0,10);
}
function ensureEmergingToday(history:any,rawHomeRuns:any[]){
  const out=structuredClone(history&&typeof history==="object"?history:{schema_version:1,days:{}});out.days=out.days||{};const day=torontoDay();out.days[day]=out.days[day]||{captured_at:new Date().toISOString(),categories:{}};out.days[day].categories=out.days[day].categories||{};let rows=canonicalRows(out.days[day].categories.emerging_power||[],false,10);if(rows.length<10){const seen=new Set(rows.map((r:any)=>historyRowKey(r,false)));for(const r of buildEmergingCandidates(rawHomeRuns)){const x={...freezeBatter(r,"home_runs",rows.length),tracking_source:"emerging_power",emerging_rank:rows.length+1};const k=historyRowKey(x,false);if(k&&!seen.has(k)){rows.push(x);seen.add(k)}if(rows.length>=10)break}}out.days[day].categories.emerging_power=rows;return out;
}
async function refreshBatterHistory(history:any){
  const copy=structuredClone(history||{days:{}}),targetDays=new Set([torontoDay(),torontoDay(-1)]),need=new Set<string>();
  for(const [dk,day] of Object.entries(copy.days||{}) as any[])if(targetDays.has(dk))for(const rows of Object.values(day?.categories||{}) as any[])for(const r of Array.isArray(rows)?rows:[])if(rowGamePk(r))need.add(rowGamePk(r));
  const ids=[...need],boxes=new Map<string,any>(),finals=await finalStatusMap(ids);await Promise.all(ids.map(async g=>{if(finals.get(g))boxes.set(g,await getBoxscore(g))}));
  const thresholds:any={home_runs:1,hits:1,total_bases:2,runs:1,rbis:1,walks:1,stolen_bases:1,hits_runs_rbis:2,emerging_power:1};
  for(const [dk,day] of Object.entries(copy.days||{}) as any[])if(targetDays.has(dk))for(const [cat,rows] of Object.entries(day?.categories||{}) as any[]){if(!Array.isArray(rows)||!(cat in thresholds))continue;for(const r of rows){const gamePk=rowGamePk(r);if(!finals.get(gamePk))continue;const stat=playerStats(boxes.get(gamePk),rowPlayerId(r,false),"batting");if(!stat)continue;const actual:any={home_runs:numAny(stat.homeRuns),hits:numAny(stat.hits),total_bases:numAny(stat.totalBases),runs:numAny(stat.runs),rbis:numAny(stat.rbi),walks:numAny(stat.baseOnBalls),stolen_bases:numAny(stat.stolenBases)};actual.hits_runs_rbis=actual.hits+actual.runs+actual.rbis;const key=cat==="emerging_power"?"home_runs":cat;r.correct=actual[key]>=thresholds[cat];r.game_finished=true;r.actual=actual[key];r.actual_home_runs=actual.home_runs;r.result_label=r.correct?"✅ Hit":"❌ Miss"}}
  return copy;
}
async function refreshPitcherHistory(history:any){
  const copy=structuredClone(history||{days:{}}),targetDays=new Set([torontoDay(),torontoDay(-1)]),need=new Set<string>();for(const [dk,day] of Object.entries(copy.days||{}) as any[])if(targetDays.has(dk))for(const rows of Object.values(day?.categories||{}) as any[])for(const r of Array.isArray(rows)?rows:[])if(rowGamePk(r))need.add(rowGamePk(r));const ids=[...need],boxes=new Map<string,any>(),finals=await finalStatusMap(ids);await Promise.all(ids.map(async g=>{if(finals.get(g))boxes.set(g,await getBoxscore(g))}));const fields:any={strikeouts:"strikeOuts",outs_recorded:"outs",hits_allowed:"hits",walks_allowed:"baseOnBalls",earned_runs:"earnedRuns"};for(const [dk,day] of Object.entries(copy.days||{}) as any[])if(targetDays.has(dk))for(const [cat,rows] of Object.entries(day?.categories||{}) as any[]){if(!Array.isArray(rows)||!(cat in fields))continue;for(const r of rows){const gamePk=rowGamePk(r);if(!finals.get(gamePk))continue;const stat=playerStats(boxes.get(gamePk),rowPlayerId(r,true),"pitching");if(!stat)continue;const actual=numAny(stat[fields[cat]]),proj=numAny(r?.projection??r?.[`projected_${cat}`]);r.actual=actual;r.absolute_error=Math.abs(actual-proj);r.finalized=true;r.result_label=r.absolute_error<=1?"Within 1":"Outside 1"}}return copy;
}


function isStatcastBarrel(exitVelocity:number, launchAngle:number|null){
  if(!Number.isFinite(exitVelocity)||exitVelocity<98||launchAngle==null||!Number.isFinite(launchAngle)) return false;
  const mphOver98=Math.min(exitVelocity-98,18);
  const minAngle=Math.max(8,26-mphOver98);
  const maxAngle=Math.min(50,30+(2*mphOver98));
  return launchAngle>=minAngle&&launchAngle<=maxAngle;
}
function contactByPlayer(feed:any){
  const out=new Map<number,any>();
  for(const play of feed?.liveData?.plays?.allPlays||[]){
    const batterId=Number(play?.matchup?.batter?.id||0); if(!batterId) continue;
    for(const ev of play?.playEvents||[]){
      const hd=ev?.hitData||{}; const velo=Number(hd?.launchSpeed); if(!Number.isFinite(velo)) continue;
      const angle=hd?.launchAngle==null?null:Number(hd.launchAngle); const hard=velo>=95; const barrel=isStatcastBarrel(velo,angle);
      if(!hard&&!barrel) continue;
      const row=out.get(batterId)||{hard_hit_count:0,barrel_count:0,best_exit_velocity:0,best_launch_angle:null};
      row.hard_hit_count+=1; if(barrel) row.barrel_count+=1;
      if(velo>Number(row.best_exit_velocity||0)){row.best_exit_velocity=Math.round(velo*10)/10;row.best_launch_angle=angle==null?null:Math.round(angle*10)/10;}
      out.set(batterId,row);
    }
  }
  return out;
}
function battingHomeRuns(feed:any,playerId:number){
  for(const side of ["away","home"]){const p=feed?.liveData?.boxscore?.teams?.[side]?.players?.[`ID${playerId}`]; if(p?.stats?.batting) return Number(p.stats.batting.homeRuns||0)}
  return 0;
}
function playerFullName(feed:any,playerId:number){return String(feed?.gameData?.players?.[`ID${playerId}`]?.fullName||`MLB Player ${playerId}`)}
function shortTeam(name:string){const map:any={"Arizona Diamondbacks":"ARI","Atlanta Braves":"ATL","Baltimore Orioles":"BAL","Boston Red Sox":"BOS","Chicago Cubs":"CHC","Chicago White Sox":"CWS","Cincinnati Reds":"CIN","Cleveland Guardians":"CLE","Colorado Rockies":"COL","Detroit Tigers":"DET","Houston Astros":"HOU","Kansas City Royals":"KC","Los Angeles Angels":"LAA","Los Angeles Dodgers":"LAD","Miami Marlins":"MIA","Milwaukee Brewers":"MIL","Minnesota Twins":"MIN","New York Mets":"NYM","New York Yankees":"NYY","Athletics":"ATH","Philadelphia Phillies":"PHI","Pittsburgh Pirates":"PIT","San Diego Padres":"SD","San Francisco Giants":"SF","Seattle Mariners":"SEA","St. Louis Cardinals":"STL","Tampa Bay Rays":"TB","Texas Rangers":"TEX","Toronto Blue Jays":"TOR","Washington Nationals":"WSH"};return map[name]||name}
async function getHrScheduleLite(date:string){
  const u=new URL(MLB_SCHEDULE);u.searchParams.set("sportId","1");u.searchParams.set("date",date);u.searchParams.set("hydrate","team,venue");
  const r=await fetch(u,{next:{revalidate:date===torontoDay()?20:300}});if(!r.ok)return[];const p=await r.json();
  return (p?.dates?.flatMap((d:any)=>d.games||[])||[]).map((g:any)=>{const detailed=String(g?.status?.detailedState||"Scheduled"),abstract=String(g?.status?.abstractGameState||"Preview"),group=statusGroup(abstract,detailed);return{gamePk:Number(g.gamePk),isLive:group==="live",isFinal:group==="final",away:{name:String(g?.teams?.away?.team?.name||"Away")},home:{name:String(g?.teams?.home?.team?.name||"Home")}}});
}
async function getHrContactIntelligence(homeRunRankings:any[]){
  const rankMap=new Map<number,number>(); for(const r of homeRunRankings||[]){const id=Number(r?.player_id||r?.batter_id||0);const rank=Number(r?.rank||0);if(id&&rank)rankMap.set(id,rank)}
  const liveSchedule=await getHrScheduleLite(torontoDay()); const live=liveSchedule.filter((g:any)=>g.isLive); const liveSignals:any[]=[];
  await Promise.all(live.map(async g=>{try{const feedRes=await fetch(`${MLB_FEED}/${g.gamePk}/feed/live`,{next:{revalidate:20}});if(!feedRes.ok)return;const feed=await feedRes.json();const contacts=contactByPlayer(feed);for(const [playerId,c] of contacts){if(battingHomeRuns(feed,playerId)>=1)continue;liveSignals.push({player_id:playerId,player_name:playerFullName(feed,playerId),away_team_name:g.away.name,home_team_name:g.home.name,hr_rank:rankMap.get(playerId)||null,...c})}}catch{}}));
  liveSignals.sort((a,b)=>(b.barrel_count-a.barrel_count)||(b.best_exit_velocity-a.best_exit_velocity));
  const yDate=torontoDay(-1),ys=await getHrScheduleLite(yDate),yFinal=ys.filter((g:any)=>g.isFinal),ySignals:any[]=[];
  await Promise.all(yFinal.map(async g=>{try{const feedRes=await fetch(`${MLB_FEED}/${g.gamePk}/feed/live`,{next:{revalidate:300}});if(!feedRes.ok)return;const feed=await feedRes.json();const contacts=contactByPlayer(feed);for(const [playerId,c] of contacts){if(battingHomeRuns(feed,playerId)>0)continue;const ang=c.best_launch_angle==null?null:Number(c.best_launch_angle);const shaped=Number(c.best_exit_velocity||0)>=100&&ang!=null&&ang>=15&&ang<=40;if(Number(c.barrel_count||0)===0&&!shaped)continue;ySignals.push({player_id:playerId,player_name:playerFullName(feed,playerId),away_team_name:g.away.name,home_team_name:g.home.name,hr_rank:rankMap.get(playerId)||null,...c})}}catch{}}));
  ySignals.sort((a,b)=>(b.barrel_count-a.barrel_count)||(b.best_exit_velocity-a.best_exit_velocity));
  return {live:liveSignals,yesterdayWatch:ySignals};
}
function emergingExplanation(r:any){
  const hr=numAny(r?.season_home_runs||r?.season_stats?.home_runs||r?.season_stats?.homeRuns);const pa=numAny(r?.season_plate_appearances||r?.season_stats?.plate_appearances||r?.season_stats?.plateAppearances||r?.season_stats?.pa);const gi=numAny(r?.gi_score||r?.score);const prob=numAny(r?.home_run_probability||r?.hr_probability||r?.probability);
  const profile=r?.current_year_debut?"Current-year rookie/debut":r?.limited_sample?"Developing/limited MLB sample":hr<=10?"Low-HR overlooked bat":"Under-the-radar power profile";
  let text=`${profile}: ${hr} season HR, GI ${gi.toFixed(1)}${pa?` across ${pa} PA`:""}. Surfaced because current matchup/contact evidence is stronger than the season-HR total alone suggests.`;
  if(prob) text+=` Today’s model assigns ${Math.round(prob)}% HR probability, so the signal comes from matchup/contact inputs rather than a 'due' assumption.`;
  return text;
}

export async function getPerformance(){
  const [batter,pitcher,emerging,rankingData]=await Promise.all([getSourceSnapshot("mlb_batter_performance_history"),getSourceSnapshot("mlb_pitcher_performance_history"),getSourceSnapshot("mlb_emerging_power_history"),getRankings()]);
  let mergedBatter=mergeHistory(batter.payload,batterHistory,false),mergedPitcher=mergeHistory(pitcher.payload,pitcherHistory,true);mergedBatter=ensureTodayHistory(mergedBatter,rankingData.batter,false);mergedPitcher=ensureTodayHistory(mergedPitcher,rankingData.pitcher,true);let emergingHistory=ensureEmergingToday(emerging.payload||{},rankingData.batter?.home_runs||[]);
  const [batterRefreshed,pitcherRefreshed,emergingRefreshed]=await Promise.all([refreshBatterHistory(mergedBatter),refreshPitcherHistory(mergedPitcher),refreshBatterHistory(emergingHistory)]);
  const yesterday=torontoDay(-1);const today=torontoDay();
  const contact=await getHrContactIntelligence(rankingData.batter?.home_runs||[]);
  const emergingToday=(emergingRefreshed?.days?.[today]?.categories?.emerging_power||[]).slice(0,10).map((r:any)=>({...r,explanation:emergingExplanation(r)}));
  return{connected:batter.connected||pitcher.connected||emerging.connected,batter:batterRefreshed,pitcher:pitcherRefreshed,emerging:emergingRefreshed,hrIntelligence:{live:contact.live,yesterdayWatch:contact.yesterdayWatch,yesterday:(batterRefreshed?.days?.[yesterday]?.categories?.home_runs||[]).slice(0,25),emergingToday},errors:[batter.error,pitcher.error,emerging.error].filter(Boolean)};
}

export async function getGameFeed(gamePk: string) {
  const response = await fetch(`${MLB_FEED}/${encodeURIComponent(gamePk)}/feed/live`, { next: { revalidate: 20 } });
  if (!response.ok) throw new Error(`MLB live feed returned ${response.status}`);
  const feed = await response.json();
  const status = String(safe(feed, ["gameData", "status", "detailedState"], "Scheduled"));
  const abstractState = String(safe(feed, ["gameData", "status", "abstractGameState"], "Preview"));
  const group = statusGroup(abstractState, status);
  const teams = safe(feed, ["gameData", "teams"], {});
  const probable = safe(feed, ["gameData", "probablePitchers"], {});
  const boxTeams = safe(feed, ["liveData", "boxscore", "teams"], {});
  const players = safe(feed, ["gameData", "players"], {});
  const lineup = (side: "away" | "home") => {
    const box = boxTeams?.[side] || {};
    let order: number[] = Array.isArray(box.battingOrder) ? box.battingOrder : [];
    if (order.length < 9) {
      order = Object.values(box.players || {}).map((p: any) => ({ id: p?.person?.id, order: Number(p?.battingOrder || 0) }))
        .filter((p: any) => p.id && p.order >= 100 && p.order <= 900 && p.order % 100 === 0)
        .sort((a: any,b: any) => a.order-b.order).map((p: any) => p.id).slice(0,9);
    }
    return order.map((id, i) => {
      const detail = players?.[`ID${id}`] || {};
      const boxPlayer = box?.players?.[`ID${id}`] || {};
      return { playerId: id, name: boxPlayer?.person?.fullName || detail?.fullName || `MLB Player ${id}`, position: boxPlayer?.position?.abbreviation || detail?.primaryPosition?.abbreviation || "", battingOrder: i + 1 };
    });
  };
  const side = (name: "away" | "home") => ({
    id: Number(teams?.[name]?.id || 0), name: String(teams?.[name]?.name || name),
    pitcher: String(probable?.[name]?.fullName || "Not announced"),
    score: safe(feed, ["liveData", "linescore", "teams", name, "runs"], null), lineup: lineup(name),
  });
  return {
    gamePk: Number(gamePk), status, statusGroup: group, isDelayed: /(delay|postpon|suspend)/i.test(status),
    venue: String(safe(feed, ["gameData", "venue", "name"], "Venue TBA")), away: side("away"), home: side("home"),
    lineupsConfirmed: lineup("away").length >= 9 && lineup("home").length >= 9,
  };
}

export async function getPlayer(playerId: string) {
  const infoRes = await fetch(`https://statsapi.mlb.com/api/v1/people/${encodeURIComponent(playerId)}?hydrate=currentTeam`, { next: { revalidate: 3600 } });
  const infoPayload = infoRes.ok ? await infoRes.json() : {};
  const person = infoPayload?.people?.[0] || {};
  const statsRes = await fetch(`https://statsapi.mlb.com/api/v1/people/${encodeURIComponent(playerId)}/stats?stats=gameLog,season&group=hitting,pitching&season=2026`, { next: { revalidate: 300 } });
  const statsPayload = statsRes.ok ? await statsRes.json() : {};
  return { person, stats: statsPayload?.stats || [] };
}

export function connectionStatus() {
  const { url, key } = supabaseConfig();
  return { supabaseConfigured: Boolean(url && key), mlbStatsConfigured: true };
}
