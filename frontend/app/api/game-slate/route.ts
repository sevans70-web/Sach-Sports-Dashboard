import { NextRequest, NextResponse } from "next/server";
import { loadNbaOverview } from "@/lib/nba";
import { loadWnbaOverview } from "@/lib/wnba";
import { loadNhlOverview } from "@/lib/nhl";
import { loadCbbOverview } from "@/lib/cbb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type SportKey = "mlb" | "nfl" | "cfb" | "nba" | "wnba" | "nhl" | "soccer" | "cbb";

type Game = {
  id: string;
  date: string;
  awayTeam: string;
  awayAbbr: string;
  awayLogo?: string | null;
  awayScore?: number | string | null;
  awayRecord?: string;
  homeTeam: string;
  homeAbbr: string;
  homeLogo?: string | null;
  homeScore?: number | string | null;
  homeRecord?: string;
  state: "pre" | "in" | "post";
  status: string;
  venue?: string;
  weekNumber?: number | null;
};

const TORONTO = "America/Toronto";

const MLB_ABBR: Record<string, string> = {
  "Arizona Diamondbacks":"ARI","Atlanta Braves":"ATL","Baltimore Orioles":"BAL","Boston Red Sox":"BOS",
  "Chicago Cubs":"CHC","Chicago White Sox":"CWS","Cincinnati Reds":"CIN","Cleveland Guardians":"CLE",
  "Colorado Rockies":"COL","Detroit Tigers":"DET","Houston Astros":"HOU","Kansas City Royals":"KC",
  "Los Angeles Angels":"LAA","Los Angeles Dodgers":"LAD","Miami Marlins":"MIA","Milwaukee Brewers":"MIL",
  "Minnesota Twins":"MIN","New York Mets":"NYM","New York Yankees":"NYY","Athletics":"ATH",
  "Philadelphia Phillies":"PHI","Pittsburgh Pirates":"PIT","San Diego Padres":"SD","San Francisco Giants":"SF",
  "Seattle Mariners":"SEA","St. Louis Cardinals":"STL","Tampa Bay Rays":"TB","Texas Rangers":"TEX",
  "Toronto Blue Jays":"TOR","Washington Nationals":"WSH"
};

function localDay(value: string | Date) {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: TORONTO,
    year:"numeric",
    month:"2-digit",
    day:"2-digit",
  }).formatToParts(d);
  const get = (t:string) => p.find(x => x.type === t)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function compactDay(d:Date) {
  return d.toISOString().slice(0,10).replaceAll("-","");
}

function acronym(name:string) {
  const clean = String(name||"")
    .replace(/\b(FC|AFC|SC|CF|Club|Football|Basketball|Hockey)\b/gi," ")
    .replace(/[^A-Za-z0-9 ]+/g," ")
    .trim();

  if(!clean) return "—";
  const words = clean.split(/\s+/).filter(Boolean);
  return words.length === 1
    ? words[0].slice(0,3).toUpperCase()
    : words.map(w => w[0]).join("").slice(0,4).toUpperCase();
}

function recordText(records:any[]) {
  const r = (records||[]).find((x:any)=>x?.type==="total") || records?.[0];
  return String(r?.summary || r?.displayValue || "");
}

function normalizeClock(value: any) {
  const clock = String(value || "").trim();
  return clock && clock !== "0:00" ? clock : "";
}

function periodLabel(sport: SportKey, period: number) {
  if (!Number.isFinite(period) || period <= 0) return "";

  if (sport === "nfl" || sport === "cfb" || sport === "nba" || sport === "wnba") {
    if (period <= 4) return `Q${period}`;
    return period === 5 ? "OT" : `OT${period - 4}`;
  }

  if (sport === "cbb") {
    if (period === 1) return "1st Half";
    if (period === 2) return "2nd Half";
    return period === 3 ? "OT" : `OT${period - 2}`;
  }

  if (sport === "nhl") {
    if (period <= 3) return `P${period}`;
    return period === 4 ? "OT" : `OT${period - 3}`;
  }

  return "";
}

function explicitLiveStatus(
  sport: SportKey,
  period: any,
  clock: any,
  fallback: any
) {
  const number = Number(period);
  const segment = periodLabel(sport, Number.isFinite(number) ? number : 0);
  const displayClock = normalizeClock(clock);

  if (segment && displayClock) return `${segment} · ${displayClock}`;
  if (segment) return segment;
  if (displayClock) return displayClock;

  const cleanFallback = String(fallback || "")
    .replace(/\s+-\s+/g, " · ")
    .trim();

  return cleanFallback || "In Progress";
}

