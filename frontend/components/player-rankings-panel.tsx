"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import styles from "./player-rankings.module.css";

export type RankingsSport =
  | "mlb"
  | "nfl"
  | "cfb"
  | "nba"
  | "wnba"
  | "nhl"
  | "soccer"
  | "cbb";

type Market = {
  key: string;
  label: string;
  icon: string;
};

type Group = {
  key: string;
  label: string;
  icon: string;
  markets: Market[];
};

type SportConfig = {
  label: string;
  groups: Group[];
};

type CardState = "pregame" | "live" | "final";

type RankingCard = {
  rank: number;
  playerId: string;
  playerName: string;
  teamName: string;
  position: string;
  headshot: string;
  teamLogo: string;
  matchup: string;
  gameTime: string;
  gameStatus: string;
  gameState: string;
  market: string;
  marketLabel: string;
  sportsbookLine: number | null;
  openingLine: number | null;
  modelProjection: number | null;
  modelProbability: number | null;
  giScore: number | null;
  prediction: string;
  summary: string;
  movement: "new" | "up" | "down" | "same";
  movementAmount: number | null;
  lineupStatus: "Confirmed" | "Pending";
  bookmakerCount: number | null;
  actual: number | null;
  resultStatus: string;
  liveCurrent: number | null;
  liveProgressPct: number | null;
  recentValues: number[];
  usage: Array<{ label: string; value: string }>;
  raw: any;
};

const MLB_BATTER: Market[] = [
  { key: "home_runs", label: "Home Runs", icon: "🔥" },
  { key: "hits", label: "Hits", icon: "⚾" },
  { key: "total_bases", label: "Total Bases", icon: "💥" },
  { key: "runs", label: "Runs", icon: "🏃" },
  { key: "rbis", label: "RBIs", icon: "🎯" },
  { key: "hits_runs_rbis", label: "Hits + Runs + RBIs", icon: "📊" },
  { key: "walks", label: "Walks", icon: "👟" },
  { key: "stolen_bases", label: "Stolen Bases", icon: "⚡" },
  { key: "batter_strikeouts", label: "Batter Strikeouts", icon: "K" },
];

const MLB_PITCHER: Market[] = [
  { key: "strikeouts", label: "Strikeouts", icon: "K" },
  { key: "outs_recorded", label: "Outs Recorded", icon: "🎯" },
  { key: "hits_allowed", label: "Hits Allowed", icon: "⚾" },
  { key: "walks_allowed", label: "Walks Allowed", icon: "👟" },
  { key: "earned_runs", label: "Earned Runs", icon: "📊" },
];

const NFL_QB: Market[] = [
  { key: "passing_yards", label: "Passing Yards", icon: "🏈" },
  { key: "passing_tds", label: "Passing TDs", icon: "🎯" },
  { key: "qb_rushing_yards", label: "QB Rushing Yards", icon: "🏃" },
  { key: "passing_rushing_yards", label: "Pass + Rush Yards", icon: "⚡" },
];

const NFL_OFFENSE: Market[] = [
  { key: "anytime_td", label: "Anytime TD", icon: "🔥" },
  { key: "first_td", label: "First TD", icon: "1️⃣" },
  { key: "receiving_yards", label: "Receiving Yards", icon: "🙌" },
  { key: "receptions", label: "Receptions", icon: "🧤" },
  { key: "rushing_yards", label: "Rushing Yards", icon: "🏃" },
  { key: "rushing_tds", label: "Rushing TDs", icon: "🏁" },
  { key: "rushing_receiving_yards", label: "Rush + Receiving", icon: "🔀" },
];

const NFL_Q1: Market[] = [
  { key: "q1_passing_yards", label: "Q1 Passing Yards", icon: "⏱️" },
  { key: "q1_receiving_yards", label: "Q1 Receiving Yards", icon: "⏱️" },
  { key: "q1_receptions", label: "Q1 Receptions", icon: "⏱️" },
  { key: "q1_qb_rushing_yards", label: "Q1 QB Rush Yards", icon: "⏱️" },
  { key: "q1_rushing_yards", label: "Q1 Rushing Yards", icon: "⏱️" },
  { key: "q1_pass_attempts", label: "Q1 Pass Attempts", icon: "⏱️" },
  { key: "q1_pass_completions", label: "Q1 Pass Completions", icon: "⏱️" },
  { key: "q1_rushing_receiving_yards", label: "Q1 Rush + Rec", icon: "⏱️" },
  { key: "q1_anytime_td", label: "Q1 Anytime TD", icon: "⏱️" },
  { key: "q1_rush_attempts", label: "Q1 Rush Attempts", icon: "⏱️" },
];

const CFB_QB: Market[] = [
  { key: "passing_yards", label: "Passing Yards", icon: "🏈" },
  { key: "pass_completions", label: "Pass Completions", icon: "✅" },
];

const CFB_OFFENSE: Market[] = [
  { key: "rushing_yards", label: "Rushing Yards", icon: "🏃" },
  { key: "receiving_yards", label: "Receiving Yards", icon: "🙌" },
  { key: "receptions", label: "Receptions", icon: "🧤" },
  { key: "anytime_td", label: "Anytime TD", icon: "🔥" },
  { key: "first_td", label: "First TD", icon: "1️⃣" },
];

const BASKETBALL: Market[] = [
  { key: "points", label: "Points", icon: "🏀" },
  { key: "rebounds", label: "Rebounds", icon: "💪" },
  { key: "assists", label: "Assists", icon: "🎯" },
  { key: "threes_made", label: "3-Pointers", icon: "3️⃣" },
  { key: "pts_rebs_asts", label: "PRA", icon: "📊" },
  { key: "pts_rebs", label: "Points + Rebounds", icon: "➕" },
  { key: "pts_asts", label: "Points + Assists", icon: "➕" },
  { key: "rebs_asts", label: "Rebounds + Assists", icon: "➕" },
  { key: "steals", label: "Steals", icon: "🖐️" },
  { key: "blocks", label: "Blocks", icon: "🧱" },
];

const NHL: Market[] = [
  { key: "shots_on_goal", label: "Shots on Goal", icon: "🏒" },
  { key: "points", label: "Points", icon: "⭐" },
  { key: "goals", label: "Goals", icon: "🥅" },
  { key: "assists", label: "Assists", icon: "🎯" },
  { key: "blocked_shots", label: "Blocked Shots", icon: "🛡️" },
  { key: "goalie_saves", label: "Goalie Saves", icon: "🧤" },
];

const SOCCER: Market[] = [
  { key: "shots_on_target", label: "Shots on Target", icon: "🎯" },
  { key: "shots", label: "Shots", icon: "👟" },
  { key: "saves", label: "Goalkeeper Saves", icon: "🧤" },
  { key: "goals", label: "Goals", icon: "⚽" },
  { key: "assists", label: "Assists", icon: "🅰️" },
];

const CONFIG: Record<RankingsSport, SportConfig> = {
  mlb: {
    label: "MLB",
    groups: [
      { key: "Batter", label: "Batter", icon: "⚾", markets: MLB_BATTER },
      { key: "Pitcher", label: "Pitcher", icon: "🥎", markets: MLB_PITCHER },
    ],
  },
  nfl: {
    label: "NFL",
    groups: [
      { key: "QB", label: "QB", icon: "🏈", markets: NFL_QB },
      { key: "Offense", label: "Offense", icon: "🏃", markets: NFL_OFFENSE },
      { key: "Q1", label: "Q1", icon: "⏱️", markets: NFL_Q1 },
    ],
  },
  cfb: {
    label: "CFB",
    groups: [
      { key: "QB", label: "QB", icon: "🏈", markets: CFB_QB },
      { key: "Offense", label: "Offense", icon: "🏃", markets: CFB_OFFENSE },
    ],
  },
  nba: {
    label: "NBA",
    groups: [
      {
        key: "Props",
        label: "Props",
        icon: "🏀",
        markets: BASKETBALL,
      },
    ],
  },
  wnba: {
    label: "WNBA",
    groups: [{ key: "Props", label: "Props", icon: "🏀", markets: BASKETBALL }],
  },
  nhl: {
    label: "NHL",
    groups: [{ key: "Props", label: "Props", icon: "🏒", markets: NHL }],
  },
  soccer: {
    label: "Soccer",
    groups: [{ key: "Props", label: "Props", icon: "⚽", markets: SOCCER }],
  },
  cbb: {
    label: "CBB",
    groups: [{ key: "Props", label: "Props", icon: "🏀", markets: BASKETBALL }],
  },
};

