import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const ALLOWED = new Set([
  "eng.1",
  "usa.1",
  "uefa.champions",
  "esp.1",
  "ita.1",
  "ger.1",
  "fra.1",
]);

type Metric = "shots_on_target" | "shots" | "saves" | "goals" | "assists";

const TARGETS: Record<Metric, number> = {
  shots_on_target: 0.5,
  shots: 1.5,
  saves: 2.5,
  goals: 0.5,
  assists: 0.5,
};

function ymd(date: Date) {
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

function num(value: unknown) {
  const parsed = Number(String(value ?? "").split(":")[0].replace("%", ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function keyName(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "")
    .toLowerCase();
}

function statKey(label: unknown): Metric | "minutes" | null {
  const key = String(label ?? "")
    .toLowerCase()
    .replace(/[\s_-]+/g, "");

  const map: Record<string, Metric | "minutes"> = {
    min: "minutes",
    minutes: "minutes",
    sh: "shots",
    shots: "shots",
    totalshots: "shots",
    sog: "shots_on_target",
    st: "shots_on_target",
    shotsontarget: "shots_on_target",
    g: "goals",
    gl: "goals",
    goals: "goals",
    a: "assists",
    ast: "assists",
    assists: "assists",
    sv: "saves",
    saves: "saves",
  };

  return map[key] ?? null;
}

function factorial(n: number) {
  let result = 1;
  for (let i = 2; i <= n; i += 1) result *= i;
  return result;
}

function poissonOver(lambda: number, line: number) {
  const k = Math.floor(line);
  let cdf = 0;
  for (let i = 0; i <= k; i += 1) {
    cdf += Math.exp(-lambda) * Math.pow(lambda, i) / factorial(i);
  }
  return Math.max(0, Math.min(100, (1 - cdf) * 100));
}

function expectedMinutes(avg: number, startRate: number) {
  if (startRate >= 0.8) return Math.min(90, Math.max(avg, 78));
  if (startRate >= 0.5) return Math.min(90, Math.max(avg, 65));
  return Math.min(90, Math.max(avg, 35));
}

async function fetchJson(url: string) {
  const response = await fetch(url, {
    headers: { "User-Agent": "SachSportsDashboard/1.0" },
    next: { revalidate: 900 },
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${url}`);
  }

  return response.json();
}

export async function GET(req: NextRequest) {
  const league = req.nextUrl.searchParams.get("league") || "eng.1";

  if (!ALLOWED.has(league)) {
    return NextResponse.json(
      { success: false, error: "Unsupported league" },
      { status: 400 },
    );
  }

  const now = new Date();
  const start = new Date(now.getTime() - 35 * 86_400_000);
  const end = new Date(now.getTime() + 8 * 86_400_000);
  const errors: string[] = [];

  try {
    const board = await fetchJson(
      `${ESPN_BASE}/${league}/scoreboard?dates=${ymd(start)}-${ymd(end)}&limit=500`,
    );

    const games = (board?.events || [])
      .map((event: any) => {
        const competition = event?.competitions?.[0] || {};
        const teams = competition?.competitors || [];
        const home = teams.find((team: any) => team.homeAway === "home") || {};
        const away = teams.find((team: any) => team.homeAway === "away") || {};
        const type = event?.status?.type || {};

        return {
          gameId: String(event?.id || ""),
          kickoff: String(event?.date || ""),
          awayTeam: String(away?.team?.displayName || "Away"),
          homeTeam: String(home?.team?.displayName || "Home"),
          awayLogo: String(away?.team?.logo || ""),
          homeLogo: String(home?.team?.logo || ""),
          awayScore: away?.score ?? null,
          homeScore: home?.score ?? null,
          status: String(type?.shortDetail || type?.description || "Scheduled"),
          state: String(type?.state || ""),
          completed: Boolean(type?.completed),
        };
      })
      .sort((a: any, b: any) => String(a.kickoff).localeCompare(String(b.kickoff)));

    const completed = games.filter((game: any) => game.completed).slice(-36);

    const summaries = await Promise.all(
      completed.map(async (game: any) => {
        try {
          return {
            game,
            data: await fetchJson(`${ESPN_BASE}/${league}/summary?event=${game.gameId}`),
          };
        } catch (error: any) {
          errors.push(`summary ${game.gameId}: ${error?.message || error}`);
          return null;
        }
      }),
    );

    const appearances: any[] = [];

    for (const item of summaries) {
      if (!item) continue;

      for (const teamBlock of item.data?.boxscore?.players || []) {
        const team = teamBlock?.team || {};
        const teamName = String(team?.displayName || team?.shortDisplayName || "");

        for (const group of teamBlock?.statistics || []) {
          const labels = group?.labels || group?.names || [];

          for (const athleteRow of group?.athletes || []) {
            const athlete = athleteRow?.athlete || {};
            const values = athleteRow?.stats || [];
            const row: Record<string, any> = {
              gameId: item.game.gameId,
              gameDate: item.game.kickoff,
              playerId: String(athlete?.id || ""),
              playerName: String(
                athlete?.displayName || athlete?.shortName || athlete?.fullName || "Unknown",
              ),
              photoUrl: String(athlete?.headshot?.href || ""),
              team: teamName,
              position: String(athlete?.position?.abbreviation || "").toUpperCase(),
              starter: Boolean(athleteRow?.starter),
              minutes: 0,
              shots: 0,
              shots_on_target: 0,
              goals: 0,
              assists: 0,
              saves: 0,
            };

            let found = false;
            labels.forEach((label: unknown, index: number) => {
              const key = statKey(label);
              if (!key) return;
              row[key] = num(values[index]);
              found = true;
            });

            if (found) appearances.push(row);
          }
        }
      }
    }

    const upcoming = games.filter((game: any) => !game.completed);
    const teamContext = new Map<string, any>();

    for (const game of upcoming) {
      if (!teamContext.has(game.homeTeam)) {
        teamContext.set(game.homeTeam, {
          opponent: game.awayTeam,
          homeAway: "HOME",
          matchup: `${game.awayTeam} @ ${game.homeTeam}`,
          kickoff: game.kickoff,
        });
      }

      if (!teamContext.has(game.awayTeam)) {
        teamContext.set(game.awayTeam, {
          opponent: game.homeTeam,
          homeAway: "AWAY",
          matchup: `${game.awayTeam} @ ${game.homeTeam}`,
          kickoff: game.kickoff,
        });
      }
    }

    const metrics: Metric[] = ["shots_on_target", "shots", "saves", "goals", "assists"];
    const rankings: Record<string, any[]> = {};
    const allPlayers = new Set<string>();

    for (const metric of metrics) {
      const byPlayer = new Map<string, any[]>();

      for (const row of appearances) {
        if (!teamContext.has(row.team)) continue;
        if (metric === "saves" && row.position !== "GK" && Number(row.saves) <= 0) continue;
        if (metric !== "saves" && row.position === "GK") continue;

        const playerKey = keyName(row.playerName);
        if (!byPlayer.has(playerKey)) byPlayer.set(playerKey, []);
        byPlayer.get(playerKey)!.push(row);
      }

      const rows: any[] = [];

      for (const appearancesForPlayer of byPlayer.values()) {
        appearancesForPlayer.sort((a, b) =>
          String(a.gameDate).localeCompare(String(b.gameDate)),
        );

        const recent = appearancesForPlayer.slice(-5);
        const last = recent[recent.length - 1];
        if (!last) continue;

        const gamesN = recent.length;
        const avg =
          recent.reduce((sum, row) => sum + Number(row[metric] || 0), 0) / gamesN;
        const avgMinutes =
          recent.reduce((sum, row) => sum + Number(row.minutes || 0), 0) / gamesN;
        const starts = recent.filter((row) => row.starter).length;
        const startRate = starts / gamesN;
        const per90 = (avg * 90) / Math.max(avgMinutes, 20);
        const expected = expectedMinutes(avgMinutes, startRate);
        const projection = Math.max(
          0,
          0.58 * avg + 0.42 * per90 * (expected / 90),
        );
        const target = TARGETS[metric];
        const probability = poissonOver(Math.max(projection, 0.001), target);
        const sampleScore = Math.min(gamesN / 5, 1) * 10;
        const minutesScore = Math.min(avgMinutes / 90, 1) * 10;
        const startScore = Math.min(startRate, 1) * 8;
        const giScore = Math.max(
          0,
          Math.min(100, probability * 0.72 + sampleScore + minutesScore + startScore),
        );
        const context = teamContext.get(last.team);

        if (metric !== "saves" && avg === 0 && projection < 0.1) continue;
        if (metric === "saves" && avg === 0) continue;

        allPlayers.add(last.playerId || last.playerName);
        rows.push({
          playerId: last.playerId,
          playerName: last.playerName,
          photoUrl: last.photoUrl,
          team: last.team,
          position: last.position,
          matchup: context?.matchup || "",
          opponent: context?.opponent || "",
          homeAway: context?.homeAway || "",
          kickoff: context?.kickoff || "",
          games: gamesN,
          avgMetric: Number(avg.toFixed(2)),
          lastMetric: Number(last[metric] || 0),
          avgMinutes: Number(avgMinutes.toFixed(1)),
          expectedMinutes: Number(expected.toFixed(1)),
          startRate: Number(startRate.toFixed(2)),
          projection: Number(projection.toFixed(2)),
          modelTarget: target,
          modelProbability: Number(probability.toFixed(1)),
          giScore: Number(giScore.toFixed(1)),
          availability:
            startRate >= 0.8
              ? "Likely starter"
              : startRate >= 0.5
                ? "Expected contributor"
                : "Rotation watch",
          why: `Last ${gamesN}: ${avg.toFixed(2)}/match · ${avgMinutes.toFixed(0)} avg min · ${(startRate * 100).toFixed(0)}% starts`,
        });
      }

      rankings[metric] = rows
        .sort(
          (a, b) =>
            b.giScore - a.giScore ||
            b.modelProbability - a.modelProbability ||
            b.projection - a.projection,
        )
        .slice(0, 25)
        .map((row, index) => ({ ...row, rank: index + 1 }));
    }

    return NextResponse.json({
      success: true,
      league,
      leagueSlug: league,
      updatedAt: new Date().toISOString(),
      games,
      rankings,
      playersTracked: allPlayers.size,
      errors,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        league,
        leagueSlug: league,
        updatedAt: new Date().toISOString(),
        games: [],
        rankings: {
          shots_on_target: [],
          shots: [],
          saves: [],
          goals: [],
          assists: [],
        },
        playersTracked: 0,
        errors: [String(error?.message || error)],
      },
      { status: 200 },
    );
  }
}