function normalizeNhlStatus(status: string) {
  const value = String(status || "").trim();
  const match = value.match(/^(P\d+|OT\d*)\s+(\d{1,2}:\d{2})$/i);
  if (match) return `${match[1].toUpperCase()} · ${match[2]}`;
  return value;
}

function fromOverview(sport: SportKey, raw:any):Game {
  const s = String(raw?.state || "").toLowerCase();
  const state:Game["state"] =
    s === "in" || s === "live"
      ? "in"
      : s === "post" || s === "final"
        ? "post"
        : "pre";

  let status = String(
    raw?.status ||
    raw?.detail ||
    (state === "in" ? "In Progress" : state === "post" ? "Final" : "Scheduled")
  );

  if (sport === "nhl" && state === "in") {
    status = normalizeNhlStatus(status);
  }

  return {
    id:String(raw?.gameId || raw?.id || ""),
    date:String(raw?.tipoff || raw?.date || ""),
    awayTeam:String(raw?.awayTeam || "Away"),
    awayAbbr:String(raw?.awayAbbr || "").trim() || acronym(raw?.awayTeam || ""),
    awayLogo:raw?.awayLogo || null,
    awayScore:raw?.awayScore ?? null,
    homeTeam:String(raw?.homeTeam || "Home"),
    homeAbbr:String(raw?.homeAbbr || "").trim() || acronym(raw?.homeTeam || ""),
    homeLogo:raw?.homeLogo || null,
    homeScore:raw?.homeScore ?? null,
    state,
    status,
  };
}

async function fetchJson(url:string) {
  const response = await fetch(url, {
    cache:"no-store",
    headers:{
      Accept:"application/json",
      "User-Agent":"Sach-Sports/1.0",
    },
  });

  if(!response.ok) {
    throw new Error(`Provider ${response.status}`);
  }

  return response.json();
}

async function enrichBasketballLiveStatus(
  sport: "nba" | "wnba" | "cbb",
  games: Game[]
) {
  const path =
    sport === "nba"
      ? "basketball/nba"
      : sport === "wnba"
        ? "basketball/wnba"
        : "basketball/mens-college-basketball";

  return Promise.all(
    games.map(async game => {
      if (game.state !== "in" || !game.id) return game;

      try {
        const payload = await fetchJson(
          `https://site.api.espn.com/apis/site/v2/sports/${path}/summary?event=${encodeURIComponent(game.id)}`
        );

        const competition = payload?.header?.competitions?.[0] || {};
        const status = competition?.status || payload?.header?.status || {};
        const type = status?.type || {};

        return {
          ...game,
          status: explicitLiveStatus(
            sport,
            status?.period,
            status?.displayClock,
            type?.shortDetail || type?.description || game.status
          ),
        };
      } catch {
        return game;
      }
    })
  );
}

