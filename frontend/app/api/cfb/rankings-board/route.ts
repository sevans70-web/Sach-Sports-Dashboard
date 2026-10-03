import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

import {
  CFB_MARKETS,
  type CfbMarketKey,
  cleanName,
} from "@/lib/cfb";
import {
  getCfbMarketRows,
  getCfbRankings,
  getCfbTeamRoster,
  getEspnCfbSchedule,
} from "@/lib/cfb-server";
import { getOwlsCfbRows } from "@/lib/cfb-owls";
import {
  cfbGiScore,
  cfbPredictionProbability,
} from "@/lib/cfb-prediction";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SlateKey = "all" | "early" | "afternoon" | "evening";

type BoardPayload = {
  success: boolean;
  source: string;
  market: CfbMarketKey;
  slate: SlateKey;
  slateLabel: string;
  rows: any[];
  sportsbookOnly: boolean;
  validRankingCount: number;
  updatedAt: string;
  cached?: boolean;
  stale?: boolean;
  lockSource?: string;
};

type CacheEntry = {
  at: number;
  payload: BoardPayload;
};

type ModelEntry = {
  at: number;
  projection: number | null;
  games: number;
};

type BoardState = {
  day: string;
  market: CfbMarketKey;
  slate: SlateKey;
  rows: any[];
  locked: Record<string, any>;
  updatedAt: string;
};

const ATHLETE_BASE =
  "https://site.web.api.espn.com/apis/common/v3/sports/football/college-football/athletes";

const HISTORY_KEYS: Partial<Record<CfbMarketKey, string[]>> = {
  passing_yards: ["passingyards", "passyards", "yds"],
  pass_completions: ["completions", "passingcompletions", "cmp"],
  rushing_yards: ["rushingyards", "rushyards", "yds"],
  receiving_yards: ["receivingyards", "receptionyards", "recyards", "yds"],
  receptions: ["receptions", "rec"],
  anytime_td: [
    "totaltouchdowns",
    "touchdowns",
    "rushingreceivingtouchdowns",
    "td",
  ],
};

const SLATE_LABELS: Record<SlateKey, string> = {
  all: "All Day",
  early: "Noon / Early",
  afternoon: "Afternoon",
  evening: "Evening",
};

const globalStore = globalThis as typeof globalThis & {
  __sachCfbBoardCache?: Map<string, CacheEntry>;
  __sachCfbBoardInflight?: Map<string, Promise<BoardPayload>>;
  __sachCfbBoardModelCache?: Map<string, ModelEntry>;
  __sachCfbBoardRosterCache?: Map<
    string,
    {
      at: number;
      value: Awaited<ReturnType<typeof getCfbTeamRoster>>;
    }
  >;
  __sachCfbBoardRuntimeState?: Map<string, BoardState>;
};

const cache =
  globalStore.__sachCfbBoardCache ||
  (globalStore.__sachCfbBoardCache = new Map());

const inflight =
  globalStore.__sachCfbBoardInflight ||
  (globalStore.__sachCfbBoardInflight = new Map());

const modelCache =
  globalStore.__sachCfbBoardModelCache ||
  (globalStore.__sachCfbBoardModelCache = new Map());

const rosterCache =
  globalStore.__sachCfbBoardRosterCache ||
  (globalStore.__sachCfbBoardRosterCache = new Map());

const runtimeState =
  globalStore.__sachCfbBoardRuntimeState ||
  (globalStore.__sachCfbBoardRuntimeState = new Map());

const FRESH_MS = 45_000;
const STALE_MS = 5 * 60_000;
const MODEL_MS = 30 * 60_000;
const ROSTER_MS = 60 * 60_000;

const HISTORY_ROOT =
  process.env.SACH_HISTORY_DIR || "/data/sach-history";

const BOARD_DIR = path.join(
  HISTORY_ROOT,
  "cfb-ranking-boards"
);

const norm = (value: any) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

