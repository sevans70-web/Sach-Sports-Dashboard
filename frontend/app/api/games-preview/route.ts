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
  homeTeam: string;
  homeAbbr: string;
  homeLogo?: string | null;
  homeScore?: number | string | null;
  state: "pre" | "in" | "post";
  status: string;
  href: string;
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
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TORONTO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function compactDay(d: Date) {
  return d.toISOString().slice(0, 10).replaceAll("-", "");
}

function acronym(name: string) {
  const clean = String(name || "")
    .replace(/\b(FC|AFC|SC|CF|Club|Football|Basketball|Hockey)\b/gi, " ")
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .trim();
  if (!clean) return "—";
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.map((w) => w[0]).join("").slice(0, 4).toUpperCase();
}

function stateOf(raw: any): "pre" | "in" | "post" {
  const state = String(raw?.state ?? raw?.statusGroup ?? raw?.status?.type?.state ?? "").toLowerCase();
  if (state === "in" || state === "live" || state === "crit") return "in";
  if (state === "post" || state === "final" || raw?.completed === true || raw?.isFinal === true) return "post";
  return "pre";
}

function fromOverviewGame(sport: SportKey, raw: any): Game {
  const id = String(raw?.gameId ?? raw?.id ?? raw?.gamePk ?? "");
  const date = String(raw?.tipoff ?? raw?.kickoff ?? raw?.date ?? raw?.gameDate ?? "");
  const awayTeam = String(raw?.awayTeam ?? raw?.away?.name ?? "Away");
  const homeTeam = String(raw?.homeTeam ?? raw?.home?.name ?? "Home");
  const awayAbbr = String(raw?.awayAbbr ?? raw?.awayAbbreviation ?? "").trim() || acronym(awayTeam);
  const homeAbbr = String(raw?.homeAbbr ?? raw?.homeAbbreviation ?? "").trim() || acronym(homeTeam);
  const awayLogo = raw?.awayLogo ?? raw?.away?.logo ?? null;
  const homeLogo = raw?.homeLogo ?? raw?.home?.logo ?? null;
  const state = stateOf(raw);
  const status = String(raw?.status ?? raw?.detail ?? (state === "post" ? "Final" : state === "in" ? "Live" : "Scheduled"));
  const detailRoute =
    sport === "nba" || sport === "wnba" || sport === "cbb"
      ? `/${sport}/games/${encodeURIComponent(id)}`
      : `/${sport}/games`;
  return {
    id,
    date,
    awayTeam,
    awayAbbr,
    awayLogo,
    awayScore: raw?.awayScore ?? raw?.away?.score ?? null,
    homeTeam,
    homeAbbr,
    homeLogo,
    homeScore: raw?.homeScore ?? raw?.home?.score ?? null,
    state,
    status,
    href: detailRoute,
    weekNumber: Number(raw?.weekNumber || 0) || null,
  };
}