async function espnFootball(sport:"nfl"|"cfb") {
  const path = sport === "nfl" ? "football/nfl" : "football/college-football";
  const response = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard?limit=300`,
    {
      cache:"no-store",
      headers:{"User-Agent":"Sach-Sports/1.0"},
    }
  );

  if(!response.ok) {
    throw new Error(`${sport} schedule ${response.status}`);
  }

  const payload = await response.json();
  const weekNumber = Number(payload?.week?.number || 0) || null;

  const games:Game[] = (payload?.events || []).map((event:any) => {
    const comp = event?.competitions?.[0] || {};
    const away = (comp?.competitors || []).find((x:any)=>x?.homeAway==="away") || {};
    const home = (comp?.competitors || []).find((x:any)=>x?.homeAway==="home") || {};
    const fullStatus = event?.status || {};
    const type = fullStatus?.type || {};

    const state:Game["state"] =
      String(type?.state || "").toLowerCase() === "in"
        ? "in"
        : type?.completed || String(type?.state || "").toLowerCase() === "post"
          ? "post"
          : "pre";

    const status =
      state === "in"
        ? explicitLiveStatus(
            sport,
            fullStatus?.period,
            fullStatus?.displayClock,
            type?.shortDetail || type?.description
          )
        : state === "post"
          ? "Final"
          : String(type?.shortDetail || type?.description || "Scheduled");

    return {
      id:String(event?.id || ""),
      date:String(event?.date || ""),
      awayTeam:String(away?.team?.displayName || "Away"),
      awayAbbr:String(away?.team?.abbreviation || "").trim() || acronym(away?.team?.displayName || ""),
      awayLogo:away?.team?.logo || null,
      awayScore:state === "pre" ? null : away?.score ?? null,
      awayRecord:recordText(away?.records || []),
      homeTeam:String(home?.team?.displayName || "Home"),
      homeAbbr:String(home?.team?.abbreviation || "").trim() || acronym(home?.team?.displayName || ""),
      homeLogo:home?.team?.logo || null,
      homeScore:state === "pre" ? null : home?.score ?? null,
      homeRecord:recordText(home?.records || []),
      state,
      status,
      venue:String(comp?.venue?.fullName || ""),
      weekNumber:Number(event?.week?.number || weekNumber || 0) || null,
    };
  });

  return {
    games:games.sort((a,b)=>new Date(a.date).getTime()-new Date(b.date).getTime()),
    weekNumber,
  };
}

async function mlbGames() {
  const now = new Date();
  const end = new Date(now.getTime() + 8 * 86400000);

  const response = await fetch(
    `https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=${localDay(now)}&endDate=${localDay(end)}&hydrate=linescore,probablePitcher`,
    {
      cache:"no-store",
      headers:{"User-Agent":"Sach-Sports/1.0"},
    }
  );

  if(!response.ok) throw new Error(`MLB schedule ${response.status}`);

  const payload = await response.json();
  const games:Game[] = [];

  for(const block of payload?.dates || []) {
    for(const raw of block?.games || []) {
      const away = raw?.teams?.away || {};
      const home = raw?.teams?.home || {};
      const awayName = String(away?.team?.name || "Away");
      const homeName = String(home?.team?.name || "Home");
      const abstract = String(raw?.status?.abstractGameState || "").toLowerCase();

      const state:Game["state"] =
        abstract.includes("live")
          ? "in"
          : abstract.includes("final")
            ? "post"
            : "pre";

      let status = String(raw?.status?.detailedState || "");

      if(state === "in") {
        const inning = raw?.linescore?.currentInningOrdinal || "";
        const half = raw?.linescore?.inningState || "";
        status = [half, inning].filter(Boolean).join(" ") || status || "In Progress";
      } else if(state === "post") {
        status = "Final";
      }

      games.push({
        id:String(raw?.gamePk || ""),
        date:String(raw?.gameDate || ""),
        awayTeam:awayName,
        awayAbbr:MLB_ABBR[awayName] || acronym(awayName),
        awayLogo:away?.team?.id ? `https://www.mlbstatic.com/team-logos/${away.team.id}.svg` : null,
        awayScore:state === "pre" ? null : away?.score ?? null,
        awayRecord:away?.leagueRecord ? `${away.leagueRecord.wins}-${away.leagueRecord.losses}` : "",
        homeTeam:homeName,
        homeAbbr:MLB_ABBR[homeName] || acronym(homeName),
        homeLogo:home?.team?.id ? `https://www.mlbstatic.com/team-logos/${home.team.id}.svg` : null,
        homeScore:state === "pre" ? null : home?.score ?? null,
        homeRecord:home?.leagueRecord ? `${home.leagueRecord.wins}-${home.leagueRecord.losses}` : "",
        state,
        status:status || (state === "in" ? "In Progress" : "Scheduled"),
        venue:String(raw?.venue?.name || ""),
      });
    }
  }

  return games.sort((a,b)=>new Date(a.date).getTime()-new Date(b.date).getTime());
}