const LEAGUES = [
  ["Premier League", "eng.1"],
  ["MLS", "usa.1"],
  ["Champions League", "uefa.champions"],
  ["La Liga", "esp.1"],
  ["Serie A", "ita.1"],
  ["Bundesliga", "ger.1"],
  ["Ligue 1", "fra.1"],
] as const;

function finite(value: any): number | null {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clean(value: any) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function torontoDay(value: Date | string | number = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value || "";

  return `${get("year")}-${get("month")}-${get("day")}`;
}

function gameTimeLabel(value: string) {
  if (!value) return "Game time TBD";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Toronto",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function shortNumber(value: number | null, digits = 1) {
  if (value == null) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(digits);
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "SS";
  return (
    parts.length === 1
      ? parts[0].slice(0, 2)
      : `${parts[0][0]}${parts[parts.length - 1][0]}`
  ).toUpperCase();
}

function pickText(
  row: any,
  line: number | null,
  projection: number | null,
  probability: number | null = null
) {
  const direct = String(
    row?.prediction ?? row?.pickSide ?? row?.pick ?? ""
  ).toUpperCase();

  if (direct) return direct;
  if (line != null && projection != null) return projection >= line ? "OVER" : "UNDER";
  if (line != null && probability != null) return probability >= 50 ? "OVER" : "UNDER";
  return "—";
}

function movementFrom(row: any) {
  const raw = row?.movement;

  if (typeof raw === "number") {
    if (raw > 0) return { movement: "up" as const, amount: Math.abs(raw) };
    if (raw < 0) return { movement: "down" as const, amount: Math.abs(raw) };
    return { movement: "same" as const, amount: null };
  }

  const value = String(raw || "").toLowerCase();

  if (value === "new") return { movement: "new" as const, amount: null };
  if (value === "up") {
    const previous = finite(row?.previousRank);
    const current = finite(row?.rank);
    return {
      movement: "up" as const,
      amount: previous != null && current != null ? Math.max(1, previous - current) : 1,
    };
  }
  if (value === "down") {
    const previous = finite(row?.previousRank);
    const current = finite(row?.rank);
    return {
      movement: "down" as const,
      amount: previous != null && current != null ? Math.max(1, current - previous) : 1,
    };
  }

  if (value === "new") return { movement: "new" as const, amount: null };
  if (String(raw || "").toUpperCase() === "NEW") {
    return { movement: "new" as const, amount: null };
  }

  return { movement: "same" as const, amount: null };
}

function recentValues(row: any): number[] {
  const candidates = [
    row?.recentValues,
    row?.recent_values,
    row?.last10,
    row?.last_10,
    row?.recentGames,
    row?.recent_games,
    row?.gameLog,
  ];

  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;

    const values = candidate
      .map((item: any) =>
        finite(
          typeof item === "number"
            ? item
            : item?.value ?? item?.actual ?? item?.stat ?? item?.result
        )
      )
      .filter((value): value is number => value != null);

    if (values.length) return values.slice(-20);
  }

  return [];
}

function usageRows(row: any) {
  const source = [
    ["Targets", row?.targets ?? row?.avgTargets],
    ["Carries", row?.carries ?? row?.avgCarries],
    ["Receptions", row?.receptions ?? row?.avgReceptions],
    ["Minutes", row?.expectedMinutes ?? row?.avgMinutes],
    ["Shots", row?.shots ?? row?.avgShots],
    ["At Bats", row?.at_bats ?? row?.avgAtBats],
    ["Books", row?.bookmakerCount],
  ] as const;

  return source
    .map(([label, value]) => ({ label, value: finite(value) }))
    .filter((item) => item.value != null)
    .slice(0, 3)
    .map((item) => ({
      label: item.label,
      value: shortNumber(item.value),
    }));
}

function resultForPlayer(payload: any, row: any) {
  const rows = [
    ...(Array.isArray(payload?.predictions) ? payload.predictions : []),
    ...(Array.isArray(payload?.results) ? payload.results : []),
  ];

  const id = String(row?.playerId ?? row?.player_id ?? row?.batter_id ?? "");
  const name = clean(row?.playerName ?? row?.player_name ?? row?.player);

  return (
    rows.find((item: any) => {
      const itemId = String(item?.playerId ?? item?.player_id ?? item?.batter_id ?? "");
      return id && itemId && id === itemId;
    }) ||
    rows.find((item: any) => {
      const itemName = clean(item?.playerName ?? item?.player_name ?? item?.player);
      return name && itemName === name;
    }) ||
    null
  );
}

function normalizeResultStatus(value: any) {
  const status = String(value || "").toLowerCase();
  if (status.includes("hit")) return "hit";
  if (status.includes("miss")) return "miss";
  if (status.includes("push")) return "push";
  if (status.includes("void")) return "void";
  return status;
}

function marketActualValue(
  result: any,
  row: any,
  marketKey: string
) {
  const mlbActual: Record<string, any> = {
    home_runs:
      result?.actual_home_runs ??
      row?.actual_home_runs,
    hits:
      result?.actual_hits ??
      row?.actual_hits,
    total_bases:
      result?.actual_total_bases ??
      row?.actual_total_bases,
    runs:
      result?.actual_runs ??
      row?.actual_runs,
    rbis:
      result?.actual_rbis ??
      row?.actual_rbis,
    walks:
      result?.actual_walks ??
      row?.actual_walks,
    stolen_bases:
      result?.actual_stolen_bases ??
      row?.actual_stolen_bases,
    hits_runs_rbis:
      result?.actual_hits_runs_rbis ??
      row?.actual_hits_runs_rbis,
    batter_strikeouts:
      result?.actual_batter_strikeouts ??
      row?.actual_batter_strikeouts,
  };

  return finite(
    mlbActual[marketKey] ??
      result?.actual ??
      row?.actualResult ??
      row?.actual ??
      row?.liveCurrent
  );
}

function isBinaryEventMarket(marketKey: string) {
  return marketKey === "home_runs";
}

function deriveState(row: any, result: any): CardState {
  const status = normalizeResultStatus(
    result?.status ??
      row?.resultStatus ??
      row?.status
  );

  const state = String(
    row?.gameState ??
      row?.state ??
      ""
  ).toLowerCase();

  if (
    ["hit", "miss", "push", "void"].includes(status) ||
    state === "post" ||
    state === "final" ||
    row?.completed === true ||
    row?.isFinal === true
  ) {
    return "final";
  }

  if (
    state === "in" ||
    state === "live" ||
    row?.isLive === true ||
    row?.result_live === true
  ) {
    return "live";
  }

  return "pregame";
}

function statusSymbol(status: string) {
  if (status === "hit") return "✅ HIT";
  if (status === "miss") return "❌ MISS";
  if (status === "push") return "➖ PUSH";
  if (status === "void") return "VOID";
  return "FINAL";
}