async function espnFootball(sport: "nfl" | "cfb", week?: number) {
  const path = sport === "nfl" ? "football/nfl" : "football/college-football";
  const params = new URLSearchParams({ limit: "300" });
  if (week) params.set("week", String(week));

  const response = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard?${params.toString()}`,
    { cache: "no-store", headers: { "User-Agent": "Sach-Sports/1.0" } },
  );
  if (!response.ok) throw new Error(`${sport} schedule ${response.status}`);
  const payload = await response.json();
  const games: Game[] = [];
  const payloadWeek = Number(payload?.week?.number || week || 0) || null;

  for (const event of payload?.events || []) {
    const comp = event?.competitions?.[0] || {};
    const away = (comp?.competitors || []).find((x: any) => x?.homeAway === "away") || {};
    const home = (comp?.competitors || []).find((x: any) => x?.homeAway === "home") || {};
    const type = event?.status?.type || {};
    const state = String(type?.state || "pre").toLowerCase() === "in"
      ? "in"
      : (type?.completed || String(type?.state || "").toLowerCase() === "post")
        ? "post"
        : "pre";
    const id = String(event?.id || "");
    games.push({
      id,
      date: String(event?.date || ""),
      awayTeam: String(away?.team?.displayName || "Away"),
      awayAbbr: String(away?.team?.abbreviation || "").trim() || acronym(String(away?.team?.displayName || "")),
      awayLogo: away?.team?.logo || null,
      awayScore: state === "pre" ? null : away?.score ?? null,
      homeTeam: String(home?.team?.displayName || "Home"),
      homeAbbr: String(home?.team?.abbreviation || "").trim() || acronym(String(home?.team?.displayName || "")),
      homeLogo: home?.team?.logo || null,
      homeScore: state === "pre" ? null : home?.score ?? null,
      state,
      status: String(type?.shortDetail || type?.description || (state === "post" ? "Final" : state === "in" ? "Live" : "Scheduled")),
      href: `/${sport}/games`,
      weekNumber: Number(event?.week?.number || payloadWeek || 0) || null,
    });
  }

  return {
    games: games.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    weekNumber: payloadWeek || games.find((g) => g.weekNumber)?.weekNumber || null,
  };
}

async function mlbGames() {
  const now = new Date();
  const end = new Date(now.getTime() + 14 * 86_400_000);
  const startKey = localDay(now);
  const endKey = localDay(end);
  const response = await fetch(
    `https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=${startKey}&endDate=${endKey}`,
    { cache: "no-store", headers: { "User-Agent": "Sach-Sports/1.0" } },
  );
  if (!response.ok) throw new Error(`MLB schedule ${response.status}`);
  const payload = await response.json();
  const games: Game[] = [];

  for (const block of payload?.dates || []) {
    for (const raw of block?.games || []) {
      const away = raw?.teams?.away || {};
      const home = raw?.teams?.home || {};
      const awayName = String(away?.team?.name || "Away");
      const homeName = String(home?.team?.name || "Home");
      const abstract = String(raw?.status?.abstractGameState || "").toLowerCase();
      const state: "pre" | "in" | "post" =
        abstract.includes("live") ? "in" : abstract.includes("final") ? "post" : "pre";
      const id = String(raw?.gamePk || "");
      games.push({
        id,
        date: String(raw?.gameDate || ""),
        awayTeam: awayName,
        awayAbbr: MLB_ABBR[awayName] || acronym(awayName),
        awayLogo: away?.team?.id ? `https://www.mlbstatic.com/team-logos/${away.team.id}.svg` : null,
        awayScore: state === "pre" ? null : away?.score ?? null,
        homeTeam: homeName,
        homeAbbr: MLB_ABBR[homeName] || acronym(homeName),
        homeLogo: home?.team?.id ? `https://www.mlbstatic.com/team-logos/${home.team.id}.svg` : null,
        homeScore: state === "pre" ? null : home?.score ?? null,
        state,
        status: String(raw?.status?.detailedState || (state === "post" ? "Final" : state === "in" ? "Live" : "Scheduled")),
        href: `/mlb/games/${encodeURIComponent(id)}`,
      });
    }
  }
  return games.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