async function soccerGames(league:string) {
  const now = new Date();
  const dates = Array.from({length:10},(_,i)=>{
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate()-1+i);
    return compactDay(d);
  });

  const payloads = await Promise.all(
    dates.map(date =>
      fetch(
        `https://site.api.espn.com/apis/site/v2/sports/soccer/${encodeURIComponent(league)}/scoreboard?dates=${date}&limit=300`,
        {
          cache:"no-store",
          headers:{"User-Agent":"Sach-Sports/1.0"},
        }
      )
        .then(r => r.ok ? r.json() : {events:[]})
        .catch(() => ({events:[]}))
    )
  );

  const seen = new Set<string>();
  const games:Game[] = [];

  for(const payload of payloads) {
    for(const event of payload?.events || []) {
      const id = String(event?.id || "");
      if(!id || seen.has(id)) continue;
      seen.add(id);

      const comp = event?.competitions?.[0] || {};
      const away = (comp?.competitors || []).find((x:any)=>x?.homeAway==="away") || {};
      const home = (comp?.competitors || []).find((x:any)=>x?.homeAway==="home") || {};
      const fullStatus = event?.status || {};
      const type = fullStatus?.type || {};

      const state:Game["state"] =
        String(type?.state || "").toLowerCase() === "in"
          ? "in"
          : type?.completed || String(type?.state || "").toLowerCase() === "post"
            ? "post"
            : "pre";

      let status = String(
        type?.shortDetail ||
        type?.description ||
        (state === "in" ? "In Progress" : state === "post" ? "Final" : "Scheduled")
      );

      if (state === "in") {
        const displayClock = String(fullStatus?.displayClock || "").trim();
        status = displayClock || status || "In Progress";
      }

      games.push({
        id,
        date:String(event?.date || ""),
        awayTeam:String(away?.team?.displayName || "Away"),
        awayAbbr:String(away?.team?.abbreviation || "").trim() || acronym(away?.team?.displayName || ""),
        awayLogo:away?.team?.logo || null,
        awayScore:state === "pre" ? null : away?.score ?? null,
        homeTeam:String(home?.team?.displayName || "Home"),
        homeAbbr:String(home?.team?.abbreviation || "").trim() || acronym(home?.team?.displayName || ""),
        homeLogo:home?.team?.logo || null,
        homeScore:state === "pre" ? null : home?.score ?? null,
        state,
        status,
        venue:String(comp?.venue?.fullName || ""),
      });
    }
  }

  return games.sort((a,b)=>new Date(a.date).getTime()-new Date(b.date).getTime());
}

function dailyWindow(games:Game[]) {
  const today = localDay(new Date());
  const todays = games.filter(g => g.date && localDay(g.date) === today);

  const future = games
    .filter(g => g.date && localDay(g.date) > today && g.state === "pre")
    .sort((a,b)=>new Date(a.date).getTime()-new Date(b.date).getTime());

  const nextDay = future.length ? localDay(future[0].date) : "";
  const next = nextDay ? future.filter(g => localDay(g.date) === nextDay) : [];

  if(todays.length) return [...todays, ...next];
  if(next.length) return next;
  return games.filter(g => g.state !== "post").slice(0,20);
}

export async function GET(req:NextRequest) {
  const sport = String(
    req.nextUrl.searchParams.get("sport") || ""
  ).toLowerCase() as SportKey;

  const league = req.nextUrl.searchParams.get("league") || "eng.1";

  const allowed:SportKey[] = [
    "mlb","nfl","cfb","nba","wnba","nhl","soccer","cbb"
  ];

  if(!allowed.includes(sport)) {
    return NextResponse.json(
      {success:false,error:"Unsupported sport"},
      {status:400}
    );
  }

  try {
    let games:Game[] = [];
    let weekNumber:number|null = null;

    if(sport === "nfl" || sport === "cfb") {
      const football = await espnFootball(sport);
      games = football.games;
      weekNumber = football.weekNumber;
    } else if(sport === "mlb") {
      games = dailyWindow(await mlbGames());
    } else if(sport === "soccer") {
      games = dailyWindow(await soccerGames(league));
    } else if(sport === "nba") {
      games = dailyWindow(
        await enrichBasketballLiveStatus(
          "nba",
          (await loadNbaOverview()).games.map(game => fromOverview("nba", game))
        )
      );
    } else if(sport === "wnba") {
      games = dailyWindow(
        await enrichBasketballLiveStatus(
          "wnba",
          (await loadWnbaOverview()).games.map(game => fromOverview("wnba", game))
        )
      );
    } else if(sport === "nhl") {
      games = dailyWindow(
        (await loadNhlOverview()).games.map(game => fromOverview("nhl", game))
      );
    } else if(sport === "cbb") {
      games = dailyWindow(
        await enrichBasketballLiveStatus(
          "cbb",
          (await loadCbbOverview()).games.map(game => fromOverview("cbb", game))
        )
      );
    }

    return NextResponse.json({
      success:true,
      sport,
      league,
      weekNumber,
      games,
      updatedAt:new Date().toISOString(),
    });
  } catch(error) {
    return NextResponse.json(
      {
        success:false,
        sport,
        league,
        games:[],
        error:error instanceof Error ? error.message : "Game slate unavailable",
        updatedAt:new Date().toISOString(),
      },
      {status:500}
    );
  }
}
