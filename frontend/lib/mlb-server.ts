import batterHistory from "@/data/mlb_performance_history.json";
import pitcherHistory from "@/data/mlb_pitcher_performance_history.json";
import type { MlbGame, RankingRow } from "./mlb";

const MLB_SCHEDULE = "https://statsapi.mlb.com/api/v1/schedule";
const MLB_FEED = "https://statsapi.mlb.com/api/v1.1/game";
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

function dayQuality(day:any, pitcher=false) {
  let settled=0,total=0; for(const rows of Object.values(day?.categories||{}) as any[]){if(!Array.isArray(rows))continue;total+=rows.length;for(const r of rows){if(pitcher?(r?.finalized===true&&typeof r?.absolute_error==="number"):typeof r?.correct==="boolean")settled++;}}
  return [settled,total,String(day?.captured_at||"")] as const;
}
function betterDay(a:any,b:any,pitcher=false){if(!a)return b;if(!b)return a;const qa=dayQuality(a,pitcher),qb=dayQuality(b,pitcher);return qb[0]>qa[0]||qb[0]===qa[0]&&qb[1]>qa[1]||qb[0]===qa[0]&&qb[1]===qa[1]&&qb[2]>qa[2]?b:a}
function mergeHistory(stored:any,local:any,pitcher=false){const out:any={schema_version:Math.max(Number(stored?.schema_version||1),Number(local?.schema_version||1)),days:{}};const keys=new Set([...Object.keys(local?.days||{}),...Object.keys(stored?.days||{})]);for(const k of keys)out.days[k]=betterDay(local?.days?.[k],stored?.days?.[k],pitcher);return out}
function rowGamePk(r:any){return String(r?.game_pk||r?.gamePk||r?.game_id||"")}
function rowPlayerId(r:any,pitcher=false){return String(pitcher?(r?.pitcher_id||r?.player_id||""):(r?.player_id||r?.batter_id||""))}
async function getBoxscore(gamePk:string){if(!gamePk)return null;try{const r=await fetch(`${MLB_API}/game/${gamePk}/boxscore`,{next:{revalidate:30}});return r.ok?await r.json():null}catch{return null}}
function playerStats(box:any,id:string,sideStat:"batting"|"pitching"){for(const side of ["away","home"]){const p=box?.teams?.[side]?.players?.[`ID${id}`];if(p?.stats?.[sideStat])return p.stats[sideStat]}return null}
async function finalStatusMap(gamePks:string[]){
  const map=new Map<string,boolean>();
  await Promise.all(gamePks.map(async g=>{
    try{
      const sched=await fetch(`${MLB_API}/schedule?sportId=1&gamePk=${encodeURIComponent(g)}`,{next:{revalidate:30}}).then(x=>x.ok?x.json():null);
      const status=String(sched?.dates?.[0]?.games?.[0]?.status?.abstractGameState||sched?.dates?.[0]?.games?.[0]?.status?.detailedState||"");
      map.set(g,/final|game over|completed/i.test(status));
    }catch{map.set(g,false)}
  }));
  return map;
}
async function refreshBatterHistory(history:any){
  const copy=structuredClone(history||{days:{}}),need=new Set<string>();
  for(const day of Object.values(copy.days||{}) as any[]) for(const rows of Object.values(day?.categories||{}) as any[]) for(const r of Array.isArray(rows)?rows:[]) if(typeof r?.correct!=="boolean"&&rowGamePk(r)) need.add(rowGamePk(r));
  const ids=[...need],boxes=new Map<string,any>(),finals=await finalStatusMap(ids);
  await Promise.all(ids.map(async g=>{if(finals.get(g))boxes.set(g,await getBoxscore(g))}));
  const thresholds:any={home_runs:1,hits:1,total_bases:2,runs:1,rbis:1,walks:1,stolen_bases:1,hits_runs_rbis:2};
  for(const day of Object.values(copy.days||{}) as any[]) for(const [cat,rows] of Object.entries(day?.categories||{}) as any[]){
    if(!Array.isArray(rows)||!(cat in thresholds))continue;
    for(const r of rows){
      if(typeof r?.correct==="boolean")continue;
      const gamePk=rowGamePk(r); if(!finals.get(gamePk))continue;
      const stat=playerStats(boxes.get(gamePk),rowPlayerId(r,false),"batting"); if(!stat)continue;
      const actual:any={home_runs:Number(stat.homeRuns||0),hits:Number(stat.hits||0),total_bases:Number(stat.totalBases||0),runs:Number(stat.runs||0),rbis:Number(stat.rbi||0),walks:Number(stat.baseOnBalls||0),stolen_bases:Number(stat.stolenBases||0)};
      actual.hits_runs_rbis=actual.hits+actual.runs+actual.rbis;
      r.correct=actual[cat]>=thresholds[cat]; r.game_finished=true; r.actual=actual[cat]; r.result_label=r.correct?"Hit":"Miss";
    }
  }
  return copy;
}
async function refreshPitcherHistory(history:any){
  const copy=structuredClone(history||{days:{}}),need=new Set<string>();
  for(const day of Object.values(copy.days||{}) as any[]) for(const rows of Object.values(day?.categories||{}) as any[]) for(const r of Array.isArray(rows)?rows:[]) if(!(r?.finalized===true&&typeof r?.absolute_error==="number")&&rowGamePk(r)) need.add(rowGamePk(r));
  const ids=[...need],boxes=new Map<string,any>(),finals=await finalStatusMap(ids);
  await Promise.all(ids.map(async g=>{if(finals.get(g))boxes.set(g,await getBoxscore(g))}));
  const fields:any={strikeouts:"strikeOuts",outs_recorded:"outs",hits_allowed:"hits",walks_allowed:"baseOnBalls",earned_runs:"earnedRuns"};
  for(const day of Object.values(copy.days||{}) as any[]) for(const [cat,rows] of Object.entries(day?.categories||{}) as any[]){
    if(!Array.isArray(rows)||!(cat in fields))continue;
    for(const r of rows){
      if(r?.finalized===true&&typeof r?.absolute_error==="number")continue;
      const gamePk=rowGamePk(r); if(!finals.get(gamePk))continue;
      const stat=playerStats(boxes.get(gamePk),rowPlayerId(r,true),"pitching"); if(!stat)continue;
      const actual=Number(stat[fields[cat]]||0),proj=Number(r?.projection??r?.[`projected_${cat}`]??0);
      r.actual=actual; r.absolute_error=Math.abs(actual-proj); r.finalized=true; r.result_label=r.absolute_error<=1?"Within 1":"Outside 1";
    }
  }
  return copy;
}

export async function getPerformance(){
  const [batter,pitcher,emerging]=await Promise.all([getSourceSnapshot("mlb_batter_performance_history"),getSourceSnapshot("mlb_pitcher_performance_history"),getSourceSnapshot("mlb_emerging_power_history")]);
  const mergedBatter=mergeHistory(batter.payload,batterHistory,false),mergedPitcher=mergeHistory(pitcher.payload,pitcherHistory,true);
  const [batterRefreshed,pitcherRefreshed]=await Promise.all([refreshBatterHistory(mergedBatter),refreshPitcherHistory(mergedPitcher)]);
  return{connected:batter.connected||pitcher.connected||emerging.connected,batter:batterRefreshed,pitcher:pitcherRefreshed,emerging:emerging.payload||{},errors:[batter.error,pitcher.error,emerging.error].filter(Boolean)};
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