async function soccerGames(league: string) {
  const now = new Date();
  const start = new Date(now.getTime() - 1 * 86_400_000);
  const end = new Date(now.getTime() + 10 * 86_400_000);
  const response = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/soccer/${encodeURIComponent(league)}/scoreboard?dates=${compactDay(start)}-${compactDay(end)}&limit=300`,
    { cache: "no-store", headers: { "User-Agent": "Sach-Sports/1.0" } },
  );
  if (!response.ok) throw new Error(`Soccer schedule ${response.status}`);
  const payload = await response.json();
  const games: Game[] = [];

  for (const event of payload?.events || []) {
    const comp = event?.competitions?.[0] || {};
    const away = (comp?.competitors || []).find((x: any) => x?.homeAway === "away") || {};
    const home = (comp?.competitors || []).find((x: any) => x?.homeAway === "home") || {};
    const type = event?.status?.type || {};
    const state: "pre" | "in" | "post" =
      String(type?.state || "").toLowerCase() === "in"
        ? "in"
        : (type?.completed || String(type?.state || "").toLowerCase() === "post")
          ? "post"
          : "pre";
    const id = String(event?.id || "");
    const awayName = String(away?.team?.displayName || "Away");
    const homeName = String(home?.team?.displayName || "Home");
    games.push({
      id,
      date: String(event?.date || ""),
      awayTeam: awayName,
      awayAbbr: String(away?.team?.abbreviation || "").trim() || acronym(awayName),
      awayLogo: away?.team?.logo || null,
      awayScore: state === "pre" ? null : away?.score ?? null,
      homeTeam: homeName,
      homeAbbr: String(home?.team?.abbreviation || "").trim() || acronym(homeName),
      homeLogo: home?.team?.logo || null,
      homeScore: state === "pre" ? null : home?.score ?? null,
      state,
      status: String(type?.shortDetail || type?.description || (state === "post" ? "Final" : state === "in" ? "Live" : "Scheduled")),
      href: `/soccer/games/${encodeURIComponent(id)}?league=${encodeURIComponent(league)}`,
    });
  }
  return games.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}


function previewPriority(state: Game["state"]) {
  if (state === "in") return 0;
  if (state === "pre") return 1;
  return 2;
}

function sortPreviewGames(games: Game[]) {
  return [...games].sort((a, b) => {
    const stateDiff = previewPriority(a.state) - previewPriority(b.state);
    if (stateDiff !== 0) return stateDiff;
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });
}

function unfinished(games: Game[]) {
  return games.filter((g) => g.state !== "post");
}

function chooseDailySlate(sport: SportKey, games: Game[]) {
  const today = localDay(new Date());

  // A live game stays visible even if it crossed midnight. Completed games never
  // occupy one of the three dashboard preview slots.
  const live = games.filter((g) => g.state === "in");
  const todayScheduled = games.filter(
    (g) => g.state === "pre" && g.date && localDay(g.date) === today,
  );
  const current = sortPreviewGames([...live, ...todayScheduled]);

  if (current.length) {
    return {
      title: `TODAY’S ${sport.toUpperCase()} GAMES`,
      games: current,
    };
  }

  // When today's slate is fully final, immediately roll the preview to the next
  // scheduled day instead of leaving Final cards parked on the dashboard.
  const future = games
    .filter((g) => g.state === "pre" && g.date && new Date(g.date).getTime() > Date.now())
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (!future.length) {
    return {
      title: `UPCOMING ${sport.toUpperCase()} GAMES`,
      games: [],
    };
  }

  const nextDay = localDay(future[0].date);
  return {
    title: `UPCOMING ${sport.toUpperCase()} GAMES`,
    games: future.filter((g) => localDay(g.date) === nextDay),
  };
}

export async function GET(req: NextRequest) {
  const sport = String(req.nextUrl.searchParams.get("sport") || "").toLowerCase() as SportKey;
  const league = req.nextUrl.searchParams.get("league") || "eng.1";
  const allowed: SportKey[] = ["mlb","nfl","cfb","nba","wnba","nhl","soccer","cbb"];
  if (!allowed.includes(sport)) {
    return NextResponse.json({ success: false, error: "Unsupported sport" }, { status: 400 });
  }

  try {
    let games: Game[] = [];
    let title = "";
    let slate: Game[] = [];

    if (sport === "nfl" || sport === "cfb") {
      const current = await espnFootball(sport);
      let displayWeek = current.weekNumber;
      let remaining = unfinished(current.games);
      let rolledForward = false;

      // Once every game in the current football week is final, pull the next
      // week so the three-card preview keeps moving forward automatically.
      if (!remaining.length && displayWeek) {
        const next = await espnFootball(sport, displayWeek + 1);
        const nextRemaining = unfinished(next.games);
        if (nextRemaining.length) {
          remaining = nextRemaining;
          displayWeek = next.weekNumber || displayWeek + 1;
          rolledForward = true;
        }
      }

      if (sport === "nfl") {
        title = displayWeek ? `WEEK ${displayWeek} NFL GAMES` : "UPCOMING NFL GAMES";
      } else {
        title = rolledForward ? "UPCOMING CFB GAMES" : "THIS WEEK’S CFB GAMES";
      }
      slate = sortPreviewGames(remaining);
    } else {
      if (sport === "mlb") games = await mlbGames();
      else if (sport === "soccer") games = await soccerGames(league);
      else if (sport === "nba") games = (await loadNbaOverview()).games.map((g) => fromOverviewGame("nba", g));
      else if (sport === "wnba") games = (await loadWnbaOverview()).games.map((g) => fromOverviewGame("wnba", g));
      else if (sport === "nhl") games = (await loadNhlOverview()).games.map((g) => fromOverviewGame("nhl", g));
      else if (sport === "cbb") games = (await loadCbbOverview()).games.map((g) => fromOverviewGame("cbb", g));

      const chosen = chooseDailySlate(sport, games);
      title = chosen.title;
      slate = chosen.games;
    }

    const viewAllHref =
      sport === "soccer"
        ? `/soccer/games?league=${encodeURIComponent(league)}`
        : `/${sport}/games`;

    return NextResponse.json({
      success: true,
      sport,
      title,
      viewAllHref,
      games: sortPreviewGames(slate).slice(0, 12),
      updatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      sport,
      title: sport === "nfl" ? "NFL GAMES" : sport === "cfb" ? "THIS WEEK’S CFB GAMES" : `UPCOMING ${sport.toUpperCase()} GAMES`,
      viewAllHref: sport === "soccer" ? `/soccer/games?league=${encodeURIComponent(league)}` : `/${sport}/games`,
      games: [],
      error: String(error?.message || error),
      updatedAt: new Date().toISOString(),
    });
  }
}
