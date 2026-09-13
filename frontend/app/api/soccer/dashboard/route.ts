import { NextRequest, NextResponse } from "next/server";
import {
  buildHistoryIndex,
  extractAppearances,
  extractRosterPlayers,
  findPlayerHistory,
  findRosterPlayer,
  scheduleEventRows,
  type SoccerAppearance,
  type SoccerRosterPlayer,
} from "@/lib/soccer-history";

import {
  fairOverProbability,
  normalizeName,
  parseOwlsSoccerProps,
  type OwlsSoccerProp,
  type SoccerPropMetric,
} from "@/lib/owls-soccer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const OWLS_PROPS_URL = "https://api.owlsinsight.com/api/v1/soccer/props";
const ESPN_CDN_GAME = "https://cdn.espn.com/core/soccer/game";

const ALLOWED = new Set([
  "eng.1",
  "usa.1",
  "uefa.champions",
  "esp.1",
  "ita.1",
  "ger.1",
  "fra.1",
]);

type Metric = SoccerPropMetric;

const PROP_LABELS: Record<Metric, string> = {
  shots_on_target: "Shots on Target",
  shots: "Shots",
  saves: "Goalkeeper Saves",
  goals: "Goals",
  assists: "Assists",
};

function ymd(date: Date) {
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

function num(value: unknown) {
  const parsed = Number(String(value ?? "").split(":")[0].replace("%", ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function statKey(label: unknown): Metric | "minutes" | null {
  const key = String(label ?? "")
    .toLowerCase()
    .replace(/[\s_+\-]+/g, "");

  const map: Record<string, Metric | "minutes"> = {
    min: "minutes",
    mins: "minutes",
    minutes: "minutes",
    sh: "shots",
    shots: "shots",
    totalshots: "shots",
    shotstotal: "shots",
    sog: "shots_on_target",
    st: "shots_on_target",
    shotsontarget: "shots_on_target",
    shotsongoal: "shots_on_target",
    g: "goals",
    gl: "goals",
    goals: "goals",
    a: "assists",
    ast: "assists",
    assists: "assists",
    sv: "saves",
    saves: "saves",
    goalkeepersaves: "saves",
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

async function fetchEspnJson(url: string) {
  const response = await fetch(url, {
    headers: { "User-Agent": "SachSportsDashboard/1.0" },
    next: { revalidate: 900 },
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

async function fetchOwlsProps(errors: string[]) {
  const apiKey = process.env.OWLS_INSIGHT_API_KEY;
  if (!apiKey) {
    errors.push("OWLS_INSIGHT_API_KEY is missing from Railway.");
    return { rows: [] as OwlsSoccerProp[], meta: null };
  }

  try {
    const response = await fetch(OWLS_PROPS_URL, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    const text = await response.text();
    let payload: any;

    try {
      payload = JSON.parse(text);
    } catch {
      errors.push(`Owls soccer props returned non-JSON (${response.status}).`);
      return { rows: [] as OwlsSoccerProp[], meta: null };
    }

    if (!response.ok) {
      errors.push(
        `Owls soccer props ${response.status}: ${payload?.error || payload?.message || response.statusText}`,
      );
      return { rows: [] as OwlsSoccerProp[], meta: payload?.meta ?? null };
    }

    return {
      rows: parseOwlsSoccerProps(payload),
      meta: payload?.meta ?? null,
    };
  } catch (error: any) {
    errors.push(`Owls soccer props: ${error?.message || error}`);
    return { rows: [] as OwlsSoccerProp[], meta: null };
  }
}

function popularityScore(home: string, away: string) {
  const major =
    /Arsenal|Chelsea|Liverpool|Manchester City|Manchester United|Tottenham|Barcelona|Real Madrid|Atletico|Bayern|Dortmund|PSG|Marseille|Inter|Milan|Juventus|Napoli/i;
  return (major.test(home) ? 1 : 0) + (major.test(away) ? 1 : 0);
}

function eventMatchesGame(prop: OwlsSoccerProp, game: any) {
  const event = normalizeName(prop.eventText);
  const team = normalizeName(prop.team);
  const home = normalizeName(game.homeTeam);
  const away = normalizeName(game.awayTeam);

  if (!event && !team) return false;

  const eventHasHome = home.length >= 5 && event.includes(home);
  const eventHasAway = away.length >= 5 && event.includes(away);
  const teamMatches = team && (team === home || team === away || home.includes(team) || away.includes(team));

  return Boolean((eventHasHome && eventHasAway) || teamMatches);
}

function pickConsensusLine(rows: OwlsSoccerProp[]) {
  const lineGroups = new Map<string, OwlsSoccerProp[]>();

  for (const row of rows) {
    const key = String(row.line);
    if (!lineGroups.has(key)) lineGroups.set(key, []);
    lineGroups.get(key)!.push(row);
  }

  const sorted = [...lineGroups.entries()].sort(
    (a, b) => b[1].length - a[1].length || Number(a[0]) - Number(b[0]),
  );

  return sorted[0]?.[1] || rows;
}

function averageProbability(rows: OwlsSoccerProp[]) {
  const values = rows
    .map((row) => fairOverProbability(row.overOdds, row.underOdds))
    .filter((value): value is number => value !== null && Number.isFinite(value));

  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export async function GET(req: NextRequest) {
  const league = req.nextUrl.searchParams.get("league") || "eng.1";

  if (!ALLOWED.has(league)) {
    return NextResponse.json({ success: false, error: "Unsupported league" }, { status: 400 });
  }

  const now = new Date();
  const start = new Date(now.getTime() - 45 * 86_400_000);
  const end = new Date(now.getTime() + 8 * 86_400_000);
  const errors: string[] = [];

  try {
    const [board, owls] = await Promise.all([
      fetchEspnJson(
        `${ESPN_BASE}/${league}/scoreboard?dates=${ymd(start)}-${ymd(end)}&limit=500`,
      ),
      fetchOwlsProps(errors),
    ]);

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
          awayTeamId: String(away?.team?.id || ""),
          homeTeamId: String(home?.team?.id || ""),
          awayLogo: String(away?.team?.logo || ""),
          homeLogo: String(home?.team?.logo || ""),
          awayScore: away?.score ?? null,
          homeScore: home?.score ?? null,
          status: String(type?.shortDetail || type?.description || "Scheduled"),
          state: String(type?.state || ""),
          completed: Boolean(type?.completed),
        };
      })
      .filter((game: any) => game.gameId)
      .sort((a: any, b: any) => String(a.kickoff).localeCompare(String(b.kickoff)));

    const completed = games.filter((game: any) => game.completed).slice(-48);
    const upcoming = games.filter((game: any) => !game.completed);

    const currentTeams = new Map<string, string>();
    for (const game of upcoming) {
      if (game.homeTeamId) currentTeams.set(game.homeTeamId, game.homeTeam);
      if (game.awayTeamId) currentTeams.set(game.awayTeamId, game.awayTeam);
    }

    const rosterPlayers: SoccerRosterPlayer[] = [];
    const historicalEventIds = new Map<string, string>();

    await Promise.all(
      [...currentTeams.entries()].map(async ([teamId, teamName]) => {
        try {
          const [rosterPayload, schedulePayload] = await Promise.all([
            fetchEspnJson(`${ESPN_BASE}/${league}/teams/${teamId}/roster`),
            fetchEspnJson(`${ESPN_BASE}/${league}/teams/${teamId}/schedule`),
          ]);

          rosterPlayers.push(
            ...extractRosterPlayers(rosterPayload, {
              teamId,
              team: teamName,
            }),
          );

          const recentTeamEvents = scheduleEventRows(schedulePayload)
            .filter((event) => event.completed)
            .sort((a, b) => String(a.kickoff).localeCompare(String(b.kickoff)))
            .slice(-7);

          for (const event of recentTeamEvents) {
            historicalEventIds.set(event.gameId, event.kickoff);
          }
        } catch (error: any) {
          errors.push(`team ${teamId} history: ${error?.message || error}`);
        }
      }),
    );

    for (const game of completed) {
      if (!historicalEventIds.has(game.gameId)) {
        historicalEventIds.set(game.gameId, game.kickoff);
      }
    }

    const historyEvents = [...historicalEventIds.entries()]
      .sort((a, b) => String(a[1]).localeCompare(String(b[1])))
      .slice(-80);

    const appearances: SoccerAppearance[] = [];

    await Promise.all(
      historyEvents.map(async ([gameId, gameDate]) => {
        try {
          const summary = await fetchEspnJson(`${ESPN_BASE}/${league}/summary?event=${gameId}`);
          let parsed = extractAppearances(summary, { gameId, gameDate });

          if (!parsed.length) {
            try {
              const cdn = await fetchEspnJson(
                `${ESPN_CDN_GAME}?xhr=1&gameId=${gameId}&league=${league}`,
              );
              parsed = extractAppearances(cdn, { gameId, gameDate });
            } catch (cdnError: any) {
              errors.push(`cdn ${gameId}: ${cdnError?.message || cdnError}`);
            }
          }

          appearances.push(...parsed);
        } catch (error: any) {
          errors.push(`summary ${gameId}: ${error?.message || error}`);
        }
      }),
    );

    const appearancesByPlayer = buildHistoryIndex(appearances);

    // Only use props that can be tied to a game on the selected ESPN league slate.
    const propGamePairs: { prop: OwlsSoccerProp; game: any }[] = [];
    for (const prop of owls.rows) {
      const game = upcoming.find((candidate: any) => eventMatchesGame(prop, candidate));
      if (game) propGamePairs.push({ prop, game });
    }

    const metrics: Metric[] = [
      "shots_on_target",
      "shots",
      "saves",
      "goals",
      "assists",
    ];

    const rankings: Record<string, any[]> = {};
    const allPlayers = new Set<string>();

    for (const metric of metrics) {
      const marketRows = propGamePairs.filter(({ prop }) => prop.metric === metric);
      const byPlayer = new Map<string, { prop: OwlsSoccerProp; game: any }[]>();

      for (const pair of marketRows) {
        const key = normalizeName(pair.prop.playerName);
        if (!key) continue;
        if (!byPlayer.has(key)) byPlayer.set(key, []);
        byPlayer.get(key)!.push(pair);
      }

      const rows: any[] = [];

      for (const [playerKey, pairs] of byPlayer.entries()) {
        const consensus = pickConsensusLine(pairs.map((pair) => pair.prop));
        const selected = consensus[0] || pairs[0]?.prop;
        const pair = pairs.find((item) => item.prop === selected) || pairs[0];

        if (!selected || !pair) continue;

        const rosterMatch = findRosterPlayer(
          selected.playerName,
          rosterPlayers,
          selected.team,
        );

        const recentAll = findPlayerHistory(
          selected.playerName,
          appearancesByPlayer,
          selected.team || rosterMatch?.team || "",
        )
          .sort((a, b) => String(a.gameDate).localeCompare(String(b.gameDate)))
          .slice(-5);

        const recent =
          metric === "saves"
            ? recentAll.filter((row) => row.position === "GK" || Number(row.saves) > 0)
            : recentAll.filter((row) => row.position !== "GK");

        const gamesN = recent.length;
        const avg =
          gamesN > 0
            ? recent.reduce((sum, row) => sum + Number(row[metric] || 0), 0) / gamesN
            : 0;

        const avgMinutes =
          gamesN > 0
            ? recent.reduce((sum, row) => sum + Number(row.minutes || 0), 0) / gamesN
            : 0;

        const starts = recent.filter((row) => row.starter).length;
        const startRate = gamesN > 0 ? starts / gamesN : 0;
        const per90 = gamesN > 0 ? (avg * 90) / Math.max(avgMinutes, 20) : 0;
        const expected = gamesN > 0 ? expectedMinutes(avgMinutes, startRate) : 0;
        const statProjection =
          gamesN > 0
            ? Math.max(0, 0.58 * avg + 0.42 * per90 * (expected / 90))
            : selected.line;

        const marketProbability = averageProbability(consensus);
        const statProbability =
          gamesN > 0
            ? poissonOver(Math.max(statProjection, 0.001), selected.line)
            : null;

        const probability =
          marketProbability !== null && statProbability !== null
            ? marketProbability * 0.6 + statProbability * 0.4
            : marketProbability ?? statProbability ?? 50;

        const sampleScore = Math.min(gamesN / 5, 1) * 8;
        const bookScore = Math.min(new Set(pairs.map((x) => x.prop.book)).size / 4, 1) * 8;
        const starterScore = gamesN > 0 ? Math.min(startRate, 1) * 6 : 0;

        const giScore = Math.max(
          0,
          Math.min(100, probability * 0.78 + sampleScore + bookScore + starterScore),
        );

        const last = recent[recent.length - 1];
        const books = [...new Set(pairs.map((x) => x.prop.book).filter(Boolean))];

        allPlayers.add(playerKey);

        rows.push({
          playerId: last?.playerId || rosterMatch?.playerId || `owls:${playerKey}`,
          playerName: selected.playerName,
          photoUrl: last?.photoUrl || rosterMatch?.photoUrl || "",
          teamId: last?.teamId || rosterMatch?.teamId || "",
          team: selected.team || last?.team || rosterMatch?.team || "",
          position: last?.position || rosterMatch?.position || (metric === "saves" ? "GK" : ""),
          matchup: `${pair.game.awayTeam} @ ${pair.game.homeTeam}`,
          opponent: "",
          homeAway: "",
          kickoff: pair.game.kickoff,
          gameId: pair.game.gameId,
          games: gamesN,
          avgMetric: Number(avg.toFixed(2)),
          lastMetric: Number(last?.[metric] || 0),
          avgMinutes: Number(avgMinutes.toFixed(1)),
          expectedMinutes: Number(expected.toFixed(1)),
          startRate: Number(startRate.toFixed(2)),
          projection: Number(statProjection.toFixed(2)),
          modelTarget: selected.line,
          modelProbability: Number(probability.toFixed(1)),
          giScore: Number(giScore.toFixed(1)),
          availability:
            gamesN === 0
              ? "Sportsbook-backed prop"
              : startRate >= 0.8
                ? "Likely starter"
                : startRate >= 0.5
                  ? "Expected contributor"
                  : "Lineup watch",
          sportsbook: books.join(", "),
          marketLine: selected.line,
          overOdds: selected.overOdds,
          underOdds: selected.underOdds,
          why:
            gamesN > 0
              ? `Owls line ${selected.line} · ${books.length} book${books.length === 1 ? "" : "s"} · Last ${gamesN}: ${avg.toFixed(2)}/match`
              : `Owls line ${selected.line} · ${books.length} sportsbook${books.length === 1 ? "" : "s"} posting this prop`,
        });
      }

      rankings[metric] = rows
        .sort(
          (a, b) =>
            b.giScore - a.giScore ||
            b.modelProbability - a.modelProbability ||
            b.games - a.games,
        )
        .slice(0, 25)
        .map((row, index) => ({ ...row, rank: index + 1 }));
    }

    const allRanked = metrics.flatMap((metric) =>
      (rankings[metric] || []).map((row: any) => ({ ...row, metric })),
    );

    const matchupIntelligence = upcoming
      .map((game: any) => {
        const gamePlayers = allRanked.filter((row: any) => row.gameId === game.gameId);
        const sorted = [...gamePlayers].sort((a, b) => b.giScore - a.giScore);
        const best = sorted[0];
        const rankedPlayers = new Set(
          sorted.map((row: any) => row.playerId || row.playerName),
        ).size;
        const bestProp = best ? PROP_LABELS[best.metric as Metric] : "Matchup watch";
        const playerNames = [
          ...new Set(sorted.slice(0, 4).map((row: any) => row.playerName)),
        ];

        let reason = "";

        if (best) {
          const second = sorted[1];
          reason =
            `${rankedPlayers} sportsbook-backed player prop${rankedPlayers === 1 ? "" : "s"} are active in this game. ` +
            `${best.playerName} carries the strongest current Soccer GI signal at ${Number(best.giScore).toFixed(1)} in ${bestProp}` +
            (second ? `, with ${second.playerName} also grading strongly.` : ".");
        } else if (popularityScore(game.homeTeam, game.awayTeam) > 0) {
          reason =
            "This is a high-interest fixture featuring a major club. No supported Owls player prop has been tied to this matchup yet.";
        } else {
          reason =
            "This fixture is on the active slate. It will move up when Owls posts a supported player prop or stronger lineup intelligence becomes available.";
        }

        return {
          gameId: game.gameId,
          matchup: `${game.awayTeam} @ ${game.homeTeam}`,
          kickoff: game.kickoff,
          status: game.status,
          reason,
          bestProp,
          rankedPlayers,
          playersToWatch: playerNames,
          sortScore:
            (best?.giScore || 0) +
            rankedPlayers * 2 +
            popularityScore(game.homeTeam, game.awayTeam) * 8,
        };
      })
      .sort((a: any, b: any) => b.sortScore - a.sortScore)
      .slice(0, 3)
      .map(({ sortScore, ...item }: any) => item);

    const propCounts = metrics.reduce<Record<string, number>>((acc, metric) => {
      acc[metric] = rankings[metric]?.length || 0;
      return acc;
    }, {});

    return NextResponse.json({
      success: true,
      league,
      leagueSlug: league,
      updatedAt: new Date().toISOString(),
      games,
      rankings,
      matchupIntelligence,
      playersTracked: allPlayers.size,
      propSource: "Owls Insight",
      propCounts,
      owls: {
        received: owls.rows.length,
        matchedToSelectedLeagueSlate: propGamePairs.length,
        meta: owls.meta,
      },
      historyDiagnostics: {
        currentTeams: currentTeams.size,
        rosterPlayers: rosterPlayers.length,
        historicalEvents: historyEvents.length,
        appearancesParsed: appearances.length,
        playersWithHistory: appearancesByPlayer.size,
        rankingRowsWithHistory: metrics.reduce(
          (sum, metric) =>
            sum + (rankings[metric] || []).filter((row: any) => row.games > 0).length,
          0,
        ),
      },
      errors,
    });
  } catch (error: any) {
    return NextResponse.json({
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
      matchupIntelligence: [],
      playersTracked: 0,
      propSource: "Owls Insight",
      propCounts: {
        shots_on_target: 0,
        shots: 0,
        saves: 0,
        goals: 0,
        assists: 0,
      },
      errors: [String(error?.message || error)],
    });
  }
}