function torontoParts(value: Date | string) {
  const date =
    typeof value === "string"
      ? new Date(value)
      : value;

  if (Number.isNaN(date.getTime())) {
    return {
      day: "",
      hour: 0,
    };
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value || "";

  return {
    day: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")) % 24,
  };
}

function day(value: Date | string) {
  return torontoParts(value).day;
}

function slateForTime(value: string): Exclude<SlateKey, "all"> {
  const hour = torontoParts(value).hour;

  if (hour < 15) return "early";
  if (hour < 19) return "afternoon";
  return "evening";
}

function inSlate(
  value: string,
  slate: SlateKey
) {
  if (slate === "all") return true;
  return slateForTime(value) === slate;
}

function rowKey(row: any) {
  return `${row.playerId}|${cleanName(row.matchup || "")}`;
}

function boardKey(
  market: CfbMarketKey,
  slate: SlateKey,
  gameDay: string
) {
  return `${gameDay}|${market}|${slate}`;
}

function safeFilePart(value: string) {
  return value.replace(/[^a-z0-9_-]/gi, "_");
}

function boardFile(
  market: CfbMarketKey,
  slate: SlateKey,
  gameDay: string
) {
  return path.join(
    BOARD_DIR,
    `${safeFilePart(gameDay)}_${safeFilePart(market)}_${safeFilePart(slate)}.json`
  );
}

async function readBoardState(
  market: CfbMarketKey,
  slate: SlateKey,
  gameDay: string
): Promise<BoardState | null> {
  const key = boardKey(
    market,
    slate,
    gameDay
  );

  const runtime = runtimeState.get(key);

  if (runtime) return runtime;

  try {
    const raw = await fs.readFile(
      boardFile(market, slate, gameDay),
      "utf8"
    );

    const parsed = JSON.parse(raw);

    if (
      parsed?.day !== gameDay ||
      parsed?.market !== market ||
      parsed?.slate !== slate
    ) {
      return null;
    }

    const state = parsed as BoardState;
    runtimeState.set(key, state);
    return state;
  } catch {
    return null;
  }
}

async function writeBoardState(
  state: BoardState
) {
  const key = boardKey(
    state.market,
    state.slate,
    state.day
  );

  runtimeState.set(key, state);

  try {
    await fs.mkdir(
      BOARD_DIR,
      { recursive: true }
    );

    const target = boardFile(
      state.market,
      state.slate,
      state.day
    );

    const temp = `${target}.tmp`;

    await fs.writeFile(
      temp,
      JSON.stringify(state),
      "utf8"
    );

    await fs.rename(temp, target);

    return true;
  } catch {
    return false;
  }
}

async function timeout<T>(
  promise: Promise<T>,
  ms: number,
  fallback: T
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) =>
      setTimeout(
        () => resolve(fallback),
        ms
      )
    ),
  ]);
}