function normalizeCard(
  row: any,
  sport: RankingsSport,
  market: Market,
  result: any,
  game?: any
): RankingCard {
  const line = finite(
    row?.sportsbookLine ??
      row?.sportsbook_line ??
      row?.marketLine ??
      row?.line ??
      result?.sportsbookLine
  );

  const projection = finite(
    row?.modelProjection ??
      row?.projection ??
      row?.perGame ??
      row?.modelTarget
  );

  const probability = finite(
    row?.modelProbability ??
      row?.probability ??
      row?.home_run_probability ??
      row?.hr_probability
  );

  const gi = finite(row?.giScore ?? row?.gi_score ?? row?.score);
  const movement = movementFrom(row);
  const actual = marketActualValue(
    result,
    row,
    market.key
  );

  const liveCurrent =
    finite(row?.liveCurrent) ??
    marketActualValue(
      result,
      row,
      market.key
    );

  const resultStatus = normalizeResultStatus(
    result?.status ??
      (
        typeof result?.correct === "boolean"
          ? result.correct
            ? "hit"
            : "miss"
          : null
      ) ??
      row?.resultStatus ??
      row?.resultSymbol
  );

  const progress =
    finite(row?.liveProgressPct) ??
    (
      isBinaryEventMarket(market.key) &&
      liveCurrent != null
        ? liveCurrent >= 1
          ? 100
          : 0
        : liveCurrent != null && line != null && line > 0
          ? Math.max(0, Math.min(200, (liveCurrent / line) * 100))
          : null
    );

  const lineupConfirmed =
    row?.lineup_confirmed === true ||
    row?.lineupConfirmed === true ||
    row?.confirmed === true ||
    row?.starterConfirmed === true ||
    row?.frozen === true ||
    row?.lockedAtKickoff === true ||
    row?.lockedAtPuckDrop === true ||
    String(row?.availability || "").toLowerCase().includes("start");

  const gameState =
    String(
      game?.state ??
        row?.gameState ??
        row?.state ??
        (game?.completed ? "post" : "")
    ) || "pre";

  const rawName =
    row?.playerName ??
    row?.player_name ??
    row?.player ??
    row?.pitcher_name ??
    "Player";

  const team =
    row?.teamName ??
    row?.team_name ??
    row?.team_abbreviation ??
    row?.team ??
    sport.toUpperCase();

  const opponent =
    row?.opponent_abbreviation ??
    row?.opponent_name ??
    row?.opponent ??
    "";

  const matchup =
    row?.matchup ||
    (
      opponent
        ? `${team} vs ${opponent}`
        : String(game?.matchup || "")
    );

  return {
    rank: Number(row?.rank || 0) || 0,
    playerId: String(
      row?.playerId ??
        row?.player_id ??
        row?.batter_id ??
        row?.pitcher_id ??
        clean(rawName)
    ),
    playerName: String(rawName),
    teamName: String(team),
    position: String(row?.position || ""),
    headshot: String(
      row?.headshot ??
        row?.headshot_url ??
        row?.photoUrl ??
        row?.photo_url ??
        ""
    ),
    teamLogo: String(
      row?.teamLogo ??
        row?.team_logo ??
        row?.team_logo_url ??
        ""
    ),
    matchup: String(matchup || ""),
    gameTime: String(
      game?.kickoff ??
        game?.tipoff ??
        game?.startTime ??
        row?.gameTime ??
        row?.game_time ??
        row?.kickoff ??
        ""
    ),
    gameStatus: String(
      game?.status ??
        row?.gameStatus ??
        row?.game_status ??
        ""
    ),
    gameState,
    market: market.key,
    marketLabel: market.label,
    sportsbookLine: line,
    openingLine: finite(
      row?.openingLine ??
        row?.opening_line ??
        row?.openLine ??
        row?.open_line
    ),
    modelProjection: projection,
    modelProbability: probability,
    giScore: gi,
    prediction:
      isBinaryEventMarket(market.key) &&
      line == null &&
      probability != null
        ? "YES"
        : pickText(
            row,
            line,
            projection,
            probability
          ),
    summary: String(
      row?.summary ??
        row?.why ??
        row?.ranking_reason ??
        row?.why_this_player ??
        "Sach Sports combines recent production, matchup context, role and sample reliability."
    ),
    movement: movement.movement,
    movementAmount: movement.amount,
    lineupStatus: lineupConfirmed ? "Confirmed" : "Pending",
    bookmakerCount: finite(row?.bookmakerCount ?? row?.bookmaker_count),
    actual,
    resultStatus,
    liveCurrent,
    liveProgressPct: progress,
    recentValues: recentValues(row),
    usage: usageRows(row),
    raw: row,
  };
}

const PRICE_ONLY_MARKETS = new Set([
  "home_runs",
  "anytime_td",
  "first_td",
  "q1_anytime_td",
]);

function isGradeablePrediction(card: RankingCard) {
  if (!card.playerName || card.playerName === "Player") return false;

  if (
    card.raw?.marketBacked === false &&
    card.modelProjection != null
  ) {
    return true;
  }

  if (PRICE_ONLY_MARKETS.has(card.market)) {
    return (
      card.prediction !== "—" &&
      (
        card.bookmakerCount != null && card.bookmakerCount > 0 ||
        card.modelProbability != null ||
        card.sportsbookLine != null
      )
    );
  }

  return (
    card.sportsbookLine != null &&
    (card.modelProjection != null || card.modelProbability != null) &&
    card.prediction !== "—"
  );
}

function splitReasons(summary: string) {
  return summary
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3);
}

function movementLabel(card: RankingCard) {
  if (card.movement === "new") return "NEW";
  if (card.movement === "up") return `↑ ${card.movementAmount || 1}`;
  if (card.movement === "down") return `↓ ${card.movementAmount || 1}`;
  return "";
}

function movementClass(card: RankingCard) {
  if (card.movement === "up") return styles.moveUp;
  if (card.movement === "down") return styles.moveDown;
  if (card.movement === "new") return styles.moveNew;
  return styles.moveSame;
}

function useHorizontalScroll() {
  const ref = useRef<HTMLDivElement | null>(null);
  return {
    ref,
    more: () => ref.current?.scrollBy({ left: 240, behavior: "smooth" }),
  };
}


const NATIVE_HISTORY_SPORTS = new Set<RankingsSport>([
  "nfl",
  "cfb",
  "nba",
  "wnba",
  "cbb",
]);

const recentFormCache = new Map<string, number[]>();

async function loadRecentFormForCard(
  card: RankingCard,
  sport: RankingsSport,
  league: string,
  signal: AbortSignal
) {
  const key = `${sport}|${league}|${card.playerId}|${card.market}`;
  const cached = recentFormCache.get(key);
  if (cached) return cached;

  let url = "";

  if (NATIVE_HISTORY_SPORTS.has(sport)) {
    url =
      `/api/${sport}/player/${encodeURIComponent(card.playerId)}/history` +
      `?market=${encodeURIComponent(card.market)}`;
  } else {
    const params = new URLSearchParams({
      sport,
      playerId: card.playerId,
      playerName: card.playerName,
      team: card.teamName,
      market: card.market,
    });

    if (sport === "soccer" && league) {
      params.set("league", league);
    }

    url = `/api/player-history?${params.toString()}`;
  }

  const response = await fetch(url, {
    cache: "no-store",
    signal,
  });

  if (!response.ok) return [];

  const payload = await response.json();

  const values = Array.isArray(payload?.points)
    ? payload.points
        .map((point: any) => Number(point?.value))
        .filter((value: number) => Number.isFinite(value))
    : Array.isArray(payload?.values)
      ? payload.values
          .map((value: any) => Number(value))
          .filter((value: number) => Number.isFinite(value))
      : [];

  const recent = values.slice(-20);
  if (recent.length) recentFormCache.set(key, recent);
  return recent;
}

function RecentChart({
  values,
  line,
  projection,
  liveValue,
}: {
  values: number[];
  line: number | null;
  projection: number | null;
  liveValue?: number | null;
}) {
  const plotted = liveValue == null ? values : [...values, liveValue];
  if (!plotted.length) {
    return (
      <div className={styles.chartEmpty}>
        Recent game-by-game values are not available from this feed yet.
      </div>
    );
  }

  const max = Math.max(
    1,
    ...plotted,
    line || 0,
    projection || 0
  );

  return (
    <div className={styles.chart}>
      <div className={styles.chartBars}>
        {plotted.map((value, index) => (
          <div className={styles.barSlot} key={`${value}-${index}`}>
            <div
              className={`${styles.bar} ${index === plotted.length - 1 && liveValue != null ? styles.liveBar : ""}`}
              style={{ height: `${Math.max(7, (value / max) * 100)}%` }}
            />
            <span>{index === plotted.length - 1 && liveValue != null ? "Live" : `G${index + 1}`}</span>
          </div>
        ))}
      </div>

      {projection != null ? (
        <div
          className={styles.projectionMarker}
          style={{ bottom: `${Math.min(96, Math.max(4, (projection / max) * 100))}%` }}
        >
          <span>{shortNumber(projection)}</span>
        </div>
      ) : null}
    </div>
  );
}

function PlayerCard({
  card,
  sport,
  league,
}: {
  card: RankingCard;
  sport: RankingsSport;
  league: string;
}) {
  const [open, setOpen] = useState(false);
  const [formSpan, setFormSpan] = useState<5 | 10 | 20>(10);
  const [historyValues, setHistoryValues] = useState<number[]>(card.recentValues);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(card.recentValues.length >= 20);

  useEffect(() => {
    setHistoryValues(card.recentValues);
    setHistoryLoaded(card.recentValues.length >= 20);
  }, [card.playerId, card.market, card.recentValues.length]);

  useEffect(() => {
    if (!open || historyLoaded) return;

    const controller = new AbortController();
    setHistoryLoading(true);

    loadRecentFormForCard(card, sport, league, controller.signal)
      .then((values) => {
        if (values.length) setHistoryValues(values);
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) {
          setHistoryLoaded(true);
          setHistoryLoading(false);
        }
      });

    return () => controller.abort();
  }, [
    open,
    historyLoaded,
    sport,
    league,
    card.playerId,
    card.playerName,
    card.teamName,
    card.market,
  ]);

  const recentFormValues =
    (historyValues.length ? historyValues : card.recentValues).slice(-formSpan);
  const state = deriveState(card.raw, {
    status: card.resultStatus,
    actual: card.actual,
  });

  const current =
    state === "live"
      ? card.liveCurrent
      : state === "final"
        ? card.actual
        : null;

  const progress =
    card.sportsbookLine != null &&
    current != null &&
    card.sportsbookLine > 0
      ? Math.max(0, Math.min(100, (current / card.sportsbookLine) * 100))
      : Math.max(0, Math.min(100, card.liveProgressPct || 0));

  const edge =
    card.modelProjection != null && card.sportsbookLine != null
      ? card.modelProjection - card.sportsbookLine
      : null;

  const binaryEvent =
    isBinaryEventMarket(card.market);

  const result =
    card.resultStatus ||
    (
      state === "final" &&
      current != null &&
      binaryEvent
        ? current >= 1
          ? "hit"
          : "miss"
        : state === "final" &&
            current != null &&
            card.sportsbookLine != null &&
            card.prediction !== "—"
          ? card.prediction === "UNDER"
            ? current < card.sportsbookLine
              ? "hit"
              : current === card.sportsbookLine
                ? "push"
                : "miss"
            : current > card.sportsbookLine
              ? "hit"
              : current === card.sportsbookLine
                ? "push"
                : "miss"
          : ""
    );

  const reasons = splitReasons(card.summary);

  const lineMovement =
    card.openingLine != null && card.sportsbookLine != null
      ? card.sportsbookLine - card.openingLine
      : null;

  return (
    <article
      className={`${styles.card} ${
        state === "live"
          ? styles.liveCard
          : state === "final"
            ? styles.finalCard
            : ""
      } ${open ? styles.expanded : ""}`}
    >
      <div className={styles.cardTop}>
        <div className={styles.rankBox}>
          {card.rank || "—"}
        </div>

        <div className={styles.photoWrap}>
          {card.headshot ? (
            <img src={card.headshot} alt="" className={styles.photo} />
          ) : (
            <div className={styles.photoFallback}>{initials(card.playerName)}</div>
          )}

          {card.teamLogo ? (
            <img src={card.teamLogo} alt="" className={styles.teamLogo} />
          ) : null}
        </div>

        <div className={styles.identity}>
          <div className={styles.identityTop}>
            <strong>{card.playerName}</strong>
            {state === "live" ? <b className={styles.liveBadge}>LIVE</b> : null}
            {state === "final" ? <b className={styles.finalBadge}>Final</b> : null}
          </div>

          <span>
            {card.position ? `${card.position} · ` : ""}
            {card.teamName}
            {card.matchup ? ` · ${card.matchup}` : ""}
          </span>

          <small>
            {state === "live"
              ? `LIVE · ${card.gameStatus || "In Progress"}`
              : state === "final"
                ? "Final"
                : gameTimeLabel(card.gameTime)}
          </small>

          <em
            className={
              card.lineupStatus === "Confirmed"
                ? styles.confirmed
                : styles.pending
            }
          >
            {card.lineupStatus}
          </em>
        </div>

        <div className={styles.gi}>
          <span>GI</span>
          <strong>{shortNumber(card.giScore)}</strong>
        </div>
      </div>

      <div className={styles.faceMetrics}>
        <div>
          <span>
            {binaryEvent
              ? "Home Run Prop"
              : card.marketLabel}
          </span>
          <strong>
            {binaryEvent
              ? "HR YES"
              : card.sportsbookLine == null
                ? "Line —"
                : `O/U ${shortNumber(card.sportsbookLine)}`}
          </strong>
        </div>

        <div>
          <span>Sach Prediction</span>
          <strong
            className={
              card.prediction === "UNDER"
                ? styles.under
                : card.prediction === "OVER" ||
                    card.prediction === "YES"
                  ? styles.over
                  : ""
            }
          >
            {card.prediction}
          </strong>
        </div>

        <div>
          <span>
            {binaryEvent
              ? "HR Probability"
              : "Model Proj."}
          </span>
          <strong>
            {binaryEvent
              ? card.modelProbability == null
                ? "—"
                : `${shortNumber(card.modelProbability)}%`
              : shortNumber(card.modelProjection)}
          </strong>
        </div>

        <div>
          <span>GI Score</span>
          <strong>{shortNumber(card.giScore)}</strong>
        </div>
      </div>

      {state === "pregame" ? (
        <div className={styles.faceFooter}>
          {movementLabel(card) ? (
            <span className={`${styles.movement} ${movementClass(card)}`}>
              {movementLabel(card)}
            </span>
          ) : null}
          <p>{card.summary}</p>
        </div>
      ) : null}

      {state === "live" ? (
        <div className={styles.liveStrip}>
          <div>
            <strong>LIVE · {card.gameStatus || "In Progress"}</strong>
            <span>
              {current == null
                ? "Live stat pending"
                : binaryEvent
                  ? current >= 1
                    ? `✅ ${shortNumber(current)} HR`
                    : "0 HR · live"
                  : card.sportsbookLine != null
                    ? `${shortNumber(current)} / ${shortNumber(card.sportsbookLine)} · ${shortNumber(Math.max(0, card.sportsbookLine - current))} to line`
                    : `${shortNumber(current)} current`}
            </span>
          </div>
          <div className={styles.progressTrack}>
            <i style={{ width: `${progress}%` }} />
          </div>
        </div>
      ) : null}

      {state === "final" ? (
        <div className={`${styles.resultStrip} ${result === "miss" ? styles.missStrip : ""}`}>
          <strong>{statusSymbol(result)}</strong>
          <span>
            Actual {shortNumber(current)}
            {card.sportsbookLine != null && current != null
              ? ` · ${current - card.sportsbookLine >= 0 ? "+" : ""}${shortNumber(current - card.sportsbookLine)} vs line`
              : ""}
          </span>
        </div>
      ) : null}

      <button
        type="button"
        className={styles.intelButton}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        {open ? "Collapse Intelligence" : "View Intelligence"}
        <span>{open ? "⌃" : "›"}</span>
      </button>

      {open ? (
        <div className={styles.intelligence}>
          <div className={styles.expandedHeader}>
            <div>
              <b>{card.marketLabel}</b>
              <span>
                {binaryEvent
                  ? "Binary market"
                  : "O/U"}
              </span>
              <strong>
                {binaryEvent
                  ? "YES"
                  : shortNumber(card.sportsbookLine)}
              </strong>
            </div>
            <div>
              <b>
                {binaryEvent
                  ? "HR Probability"
                  : "Sach Projection"}
              </b>
              <span>Model</span>
              <strong>
                {binaryEvent
                  ? card.modelProbability == null
                    ? "—"
                    : `${shortNumber(card.modelProbability)}%`
                  : shortNumber(card.modelProjection)}
              </strong>
            </div>
            <div>
              <b>{state === "pregame" ? "Edge" : "Actual"}</b>
              <span>{state === "pregame" ? "vs line" : state === "live" ? "live" : "final"}</span>
              <strong>
                {state === "pregame"
                  ? edge == null
                    ? "—"
                    : `${edge >= 0 ? "+" : ""}${shortNumber(edge)}`
                  : shortNumber(current)}
              </strong>
            </div>
            <div>
              <b>GI</b>
              <span>Score</span>
              <strong>{shortNumber(card.giScore)}</strong>
            </div>
          </div>

          {state === "pregame" ? (
            <div className={styles.predictionBanner}>
              <div>
                <span>PREDICTION:</span>
                <strong>{card.prediction}</strong>
              </div>
              <small>
                Confidence{" "}
                <b>
                  {card.modelProbability == null
                    ? "—"
                    : `${shortNumber(card.modelProbability, 0)}%`}
                </b>
              </small>
            </div>
          ) : state === "live" ? (
            <div className={styles.predictionBanner}>
              <div>
                <span>PREDICTION:</span>
                <strong>{card.prediction}</strong>
              </div>
              <small>
                Live Progress <b>{Math.round(progress)}%</b>
              </small>
            </div>
          ) : (
            <div className={`${styles.predictionBanner} ${styles.finalBanner}`}>
              <div>
                <span>RESULT:</span>
                <strong>{statusSymbol(result)}</strong>
              </div>
              <small>
                Actual <b>{shortNumber(current)}</b>
              </small>
            </div>
          )}

          <section className={styles.intelSection}>
            <h4>{state === "final" ? "Final Insights" : state === "live" ? "Live Insights" : "Why Sach Likes This"}</h4>
            <div className={styles.reasonList}>
              {(reasons.length ? reasons : [card.summary]).map((reason, index) => (
                <p key={`${reason}-${index}`}>
                  <span>✓</span>
                  {reason}
                </p>
              ))}
            </div>
          </section>

          <section className={styles.intelSection}>
            <div className={styles.sectionTitleRow}>
              <h4>Recent Form</h4>
              <div className={styles.formTabs}>
                {([5, 10, 20] as const).map((span) => (
                  <button
                    type="button"
                    key={span}
                    className={formSpan === span ? styles.activeForm : ""}
                    onClick={() => setFormSpan(span)}
                    aria-pressed={formSpan === span}
                  >
                    Last {span}
                  </button>
                ))}
              </div>
            </div>

            {historyLoading && !recentFormValues.length ? (
              <div className={styles.chartEmpty}>
                Loading recent game-by-game form…
              </div>
            ) : (
              <RecentChart
                values={recentFormValues}
                line={card.sportsbookLine}
                projection={card.modelProjection}
                liveValue={state === "live" ? current : null}
              />
            )}
          </section>

          <section className={styles.intelSection}>
            <h4>{state === "live" ? "Matchup (Live)" : state === "final" ? "Matchup Result" : "Matchup"}</h4>
            <div className={styles.matchupBox}>
              <strong>{card.matchup || "Matchup context"}</strong>
              <p>{card.summary}</p>
            </div>
          </section>

          {card.usage.length ? (
            <section className={styles.intelSection}>
              <h4>{state === "final" ? "Final Game Stats" : state === "live" ? "Live Game Stats" : "Usage"}</h4>
              <div className={styles.usageGrid}>
                {card.usage.map((item) => (
                  <div key={item.label}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {(card.openingLine != null || card.sportsbookLine != null) ? (
            <section className={styles.intelSection}>
              <h4>Line Movement</h4>
              <div className={styles.lineMovement}>
                <div>
                  <span>Open</span>
                  <strong>{shortNumber(card.openingLine ?? card.sportsbookLine)}</strong>
                </div>
                <b>→</b>
                <div>
                  <span>{state === "pregame" ? "Current" : "Close"}</span>
                  <strong>{shortNumber(card.sportsbookLine)}</strong>
                </div>
                {lineMovement != null && lineMovement !== 0 ? (
                  <em>
                    {`${lineMovement >= 0 ? "+" : ""}${shortNumber(lineMovement)}`}
                  </em>
                ) : null}
              </div>
            </section>
          ) : null}

          <section className={styles.intelSection}>
            <h4>Injury / Status</h4>
            <div className={styles.reasonList}>
              <p>
                <span>✓</span>
                {state === "final"
                  ? "Game completed; original prediction is preserved."
                  : card.lineupStatus === "Confirmed"
                    ? "Starting status confirmed / prediction locked when required."
                    : "Starting status is still pending confirmation."}
              </p>
              {card.bookmakerCount != null ? (
                <p>
                  <span>✓</span>
                  {card.bookmakerCount} sportsbook source{card.bookmakerCount === 1 ? "" : "s"} represented.
                </p>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </article>
  );
}

type JsonCacheEntry = {
  at: number;
  payload: any;
};

const rankingJsonCache = new Map<string, JsonCacheEntry>();
const rankingJsonInflight = new Map<string, Promise<any>>();
const JSON_FRESH_MS = 45_000;
const JSON_STALE_MS = 5 * 60_000;

async function networkJson(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Ranking request failed: ${response.status}`);
  }

  const payload = await response.json();
  rankingJsonCache.set(url, { at: Date.now(), payload });
  return payload;
}

async function fetchJson(url: string, signal: AbortSignal) {
  const cached = rankingJsonCache.get(url);
  const age = cached ? Date.now() - cached.at : Number.POSITIVE_INFINITY;

  if (cached && age < JSON_FRESH_MS) {
    return cached.payload;
  }

  if (cached && age < JSON_STALE_MS) {
    if (!rankingJsonInflight.has(url)) {
      const refresh = networkJson(url)
        .catch(() => cached.payload)
        .finally(() => rankingJsonInflight.delete(url));
      rankingJsonInflight.set(url, refresh);
    }
    return cached.payload;
  }

  let running = rankingJsonInflight.get(url);
  if (!running) {
    running = networkJson(url).finally(() => rankingJsonInflight.delete(url));
    rankingJsonInflight.set(url, running);
  }

  if (signal.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  return await running;
}

function prefetchJson(url: string) {
  const cached = rankingJsonCache.get(url);
  if (cached && Date.now() - cached.at < JSON_FRESH_MS) return;

  if (!rankingJsonInflight.has(url)) {
    const work = networkJson(url)
      .catch(() => null)
      .finally(() => rankingJsonInflight.delete(url));
    rankingJsonInflight.set(url, work);
  }
}

export function warmDefaultRankingCaches() {
  if (typeof window === "undefined") return;

  /*
    These are the first views a user sees after entering each sport.
    Warm them in the SAME module cache used by PlayerRankingsPanel so
    navigation does not wait until after the destination dashboard mounts.
    CFB goes first because it has the heaviest first-load board.
  */
  const urls = [
    "/api/cfb/rankings-board?market=passing_yards&slate=all",
    "/api/mlb/rankings",
    "/api/mlb/schedule",
    "/api/nfl/rankings?market=passing_yards",
    "/api/nba/rankings?market=points",
    "/api/wnba/rankings?market=points",
    "/api/nhl/rankings?market=shots_on_goal",
    "/api/cbb/rankings?market=points",
    "/api/soccer/dashboard?league=eng.1",
  ];

  urls.forEach((url, index) => {
    window.setTimeout(
      () => prefetchJson(url),
      index * 120
    );
  });
}

function findMlbGame(row: any, games: any[]) {
  const gamePk = String(
    row?.game_pk ??
      row?.gamePk ??
      row?.game_id ??
      ""
  );

  if (gamePk) {
    const exact = games.find(
      (game: any) => String(game?.gamePk ?? game?.game_id ?? "") === gamePk
    );
    if (exact) return exact;
  }

  const team = clean(
    row?.team_name ??
      row?.team ??
      row?.team_abbreviation
  );

  const opponent = clean(
    row?.opponent_name ??
      row?.opponent ??
      row?.opponent_abbreviation
  );

  return games.find((game: any) => {
    const away = clean(game?.away?.name ?? game?.awayTeam);
    const home = clean(game?.home?.name ?? game?.homeTeam);

    const hasTeam =
      team &&
      (
        away === team ||
        home === team ||
        away.endsWith(` ${team}`) ||
        home.endsWith(` ${team}`)
      );

    const hasOpponent =
      !opponent ||
      away === opponent ||
      home === opponent ||
      away.endsWith(` ${opponent}`) ||
      home.endsWith(` ${opponent}`);

    return Boolean(hasTeam && hasOpponent);
  });
}

function mlbResultRows(payload: any, group: string, market: string) {
  const day = torontoDay();
  const root =
    group === "Pitcher"
      ? payload?.pitcher
      : payload?.batter;

  return root?.days?.[day]?.categories?.[market] || [];
}

function soccerGameFor(row: any, games: any[]) {
  const matchup = clean(row?.matchup);
  const team = clean(row?.team);

  return games.find((game: any) => {
    const text = clean(`${game?.awayTeam || ""} ${game?.homeTeam || ""}`);
    return (
      (matchup && text && (matchup.includes(clean(game?.awayTeam)) || matchup.includes(clean(game?.homeTeam)))) ||
      (team && text.includes(team))
    );
  });
}


type SharedStatusGame = {
  id?: string;
  date?: string;
  awayTeam?: string;
  awayAbbr?: string;
  homeTeam?: string;
  homeAbbr?: string;
  state?: string;
  status?: string;
};

function sharedGameForCard(card: RankingCard, games: SharedStatusGame[]) {
  const matchup = clean(card.matchup);
  const team = clean(card.teamName);
  return games.find((game) => {
    const away = [clean(game.awayTeam), clean(game.awayAbbr)].filter(Boolean);
    const home = [clean(game.homeTeam), clean(game.homeAbbr)].filter(Boolean);
    const matchupMatches =
      away.some((value) => matchup.includes(value)) &&
      home.some((value) => matchup.includes(value));
    if (matchupMatches) return true;
    return [...away, ...home].some((value) => value && team === value);
  }) || null;
}

function applySharedGameStatus(card: RankingCard, game: SharedStatusGame | null) {
  if (!game) return card;
  const state = String(game.state || "").toLowerCase();
  if (state !== "in" && state !== "post") return card;
  const gameStatus = String(game.status || (state === "in" ? "In Progress" : "Final"));
  return {
    ...card,
    lineupStatus: "Confirmed" as const,
    gameState: state,
    gameStatus,
    raw: {
      ...(card.raw || {}),
      gameState: state,
      gameStatus,
      isLive: state === "in",
      isFinal: state === "post",
      completed: state === "post",
      lineupConfirmed: true,
      confirmed: true,
    },
  };
}

type CfbLiveRow = {
  playerId?: string;
  playerName?: string;
  value?: number | null;
};

type CfbLiveGame = {
  gameId?: string;
  matchup?: string;
  state?: string;
  completed?: boolean;
  status?: string;
  quarter?: string;
  clock?: string;
  rows?: CfbLiveRow[];
};

type CfbSlateKey = "all" | "early" | "afternoon" | "evening";

const CFB_SLATES: Array<{ key: CfbSlateKey; label: string }> = [
  { key: "all", label: "All Day" },
  { key: "early", label: "Noon / Early" },
  { key: "afternoon", label: "Afternoon" },
  { key: "evening", label: "Evening" },
];

function cfbSlateLabel(value: CfbSlateKey) {
  return CFB_SLATES.find((item) => item.key === value)?.label || "All Day";
}

function rankingSlateForTime(value: string): Exclude<CfbSlateKey, "all"> {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "early";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const hour = Number(parts.find((item) => item.type === "hour")?.value || 0);
  if (hour < 15) return "early";
  if (hour < 19) return "afternoon";
  return "evening";
}

function cfbGameForCard(card: RankingCard, games: CfbLiveGame[]) {
  const wanted = clean(card.matchup);
  return games.find((game) => clean(game.matchup) === wanted) || null;
}

function cfbLivePlayerValue(game: CfbLiveGame | null, card: RankingCard) {
  if (!game) return null;

  const id = String(card.playerId || "");
  const name = clean(card.playerName);

  const row =
    (game.rows || []).find((item) => id && String(item.playerId || "") === id) ||
    (game.rows || []).find((item) => name && clean(item.playerName) === name);

  return finite(row?.value);
}

function applyCfbLiveState(card: RankingCard, game: CfbLiveGame | null) {
  if (!game) return card;

  const isLive = String(game.state || "").toLowerCase() === "in";
  const isFinal = Boolean(game.completed) || String(game.state || "").toLowerCase() === "post";

  if (!isLive && !isFinal) return card;

  const value = cfbLivePlayerValue(game, card);
  const statusParts = [
    game.quarter,
    game.clock,
  ].filter(Boolean);

  const gameStatus =
    statusParts.length
      ? statusParts.join(" · ")
      : String(game.status || (isLive ? "In progress" : "Final"));

  const liveProgressPct =
    isLive &&
    value != null &&
    card.sportsbookLine != null &&
    card.sportsbookLine > 0
      ? Math.max(0, Math.min(200, (value / card.sportsbookLine) * 100))
      : card.liveProgressPct;

  return {
    ...card,
    lineupStatus: "Confirmed" as const,
    gameState: isFinal ? "post" : "in",
    gameStatus,
    liveCurrent: isLive ? value : card.liveCurrent,
    liveProgressPct,
    actual: isFinal && value != null ? value : card.actual,
    raw: {
      ...(card.raw || {}),
      gameState: isFinal ? "post" : "in",
      gameStatus,
      isLive,
      isFinal,
      completed: isFinal,
      lineupConfirmed: true,
      confirmed: true,
      liveCurrent: isLive ? value : card.liveCurrent,
      actualResult: isFinal && value != null ? value : card.actual,
      liveProgressPct,
      frozen: true,
      lockedAtKickoff: true,
    },
  };
}

export function PlayerRankingsPanel({
  sport,
}: {
  sport: RankingsSport;
}) {
  const config = CONFIG[sport];
  const [groupKey, setGroupKey] = useState(config.groups[0].key);
  const group =
    config.groups.find((item) => item.key === groupKey) ||
    config.groups[0];

  const [marketKey, setMarketKey] = useState(group.markets[0].key);
  const market =
    group.markets.find((item) => item.key === marketKey) ||
    group.markets[0];

  const [cards, setCards] = useState<RankingCard[]>([]);
  const [dropped, setDropped] = useState<any[]>([]);
  const [showDropped, setShowDropped] = useState(false);
  const [full, setFull] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [league, setLeague] = useState("eng.1");
  const [cfbSlate, setCfbSlate] = useState<CfbSlateKey>("all");
  const [nflSlate, setNflSlate] = useState<CfbSlateKey>("all");
  const [cfbLiveGames, setCfbLiveGames] = useState<CfbLiveGame[]>([]);
  const [sharedStatusGames, setSharedStatusGames] = useState<SharedStatusGame[]>([]);
  const rankingRequestSeq = useRef(0);
  const groupScroll = useHorizontalScroll();
  const marketScroll = useHorizontalScroll();

  const viewCacheKey = (
    nextGroup: string,
    nextMarket: string,
    nextSlate: CfbSlateKey = cfbSlate
  ) => `${sport}|${league}|${nextGroup}|${nextMarket}|${sport === "cfb" ? nextSlate : "all"}`;

  const resetCfbMarketView = () => {
    if (sport !== "cfb") return;

    // Keep the existing board visible while the next board is prepared.
    // This prevents the blank/flicker seen when changing CFB time blocks.
    setError("");
    setLoading(true);
    setFull(false);
    setShowDropped(false);
  };

  const selectGroup = (item: Group) => {
    if (item.key === group.key) return;

    resetCfbMarketView();
    setGroupKey(item.key);
    setMarketKey(item.markets[0].key);
  };

  const selectMarket = (key: string) => {
    if (key === market.key) return;

    resetCfbMarketView();
    setMarketKey(key);
  };

  const selectCfbSlate = (key: CfbSlateKey) => {
    if (sport !== "cfb" || key === cfbSlate) return;

    setError("");
    setLoading(true);
    setFull(false);
    setShowDropped(false);
    setCfbSlate(key);
  };

  const selectNflSlate = (key: CfbSlateKey) => {
    if (sport !== "nfl" || key === nflSlate) return;
    setFull(false);
    setShowDropped(false);
    setNflSlate(key);
  };

  useEffect(() => {
    const next = config.groups[0];
    setGroupKey(next.key);
    setMarketKey(next.markets[0].key);
    setCfbSlate("all");
    setNflSlate("all");
    setFull(false);
  }, [sport]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const nextGroup =
      config.groups.find((item) => item.key === groupKey) ||
      config.groups[0];

    if (!nextGroup.markets.some((item) => item.key === marketKey)) {
      setMarketKey(nextGroup.markets[0].key);
    }

    setFull(false);
    setShowDropped(false);
  }, [groupKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setFull(false);
    setShowDropped(false);
  }, [marketKey]);

  useEffect(() => {
    if (sport !== "soccer") return;

    const select = document.querySelector(
      ".soccerLeagueRow select"
    ) as HTMLSelectElement | null;

    if (!select) return;

    const sync = () => setLeague(select.value || "eng.1");
    sync();

    select.addEventListener("change", sync);
    return () => select.removeEventListener("change", sync);
  }, [sport]);

  useEffect(() => {
    let stopped = false;
    const run = async () => {
      try {
        const params = new URLSearchParams({ sport });
        if (sport === "soccer") params.set("league", league);
        const response = await fetch(`/api/game-slate?${params.toString()}`, { cache: "no-store" });
        if (!response.ok || stopped) return;
        const payload = await response.json();
        if (!stopped) {
          setSharedStatusGames(Array.isArray(payload?.games) ? payload.games : []);
        }
      } catch {}
    };
    run();
    const interval = window.setInterval(run, 15_000);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [sport, league]);

  useEffect(() => {
    if (sport !== "cfb") {
      setCfbLiveGames([]);
      return;
    }

    let stopped = false;

    const run = async () => {
      try {
        const response = await fetch(
          `/api/cfb/live?market=${encodeURIComponent(market.key)}`,
          { cache: "no-store" }
        );

        if (!response.ok || stopped) return;

        const payload = await response.json();

        if (!stopped) {
          setCfbLiveGames(
            Array.isArray(payload?.games)
              ? payload.games
              : []
          );
        }
      } catch {}
    };

    run();
    const interval = window.setInterval(run, 15_000);

    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [sport, market.key]);


  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (sport === "mlb") {
        prefetchJson("/api/mlb/rankings");
        prefetchJson("/api/mlb/schedule");
        return;
      }

      if (sport === "soccer") {
        prefetchJson(`/api/soccer/dashboard?league=${encodeURIComponent(league)}`);
        return;
      }

      if (sport === "cfb") {
        // Do not fan out every market/slate in the background. The board route
        // already derives time blocks from one all-day payload; fan-out was
        // multiplying the same expensive roster/history work.
        prefetchJson(
          `/api/cfb/rankings-board?market=${encodeURIComponent(market.key)}&slate=${encodeURIComponent(cfbSlate)}`
        );
        return;
      }

      const currentIndex = Math.max(
        0,
        group.markets.findIndex((item) => item.key === market.key)
      );

      const neighbors = [
        group.markets[currentIndex + 1],
        group.markets[currentIndex - 1],
      ].filter(Boolean);

      for (const item of neighbors) {
        prefetchJson(`/api/${sport}/rankings?market=${encodeURIComponent(item.key)}`);
      }
    }, 120);

    return () => window.clearTimeout(timer);
  }, [sport, league, groupKey, market.key, cfbSlate]); // eslint-disable-line react-hooks/exhaustive-deps


  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    const requestId = ++rankingRequestSeq.current;
    const requestedMarket = market.key;
    const requestedCfbSlate = cfbSlate;

    const run = async () => {
      setLoading(true);
      setError("");

      try {
        let rawRows: any[] = [];
        let rawDropped: any[] = [];
        let performance: any = null;
        let schedule: any[] = [];
        let soccerGames: any[] = [];

        if (sport === "mlb") {
          // Rankings are the critical path. Performance and schedule are
          // secondary decoration and must never hold the cards on screen.
          const rankingPayload = await fetchJson(
            "/api/mlb/rankings",
            controller.signal
          );

          rawRows =
            (
              group.key === "Pitcher"
                ? rankingPayload?.pitcher?.[market.key]
                : rankingPayload?.batter?.[market.key]
            ) || [];

          rawDropped =
            (
              group.key === "Pitcher"
                ? rankingPayload?.pitcherDropped?.[market.key]
                : rankingPayload?.batterDropped?.[market.key]
            ) || [];

          const cachedPerformance = rankingJsonCache.get("/api/mlb/performance")?.payload;
          const cachedSchedule = rankingJsonCache.get("/api/mlb/schedule")?.payload;

          performance = cachedPerformance
            ? {
                predictions: mlbResultRows(
                  cachedPerformance,
                  group.key,
                  market.key
                ),
              }
            : null;
          schedule = cachedSchedule?.games || [];

          prefetchJson("/api/mlb/performance");
          prefetchJson("/api/mlb/schedule");
        } else if (sport === "soccer") {
          const payload = await fetchJson(
            `/api/soccer/dashboard?league=${encodeURIComponent(league)}`,
            controller.signal
          );

          rawRows = payload?.rankings?.[market.key] || [];
          soccerGames = payload?.games || [];
        } else {
          const rankingUrl =
            sport === "cfb"
              ? `/api/cfb/rankings-board?market=${encodeURIComponent(market.key)}&slate=${encodeURIComponent(requestedCfbSlate)}`
              : `/api/${sport}/rankings?market=${encodeURIComponent(market.key)}`;

          // Never make rankings wait for grading/performance data.
          const rankingPayload = await fetchJson(
            rankingUrl,
            controller.signal
          );

          rawRows = rankingPayload?.rows || [];
          rawDropped = rankingPayload?.dropped || [];

          const performanceUrl =
            `/api/${sport}/performance?period=Today&market=${encodeURIComponent(market.key)}`;
          performance = rankingJsonCache.get(performanceUrl)?.payload || null;
          // Performance is secondary to the ranking board. Do not start a
          // second expensive request while CFB is still assembling its slate.
          if (sport !== "cfb") prefetchJson(performanceUrl);
        }

        const normalized = rawRows
          .slice(0, sport === "cfb" && requestedCfbSlate === "all" ? 75 : 25)
          .map((row: any) => {
            let enriched = row;
            let result = performance
              ? resultForPlayer(performance, row)
              : null;
            let game: any = null;

            if (sport === "mlb") {
              game = findMlbGame(row, schedule);

              if (game) {
                enriched = {
                  ...row,
                  gameState: game?.isFinal
                    ? "post"
                    : game?.isLive
                      ? "in"
                      : "pre",
                  gameStatus: game?.status || "",
                  isFinal: Boolean(game?.isFinal),
                  isLive: Boolean(game?.isLive),
                };
              }
            }

            if (sport === "soccer") {
              game = soccerGameFor(row, soccerGames);

              if (game) {
                enriched = {
                  ...row,
                  playerId: row?.playerId,
                  playerName: row?.playerName,
                  teamName: row?.team,
                  headshot: row?.photoUrl,
                  sportsbookLine: row?.marketLine,
                  modelProjection: row?.projection,
                  gameTime: row?.kickoff || game?.kickoff,
                  gameState: game?.completed
                    ? "post"
                    : game?.state || "pre",
                  gameStatus: game?.status || "",
                  completed: Boolean(game?.completed),
                  summary: row?.why,
                  lineupConfirmed:
                    String(row?.availability || "")
                      .toLowerCase()
                      .includes("start"),
                };
              }
            }

            return normalizeCard(
              enriched,
              sport,
              market,
              result,
              game
            );
          });

        if (
          !alive ||
          requestId !== rankingRequestSeq.current ||
          requestedMarket !== market.key ||
          (sport === "cfb" && requestedCfbSlate !== cfbSlate)
        ) {
          return;
        }

        // Prediction boards contain only actionable, gradeable predictions.
        // Model-only rows remain research data and never enter Top 25.
        const isolated = normalized.filter((card) => {
          if (card.market !== requestedMarket) return false;

          if (
            sport === "cfb" &&
            card.raw?.marketBacked !== true &&
            card.raw?.earlyModel !== true
          ) {
            return false;
          }

          return isGradeablePrediction(card);
        });

        setCards(isolated);
        setDropped(rawDropped);
      } catch (cause) {
        if (!alive || controller.signal.aborted) return;
        // Keep the last good board on screen. A background refresh failure
        // should never turn the ranking section into a blank panel.
        setError(
          cause instanceof Error
            ? cause.message
            : "Player rankings are temporarily unavailable."
        );
      } finally {
        if (
          alive &&
          requestId === rankingRequestSeq.current &&
          requestedMarket === market.key &&
          (sport !== "cfb" || requestedCfbSlate === cfbSlate)
        ) {
          setLoading(false);
        }
      }
    };

    run();
    const interval = window.setInterval(run, 60_000);

    return () => {
      alive = false;
      controller.abort();
      window.clearInterval(interval);
    };
  }, [sport, groupKey, marketKey, league, cfbSlate]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (sport !== "nhl" || !cards.length || !sharedStatusGames.length) return;

    const liveGames = sharedStatusGames.filter(
      (game) => String(game.state || "").toLowerCase() === "in" && game.id
    );
    if (!liveGames.length) return;

    let cancelled = false;

    const run = async () => {
      const payloads = await Promise.all(
        liveGames.map(async (game) => {
          try {
            const response = await fetch(
              `/api/nhl/live-player-stats?gameId=${encodeURIComponent(String(game.id))}`,
              { cache: "no-store" }
            );
            return response.ok
              ? { game, payload: await response.json() }
              : { game, payload: null };
          } catch {
            return { game, payload: null };
          }
        })
      );

      if (cancelled) return;

      setCards((previous) =>
        previous.map((card) => {
          const game = sharedGameForCard(card, liveGames);
          if (!game) return card;

          const payload = payloads.find(
            (entry) => String(entry.game.id) === String(game.id)
          )?.payload;

          const row =
            (payload?.rows || []).find(
              (item: any) => String(item.playerId || "") === String(card.playerId || "")
            ) ||
            (payload?.rows || []).find(
              (item: any) => clean(item.playerName) === clean(card.playerName)
            );

          const current = finite(row?.stats?.[card.market]);
          if (current == null) return card;

          const progress =
            card.sportsbookLine != null && card.sportsbookLine > 0
              ? Math.max(0, Math.min(200, (current / card.sportsbookLine) * 100))
              : card.liveProgressPct;

          return {
            ...card,
            liveCurrent: current,
            liveProgressPct: progress,
            raw: {
              ...(card.raw || {}),
              liveCurrent: current,
              liveProgressPct: progress,
            },
          };
        })
      );
    };

    run();
    const timer = window.setInterval(run, 15_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [sport, market.key, cards.length, sharedStatusGames]); // eslint-disable-line react-hooks/exhaustive-deps


  const displayCards = useMemo(() => {
    const activeDays = new Set(
      sharedStatusGames
        .map((game) => torontoDay(game.date || ""))
        .filter(Boolean)
    );

    const withStatus = cards
      .map((card) => {
        const sharedGame = sharedGameForCard(card, sharedStatusGames);
        let next = applySharedGameStatus(card, sharedGame);
        if (sport === "cfb") {
          const cfbGame = cfbGameForCard(next, cfbLiveGames);
          next = applyCfbLiveState(next, cfbGame);
        }
        return next;
      })
      .filter((card) => {
        if (!sharedStatusGames.length) return true;

        if (sharedGameForCard(card, sharedStatusGames)) return true;

        const cardDay = card.gameTime ? torontoDay(card.gameTime) : "";
        return Boolean(cardDay && activeDays.has(cardDay));
      });

    if (sport === "nfl") {
      return withStatus
        .filter((card) => {
          if (nflSlate === "all") return true;
          if (!card.gameTime) return false;
          return rankingSlateForTime(card.gameTime) === nflSlate;
        })
        .sort((a, b) => a.rank - b.rank);
    }

    if (sport !== "cfb") return withStatus;

    const blockOrder: Record<string, number> = { early: 0, afternoon: 1, evening: 2 };
    return withStatus
      .filter((card) => card.market === market.key)
      .sort((a, b) => {
        if (cfbSlate === "all") {
          const aBlock = blockOrder[String(a.raw?.slateKey || "")] ?? 99;
          const bBlock = blockOrder[String(b.raw?.slateKey || "")] ?? 99;
          if (aBlock !== bBlock) return aBlock - bBlock;
        }
        return a.rank - b.rank;
      });
  }, [sport, market.key, cfbSlate, nflSlate, cards, cfbLiveGames, sharedStatusGames]);

  const visible = full
    ? displayCards
    : displayCards.slice(0, 5);

  const cfbAllDayGroups = useMemo(() => {
    if (sport !== "cfb" || cfbSlate !== "all") return [];
    return ([
      ["early", "Noon / Early"],
      ["afternoon", "Afternoon"],
      ["evening", "Evening"],
    ] as const).map(([key, label]) => ({
      key,
      label,
      rows: displayCards.filter((card) => card.raw?.slateKey === key),
    }));
  }, [sport, cfbSlate, displayCards]);

  const sourceText = useMemo(() => {
    if (sport === "soccer") {
      return LEAGUES.find((item) => item[1] === league)?.[0] || "Soccer";
    }

    if (sport === "mlb") return group.label;
    if (sport === "cfb") return `${group.label} · ${cfbSlateLabel(cfbSlate)}`;
    if (sport === "nfl") return `${group.label} · ${cfbSlateLabel(nflSlate)}`;
    return config.label;
  }, [sport, group.label, league, config.label, cfbSlate, nflSlate]);

  return (
    <div className={`ssPlayerRankingsRoot ${styles.root}`}>
      <div className={styles.header}>
        <div>
          <h2>{sport === "cfb" && cfbSlate === "all" ? "All Day Rankings" : "Top 25 Rankings"}</h2>
          <p>
            Market-specific intelligence · live matchup context
          </p>
        </div>

      </div>

      {sport === "cfb" ? (
        <div className={styles.tabsFrame}>
          <div className={styles.tabs}>
            {CFB_SLATES.map((item) => (
              <button
                type="button"
                key={item.key}
                className={item.key === cfbSlate ? styles.activeTab : ""}
                onClick={() => selectCfbSlate(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {sport === "nfl" ? (
        <div className={styles.tabsFrame}>
          <div className={styles.tabs}>
            {CFB_SLATES.map((item) => (
              <button
                type="button"
                key={item.key}
                className={item.key === nflSlate ? styles.activeTab : ""}
                onClick={() => selectNflSlate(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {config.groups.length > 1 ? (
        <div className={styles.tabsFrame}>
          <div className={styles.tabs} ref={groupScroll.ref}>
            {config.groups.map((item) => (
              <button
                type="button"
                key={item.key}
                className={item.key === group.key ? styles.activeTab : ""}
                onClick={() => selectGroup(item)}
              >
                <span>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
          <button type="button" className={styles.scrollCue} onClick={groupScroll.more}>›</button>
        </div>
      ) : null}

      <div className={styles.tabsFrame}>
        <div className={styles.tabs} ref={marketScroll.ref}>
          {group.markets.map((item) => (
            <button
              type="button"
              key={item.key}
              className={item.key === market.key ? styles.activeTab : ""}
              onClick={() => selectMarket(item.key)}
            >
              <span>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
        <button type="button" className={styles.scrollCue} onClick={marketScroll.more}>›</button>
      </div>

      <div className={styles.marketTitle}>
        <h3>{market.icon} {market.label} Rankings</h3>
        <p>
          {sport === "cfb" && cfbSlate === "all" ? "Up to 75 · three independent Top 25 time blocks" : "Top 25"} · {sourceText} · original prediction values remain frozen after game start when the sport feed supports locking.
        </p>
      </div>

      {dropped.length ? (
        <div className={styles.dropped}>
          <button
            type="button"
            onClick={() => setShowDropped((value) => !value)}
          >
            DROPPED from Top 25 ({dropped.length}) {showDropped ? "⌃" : "⌄"}
          </button>

          {showDropped ? (
            <div>
              {dropped.slice(0, 12).map((item: any, index: number) => (
                <span key={`${item?.playerId || item?.playerName || item}-${index}`}>
                  {String(item?.playerName || item)}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {loading && !displayCards.length ? (
        <div className={styles.skeletonStack} aria-label={`Loading ${market.label} rankings`}>
          {[0, 1, 2].map((item) => (
            <div className={styles.skeletonCard} key={item}>
              <i />
              <span />
              <b />
              <em />
            </div>
          ))}
        </div>
      ) : null}

      {error ? (
        <div className={styles.state}>{error}</div>
      ) : null}

      <div className={styles.cards}>
        {sport === "cfb" && cfbSlate === "all"
          ? cfbAllDayGroups.map((block) => (
              <div key={block.key} style={{ marginBottom: 18, paddingTop: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, borderBottom: "1px solid rgba(229,187,69,.35)", padding: "8px 2px", marginBottom: 8 }}>
                  <strong style={{ color: "#e5bb45" }}>{block.label}</strong>
                  <span style={{ color: "#9da1a8", fontSize: 11 }}>Top {block.rows.length}</span>
                </div>
                {(full ? block.rows : block.rows.slice(0, 5)).map((card) => (
                  <PlayerCard key={`${sport}-${market.key}-${block.key}-${card.playerId}-${card.rank}`} card={card} sport={sport} league={league} />
                ))}
              </div>
            ))
          : visible.map((card) => (
              <PlayerCard key={`${sport}-${market.key}-${card.playerId}-${card.rank}`} card={card} sport={sport} league={league} />
            ))}
      </div>

      {!loading && !error && !displayCards.length ? (
        <div className={styles.state}>
          No eligible {market.label} rankings are available for the current slate.
        </div>
      ) : null}

      {displayCards.length > (sport === "cfb" && cfbSlate === "all" ? 15 : 5) ? (
        <button
          type="button"
          className={styles.bottomViewAll}
          onClick={() => setFull((value) => !value)}
        >
          {sport === "cfb" && cfbSlate === "all"
            ? full
              ? "Show Top 5 Per Time Block"
              : `View Full All Day Rankings · ${displayCards.length}`
            : full
              ? "Show Top 5 Only"
              : "View Full Top 25"}
        </button>
      ) : null}
    </div>
  );
}