async function fetchJson(
  url: string,
  ms = 2500
) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    ms
  );

  try {
    const response = await fetch(
      url,
      {
        cache: "no-store",
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0",
          Accept: "application/json, text/plain, */*",
        },
      }
    );

    if (!response.ok) {
      throw new Error(
        String(response.status)
      );
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function history(
  payload: any,
  market: CfbMarketKey
) {
  const names = (
    Array.isArray(payload?.names)
      ? payload.names
      : []
  ).map(norm);

  let index = -1;

  for (
    const wanted of
      HISTORY_KEYS[market] || []
  ) {
    index = names.findIndex(
      (name: string) =>
        name === wanted
    );

    if (index >= 0) break;
  }

  if (index < 0) return [];

  const values: number[] = [];
  const seen = new Set<string>();

  for (
    const seasonType of
      payload?.seasonTypes || []
  ) {
    for (
      const category of
        seasonType?.categories || []
    ) {
      if (category?.type !== "event") {
        continue;
      }

      for (
        const event of
          category?.events || []
      ) {
        const id = String(
          event?.eventId || ""
        );

        if (
          !id ||
          seen.has(id)
        ) {
          continue;
        }

        const value = Number(
          Array.isArray(event?.stats)
            ? event.stats[index]
            : Number.NaN
        );

        if (Number.isFinite(value)) {
          seen.add(id);
          values.push(value);
        }
      }
    }
  }

  return values;
}

function projection(
  values: number[]
) {
  const recent = values.slice(-10);

  if (!recent.length) return null;

  let total = 0;
  let weight = 0;

  recent.forEach(
    (value, index) => {
      const currentWeight =
        index + 1;

      total +=
        value * currentWeight;

      weight += currentWeight;
    }
  );

  return Math.round(
    (total / weight) * 10
  ) / 10;
}

async function model(
  playerId: string,
  market: CfbMarketKey
) {
  if (
    !playerId ||
    market === "first_td"
  ) {
    return {
      projection: null,
      games: 0,
    };
  }

  const key =
    `${playerId}|${market}`;

  const cached =
    modelCache.get(key);

  if (
    cached &&
    Date.now() - cached.at < MODEL_MS
  ) {
    return {
      projection: cached.projection,
      games: cached.games,
    };
  }

  const blocks =
    await Promise.all(
      [2025, 2026].map(
        async (season) => {
          try {
            const payload =
              await fetchJson(
                `${ATHLETE_BASE}/${encodeURIComponent(playerId)}/gamelog?season=${season}`,
                2500
              );

            return history(
              payload,
              market
            );
          } catch {
            return [];
          }
        }
      )
    );

  const values = blocks.flat();

  const result = {
    projection: projection(values),
    games: values.length,
  };

  modelCache.set(
    key,
    {
      at: Date.now(),
      ...result,
    }
  );

  return result;
}

async function roster(
  teamId: string
) {
  const hit =
    rosterCache.get(teamId);

  if (
    hit &&
    Date.now() - hit.at < ROSTER_MS
  ) {
    return hit.value;
  }

  const value =
    await timeout(
      getCfbTeamRoster(teamId),
      3000,
      {
        teamName: "",
        teamLogo: "",
        players: [],
      }
    );

  rosterCache.set(
    teamId,
    {
      at: Date.now(),
      value,
    }
  );

  return value;
}

function rowGameTime(
  row: any,
  schedule: any[]
) {
  if (row.gameTime) {
    return String(row.gameTime);
  }

  const target =
    cleanName(
      String(row.matchup || "")
    );

  const game =
    schedule.find(
      (item: any) =>
        cleanName(
          `${item.awayTeam} @ ${item.homeTeam}`
        ) === target
    );

  return game?.date
    ? String(game.date)
    : "";
}

function gameForMatchup(
  matchup: string,
  schedule: any[]
) {
  const target =
    cleanName(matchup);

  return (
    schedule.find(
      (game: any) =>
        cleanName(
          `${game.awayTeam} @ ${game.homeTeam}`
        ) === target
    ) || null
  );
}

function gameStarted(
  game: any
) {
  if (!game) return false;

  if (
    game.completed ||
    game.state === "in" ||
    game.state === "post"
  ) {
    return true;
  }

  const kickoff =
    new Date(
      game.date || game.gameTime || 0
    ).getTime();

  return (
    Number.isFinite(kickoff) &&
    kickoff > 0 &&
    Date.now() >= kickoff
  );
}

function targetGameDay(
  schedule: any[]
) {
  const today =
    day(new Date());

  const todayGames =
    schedule.filter(
      (game: any) =>
        day(
          game.date ||
          game.gameTime ||
          ""
        ) === today
    );

  if (todayGames.length) {
    return today;
  }

  const futureDays =
    schedule
      .map(
        (game: any) =>
          day(
            game.date ||
            game.gameTime ||
            ""
          )
      )
      .filter(
        (value: string) =>
          value && value >= today
      )
      .sort();

  return (
    futureDays[0] ||
    today
  );
}

async function prefetchRosters(
  rows: any[],
  schedule: any[]
) {
  const teamIds =
    new Set<string>();

  for (const row of rows) {
    const game =
      gameForMatchup(
        String(row.matchup || ""),
        schedule
      );

    if (game?.awayTeamId) {
      teamIds.add(
        String(game.awayTeamId)
      );
    }

    if (game?.homeTeamId) {
      teamIds.add(
        String(game.homeTeamId)
      );
    }
  }

  await Promise.all(
    [...teamIds].map(
      (teamId) =>
        roster(teamId)
    )
  );
}

function playerFromRosters(
  row: any,
  schedule: any[]
) {
  const wanted =
    cleanName(row.playerName);

  const game =
    gameForMatchup(
      String(row.matchup || ""),
      schedule
    );

  const suppliedTeam =
    cleanName(
      row.teamName || ""
    );

  const teamIds: string[] = [];

  if (game) {
    if (
      suppliedTeam &&
      cleanName(game.awayTeam) ===
        suppliedTeam
    ) {
      teamIds.push(
        String(
          game.awayTeamId || ""
        )
      );
    }

    if (
      suppliedTeam &&
      cleanName(game.homeTeam) ===
        suppliedTeam
    ) {
      teamIds.push(
        String(
          game.homeTeamId || ""
        )
      );
    }

    teamIds.push(
      String(
        game.awayTeamId || ""
      ),
      String(
        game.homeTeamId || ""
      )
    );
  }

  for (
    const teamId of
      [...new Set(
        teamIds.filter(Boolean)
      )]
  ) {
    const current =
      rosterCache.get(teamId)?.value;

    const player =
      current?.players.find(
        (item: any) =>
          cleanName(item.name) ===
          wanted
      ) ||
      current?.players.find(
        (item: any) => {
          const name =
            cleanName(item.name);

          return (
            name &&
            (
              name.includes(wanted) ||
              wanted.includes(name)
            )
          );
        }
      );

    if (player) {
      return {
        id: player.id,
        headshot: player.headshot,
        teamName:
          current?.teamName ||
          row.teamName ||
          "CFB",
        teamId,
        position: player.position,
        teamLogo:
          current?.teamLogo || "",
      };
    }
  }

  return {
    id: "",
    headshot: "",
    teamName:
      row.teamName || "CFB",
    teamId: "",
    position: "",
    teamLogo: "",
  };
}

function allowedPositions(
  market: CfbMarketKey
) {
  if (
    market === "passing_yards" ||
    market === "pass_completions"
  ) {
    return new Set(["QB"]);
  }

  if (
    market === "rushing_yards"
  ) {
    return new Set([
      "QB",
      "RB",
      "FB",
    ]);
  }

  if (
    market === "receiving_yards" ||
    market === "receptions"
  ) {
    return new Set([
      "WR",
      "TE",
      "RB",
      "FB",
    ]);
  }

  return new Set([
    "QB",
    "RB",
    "FB",
    "WR",
    "TE",
  ]);
}

async function marketRows(
  market: CfbMarketKey
) {
  try {
    const rows =
      await timeout(
        getOwlsCfbRows(market),
        4000,
        []
      );

    if (rows.length) {
      return rows;
    }
  } catch {}

  const sportsbook =
    await timeout(
      getCfbMarketRows(market),
      4000,
      []
    );

  if (sportsbook.length) {
    return sportsbook;
  }

  const early =
    await timeout(
      getCfbRankings(market),
      6000,
      []
    );

  return early
    .filter(
      (row: any) =>
        row.matchup &&
        row.gameTime
    )
    .map(
      (row: any) => ({
        eventId: "",
        matchup: row.matchup,
        gameTime: row.gameTime,
        playerName: row.playerName,
        teamName: row.teamName,
        line: null,
        price: null,
        prob: null,
        bookmakerCount: 0,
        earlyModel: true,
      })
    );
}

async function rosterFallbackRows(
  market: CfbMarketKey,
  schedule: any[],
  existing: any[],
  gameDay: string,
  slate: SlateKey
) {
  const seen =
    new Set(
      existing.map(
        (row: any) =>
          `${cleanName(row.playerName)}|${cleanName(row.matchup)}`
      )
    );

  const positions =
    allowedPositions(market);

  const games =
    schedule
      .filter(
        (game: any) => {
          const gameTime =
            String(
              game.date ||
              game.gameTime ||
              ""
            );

          return (
            day(gameTime) ===
              gameDay &&
            inSlate(
              gameTime,
              slate
            )
          );
        }
      )
      .sort(
        (a: any, b: any) =>
          new Date(a.date || 0).getTime() -
          new Date(b.date || 0).getTime()
      );

  const teamJobs: any[] = [];

  for (
    const game of
      games.slice(0, 40)
  ) {
    if (game.awayTeamId) {
      teamJobs.push({
        game,
        teamId:
          String(game.awayTeamId),
        teamName:
          game.awayTeam,
      });
    }

    if (game.homeTeamId) {
      teamJobs.push({
        game,
        teamId:
          String(game.homeTeamId),
        teamName:
          game.homeTeam,
      });
    }
  }

  await Promise.all(
    teamJobs.map(
      (job) =>
        roster(job.teamId)
    )
  );

  const out: any[] = [];

  for (
    const {
      game,
      teamId,
      teamName,
    } of teamJobs
  ) {
    const current =
      rosterCache.get(teamId)?.value;

    if (
      !current?.players?.length
    ) {
      continue;
    }

    const matchup =
      `${game.awayTeam} @ ${game.homeTeam}`;

    for (
      const player of
        current.players
    ) {
      const position =
        String(
          player.position || ""
        ).toUpperCase();

      if (
        !positions.has(position)
      ) {
        continue;
      }

      const key =
        `${cleanName(player.name)}|${cleanName(matchup)}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);

      out.push({
        eventId:
          String(game.id || ""),
        matchup,
        gameTime:
          game.date ||
          game.gameTime ||
          "",
        playerName:
          player.name,
        teamName:
          current.teamName ||
          teamName,
        line: null,
        price: null,
        prob: null,
        bookmakerCount: 0,
        earlyModel: true,
      });
    }
  }

  return out;
}

function decorateGameState(
  row: any,
  schedule: any[]
) {
  const game =
    gameForMatchup(
      String(row.matchup || ""),
      schedule
    );

  if (!game) return row;

  const started =
    gameStarted(game);

  return {
    ...row,
    gameId:
      String(game.id || ""),
    gameState:
      game.completed
        ? "post"
        : started
          ? "in"
          : "pre",
    gameStatus:
      String(
        game.status ||
        (
          game.completed
            ? "Final"
            : started
              ? "In Progress"
              : "Scheduled"
        )
      ),
    lineupConfirmed:
      started ||
      row.lineupConfirmed === true,
  };
}

async function buildFreshBoard(
  market: CfbMarketKey,
  slate: SlateKey,
  schedule: any[],
  gameDay: string
) {
  const initialRaw =
    await marketRows(market);

  const scopedRaw =
    initialRaw.filter(
      (row: any) => {
        const gameTime =
          rowGameTime(
            row,
            schedule
          );

        return (
          gameTime &&
          day(gameTime) === gameDay &&
          inSlate(
            gameTime,
            slate
          )
        );
      }
    );

  const supplement =
    await timeout(
      rosterFallbackRows(
        market,
        schedule,
        scopedRaw,
        gameDay,
        slate
      ),
      6500,
      []
    );

  const raw = [
    ...scopedRaw,
    ...supplement,
  ];

  const candidateLimit =
    slate === "all"
      ? 90
      : 70;

  const candidates =
    raw
      .map(
        (row: any) => ({
          ...row,
          _seed: cfbGiScore(
            row.prob ?? 50,
            row.bookmakerCount || 0,
            0
          ),
        })
      )
      .sort(
        (a: any, b: any) =>
          b._seed - a._seed
      )
      .slice(
        0,
        candidateLimit
      );

  await prefetchRosters(
    candidates,
    schedule
  );

  const enriched =
    await Promise.all(
      candidates.map(
        async (row: any) => {
          const profile =
            playerFromRosters(
              row,
              schedule
            );

          const recent =
            await model(
              profile.id,
              market
            );

          const probability =
            cfbPredictionProbability(
              market,
              recent.projection,
              row.line,
              row.prob
            );

          const earlyConfidence =
            row.earlyModel &&
            recent.projection != null
              ? Math.round(
                  Math.min(
                    84,
                    58 +
                      Math.min(
                        26,
                        recent.games * 2.6
                      )
                  ) * 10
                ) / 10
              : null;

          const rankingProbability =
            probability ??
            row.prob ??
            earlyConfidence ??
            50;

          return decorateGameState(
            {
              rank: 0,
              playerId:
                profile.id ||
                cleanName(
                  row.playerName
                ),
              playerName:
                row.playerName,
              teamName:
                profile.teamName ||
                row.teamName ||
                "CFB",
              teamId:
                profile.teamId,
              position:
                profile.position,
              headshot:
                profile.headshot,
              teamLogo:
                profile.teamLogo,
              matchup:
                row.matchup,
              gameTime:
                rowGameTime(
                  row,
                  schedule
                ) ||
                row.gameTime,
              giScore:
                cfbGiScore(
                  rankingProbability,
                  row.bookmakerCount || 0,
                  recent.games
                ),
              modelProbability:
                probability ??
                earlyConfidence ??
                rankingProbability,
              sportsbookLine:
                row.line,
              sportsbookProbability:
                row.prob,
              bookmakerCount:
                row.bookmakerCount || 0,
              perGame:
                recent.projection,
              modelProjection:
                recent.projection,
              projectionGames:
                recent.games,
              seasonTotal: null,
              gamesPlayed:
                recent.games,
              season: 2026,
              summary:
                row.earlyModel
                  ? `Early Sach projection using ${recent.games} verified historical game${recent.games === 1 ? "" : "s"}. Sportsbook player props have not posted yet; no line or odds were invented.`
                  : `Sportsbook-backed ${
                      CFB_MARKETS.find(
                        (item) =>
                          item[0] === market
                      )?.[2] ||
                      market
                    } prediction using ${recent.games} verified historical game${recent.games === 1 ? "" : "s"} and ${row.bookmakerCount || 0} sportsbook${(row.bookmakerCount || 0) === 1 ? "" : "s"}.`,
              marketBacked:
                !row.earlyModel,
            },
            schedule
          );
        }
      )
    );

  const valid =
    enriched.filter(
      (row: any) => {
        const value =
          Number(
            row.modelProjection
          );

        return (
          row.modelProjection != null &&
          Number.isFinite(value) &&
          value >= 0
        );
      }
    );

  valid.sort(
    (a: any, b: any) =>
      Number(b.giScore || 0) -
      Number(a.giScore || 0)
  );

  return valid
    .slice(0, 25)
    .map(
      (row: any, index: number) => ({
        ...row,
        rank: index + 1,
      })
    );
}

async function lockBoard(
  market: CfbMarketKey,
  slate: SlateKey,
  gameDay: string,
  fresh: any[],
  schedule: any[]
) {
  const state =
    await readBoardState(
      market,
      slate,
      gameDay
    );

  const previous =
    Array.isArray(state?.rows)
      ? state!.rows
      : [];

  const lockedMap =
    new Map<string, any>();

  for (
    const row of
      Object.values(
        state?.locked || {}
      )
  ) {
    if (!row) continue;

    lockedMap.set(
      rowKey(row),
      row
    );
  }

  /*
    The PREVIOUS persisted board is the authority at kickoff.
    Even if the sportsbook removes the prop or a fresh ranking would
    drop the player, the prior visible card is what gets locked.
  */
  for (
    const row of previous
  ) {
    const game =
      gameForMatchup(
        String(row.matchup || ""),
        schedule
      );

    if (
      !gameStarted(game)
    ) {
      continue;
    }

    const key =
      rowKey(row);

    if (
      !lockedMap.has(key)
    ) {
      lockedMap.set(
        key,
        decorateGameState(
          {
            ...row,
            frozen: true,
            lockedAtKickoff: true,
            lineupConfirmed: true,
            summary:
              row.summary ||
              "Top 25 position and pregame prediction locked at kickoff.",
          },
          schedule
        )
      );
    }
  }

  /*
    Safety for the first-ever request after kickoff. If there is no older
    board on disk yet, freeze the first observed live card and keep it from
    moving again.
  */
  for (
    const row of fresh
  ) {
    const game =
      gameForMatchup(
        String(row.matchup || ""),
        schedule
      );

    if (
      !gameStarted(game)
    ) {
      continue;
    }

    const key =
      rowKey(row);

    if (
      !lockedMap.has(key)
    ) {
      lockedMap.set(
        key,
        decorateGameState(
          {
            ...row,
            frozen: true,
            lockedAtKickoff: true,
            lineupConfirmed: true,
          },
          schedule
        )
      );
    }
  }

  const locked =
    [...lockedMap.values()]
      .filter(
        (row: any) =>
          Number(row.rank) >= 1 &&
          Number(row.rank) <= 25
      )
      .sort(
        (a: any, b: any) =>
          Number(a.rank) -
          Number(b.rank)
      )
      .slice(0, 25);

  const lockedKeys =
    new Set(
      locked.map(rowKey)
    );

  const lockedRanks =
    new Set(
      locked.map(
        (row: any) =>
          Number(row.rank)
      )
    );

  const freshRemaining =
    fresh.filter(
      (row: any) =>
        !lockedKeys.has(
          rowKey(row)
        )
    );

  const merged: any[] =
    [...locked];

  let freshIndex = 0;

  for (
    let slot = 1;
    slot <= 25 &&
    freshIndex <
      freshRemaining.length;
    slot += 1
  ) {
    if (
      lockedRanks.has(slot)
    ) {
      continue;
    }

    merged.push({
      ...freshRemaining[
        freshIndex
      ],
      rank: slot,
    });

    freshIndex += 1;
  }

  const previousRanks =
    new Map(
      previous.map(
        (row: any) => [
          rowKey(row),
          Number(row.rank),
        ]
      )
    );

  const rows =
    merged
      .sort(
        (a: any, b: any) =>
          Number(a.rank) -
          Number(b.rank)
      )
      .slice(0, 25)
      .map(
        (row: any) => {
          const oldRank =
            previousRanks.get(
              rowKey(row)
            );

          const isLocked =
            lockedKeys.has(
              rowKey(row)
            );

          return decorateGameState(
            {
              ...row,
              movement:
                isLocked
                  ? 0
                  : oldRank == null
                    ? "NEW"
                    : oldRank -
                      Number(
                        row.rank
                      ),
            },
            schedule
          );
        }
      );

  const lockedRecord =
    Object.fromEntries(
      [...lockedMap.entries()]
    );

  const nextState: BoardState = {
    day: gameDay,
    market,
    slate,
    rows,
    locked: lockedRecord,
    updatedAt:
      new Date().toISOString(),
  };

  const diskSaved =
    await writeBoardState(
      nextState
    );

  return {
    rows,
    lockSource:
      diskSaved
        ? "Railway volume"
        : "runtime memory",
  };
}

async function build(
  market: CfbMarketKey,
  slate: SlateKey
): Promise<BoardPayload> {
  const schedule =
    await timeout(
      getEspnCfbSchedule(),
      5000,
      []
    );

  const gameDay =
    targetGameDay(schedule);

  const fresh =
    await buildFreshBoard(
      market,
      slate,
      schedule,
      gameDay
    );

  const locked =
    await lockBoard(
      market,
      slate,
      gameDay,
      fresh,
      schedule
    );

  const rows =
    locked.rows;

  const sportsbookOnly =
    rows.length > 0 &&
    rows.every(
      (row: any) =>
        row.marketBacked === true
    );

  return {
    success: true,
    source:
      sportsbookOnly
        ? "Owls Insight + CFB hard-lock board"
        : "Sach Model + ESPN + CFB hard-lock board",
    market,
    slate,
    slateLabel:
      SLATE_LABELS[slate],
    rows,
    sportsbookOnly,
    validRankingCount:
      rows.length,
    updatedAt:
      new Date().toISOString(),
    lockSource:
      locked.lockSource,
  };
}

async function getPayload(
  market: CfbMarketKey,
  slate: SlateKey
) {
  const key =
    `${market}|${slate}`;

  const cached =
    cache.get(key);

  const age =
    cached
      ? Date.now() - cached.at
      : Number.POSITIVE_INFINITY;

  if (
    cached &&
    age < FRESH_MS
  ) {
    return {
      ...cached.payload,
      cached: true,
    };
  }

  const running =
    inflight.get(key);

  if (
    cached &&
    age < STALE_MS
  ) {
    if (!running) {
      const work =
        build(
          market,
          slate
        )
          .then(
            (payload) => {
              cache.set(
                key,
                {
                  at: Date.now(),
                  payload,
                }
              );

              return payload;
            }
          )
          .finally(
            () =>
              inflight.delete(key)
          );

      inflight.set(
        key,
        work
      );
    }

    /*
      Returning the prior board while the refresh runs is intentional:
      the visible ranks do not jump during an in-flight rebuild.
    */
    return {
      ...cached.payload,
      cached: true,
      stale: true,
    };
  }

  if (running) {
    return await running;
  }

  const work =
    build(
      market,
      slate
    )
      .then(
        (payload) => {
          cache.set(
            key,
            {
              at: Date.now(),
              payload,
            }
          );

          return payload;
        }
      )
      .finally(
        () =>
          inflight.delete(key)
      );

  inflight.set(
    key,
    work
  );

  return await work;
}

function normalizeSlate(
  value: string | null
): SlateKey {
  if (
    value === "early" ||
    value === "afternoon" ||
    value === "evening"
  ) {
    return value;
  }

  return "all";
}

export async function GET(
  req: NextRequest
) {
  const market =
    (
      req.nextUrl.searchParams.get(
        "market"
      ) ||
      "passing_yards"
    ) as CfbMarketKey;

  const slate =
    normalizeSlate(
      req.nextUrl.searchParams.get(
        "slate"
      )
    );

  if (
    !CFB_MARKETS.some(
      (item) =>
        item[0] === market
    )
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Unsupported CFB market",
      },
      { status: 400 }
    );
  }

  try {
    const payload =
      await timeout(
        getPayload(
          market,
          slate
        ),
        12_000,
        null as BoardPayload | null
      );

    if (payload) {
      return NextResponse.json(
        payload,
        {
          headers: {
            "Cache-Control":
              "no-store, no-cache, must-revalidate, max-age=0",
          },
        }
      );
    }

    const cached =
      cache.get(
        `${market}|${slate}`
      );

    if (cached) {
      return NextResponse.json(
        {
          ...cached.payload,
          cached: true,
          stale: true,
        }
      );
    }

    return NextResponse.json(
      {
        success: false,
        source:
          "CFB hard-lock board",
        market,
        slate,
        slateLabel:
          SLATE_LABELS[slate],
        rows: [],
        sportsbookOnly: false,
        validRankingCount: 0,
        error:
          "CFB board build timed out; retrying.",
      },
      { status: 503 }
    );
  } catch (error) {
    const cached =
      cache.get(
        `${market}|${slate}`
      );

    if (cached) {
      return NextResponse.json(
        {
          ...cached.payload,
          cached: true,
          stale: true,
        }
      );
    }

    return NextResponse.json(
      {
        success: false,
        source:
          "CFB hard-lock board",
        market,
        slate,
        slateLabel:
          SLATE_LABELS[slate],
        rows: [],
        sportsbookOnly: false,
        validRankingCount: 0,
        error:
          error instanceof Error
            ? error.message
            : "CFB ranking board unavailable",
      },
      { status: 500 }
    );
  }
}
