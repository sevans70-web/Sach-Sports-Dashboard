"use client";
import {nbaSlateRequest,scopedNbaBoard,nbaFixtureDay} from "@/lib/nba-slate-scope";
import {sharedJsonRequest} from '@/lib/shared-json-request';
import {savedProjectionEvidence} from '@/lib/saved-projection';
import {predictionProbabilityText} from '@/lib/prediction-probability';
import {estimatedEvText,estimatedEvNotice} from '@/lib/estimated-ev';
import {cardObservationGames} from '@/lib/card-observation-games';
import {footballForecastDisplay,footballForecastOutcome} from '@/lib/football-forecast-display';
import {playerAvailability,applyParticipationEvidence,retainParticipation,cardStatusBadge} from "@/lib/player-participation";
import {propIntelligence} from "@/lib/card-intelligence";
import {datedCardHistoryPoints,publicPropContext} from "@/lib/public-prop-context";
import {trackRankBoard,type RankBoard} from "@/lib/rank-movement";
import {integrityRow} from "@/lib/prop-integrity";
import {matchingPredictionResult} from "@/lib/prediction-results";
import {prepareRankingImage} from "@/lib/ranking-images";
import {rankingTimeBlocks} from "@/lib/ranking-time-blocks";
import {rankingCardState,rankingLineProgress,rankingGameForRow} from "@/lib/ranking-card-state";
import {cardObservedProgress,cardProgressLine,researchFinalOutcome,scorerTarget,cardStatUnit} from "@/lib/card-results";
import {propLineText} from '@/lib/prop-line-format';
import {cardModelPick,cardModelProjection,modelPickNotice} from '@/lib/saved-model-pick';
import {firstBasketQuote,publicNbaRanking,forecastDetailText} from '@/lib/public-card-metrics';
import {excludeUnavailableRanking} from '@/lib/ranking-availability';
import {voidRecordNote,recordNoteFields,playerAvailabilityNote} from '@/lib/record-notes';
import {finalCardObservation,retainCardFinal} from '@/lib/final-card-observation';

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
  { key: "passing_interceptions", label: "Interceptions", icon: "🛑" },
  { key: "qb_rushing_yards", label: "QB Rushing Yards", icon: "🏃" },
  { key: "passing_rushing_yards", label: "Pass + Rush Yards", icon: "⚡" },
];

const NFL_OFFENSE: Market[] = [
  { key: "anytime_td", label: "Anytime TD", icon: "🔥" },
  { key: "first_td", label: "First TD", icon: "1️⃣" },
  { key: "receiving_yards", label: "Receiving Yards", icon: "🙌" },
  { key: "receptions", label: "Receptions", icon: "🧤" },
  { key: "rushing_yards", label: "Rushing Yards", icon: "🏃" },
  { key: "rushing_receiving_yards", label: "Rush + Receiving", icon: "🔀" },
];

const NFL_Q1: Market[] = [
  { key: "q1_passing_yards", label: "Q1 Passing Yards", icon: "⏱️" },
  { key: "q1_receiving_yards", label: "Q1 Receiving Yards", icon: "⏱️" },
  { key: "q1_rushing_yards", label: "Q1 Rushing Yards", icon: "⏱️" },
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
      { key: "Defense", label: "Defense", icon: "🛡️", markets: [{key:"sacks",label:"Sacks",icon:"🛡️"},{key:"tackles",label:"Solo Tackles",icon:"🛡️"},{key:"tackles_assists",label:"Tackles + Assists",icon:"🛡️"}] },
      { key: "Q1", label: "Q1", icon: "⏱️", markets: NFL_Q1 },
    ],
  },
  cfb: {
    label: "CFB",
    groups: [
      { key: "QB", label: "QB", icon: "🏈", markets: CFB_QB },
      { key: "Offense", label: "Offense", icon: "🏃", markets: CFB_OFFENSE },
      { key: "Q1", label: "Q1", icon: "⏱️", markets: NFL_Q1 },
    ],
  },
  nba: {
    label: "NBA",
    groups: [
      {
        key: "Props",
        label: "Props",
        icon: "🏀",
        markets: [...BASKETBALL,{key:"first_basket",label:"First Basket",icon:"1️⃣"}],
      },
      {key:"Q1",label:"Q1",icon:"⏱️",markets:["points","rebounds","assists","threes_made","pts_rebs_asts"].map(key=>({key:"q1_"+key,label:"Q1 "+(BASKETBALL.find(m=>m.key===key)?.label||key),icon:"⏱️"}))},
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

function resultForPlayer(payload:any,row:any){return matchingPredictionResult(payload,row)}

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
  if(marketKey.startsWith('q1_')&&row?.quarterObservationChecked===true)return finite(row.observedQuarterValue);
  const officialFinal=finalCardObservation(row,marketKey);
  if(officialFinal)return officialFinal.value;
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

  return rankingCardState(row,status);
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
  const integritySport = !["mlb", "soccer"].includes(sport);
  if (integritySport) row = integrityRow(row, sport, market.key);
  const line = integritySport && !row.quoteVerified ? null : finite(
    row?.sportsbookLine ??
      row?.sportsbook_line ??
      row?.marketLine ??
      row?.line ??
      result?.sportsbookLine
  );

  const savedProjection=savedProjectionEvidence({...row,market:market.key},result);
  const projection = savedProjection?.projection ?? finite(
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
  const football = sport === "cfb" || sport === "nfl";
  const footballScorer = football && ["anytime_td", "first_td", "q1_anytime_td"].includes(market.key);
  const unverifiedFootballLine = football && (line != null || row?.marketBacked === true) && row?.quoteVersion !== 1;
  const movement = movementFrom(row);
  const actual = marketActualValue(
    result,
    row,
    market.key
  );

  const liveCurrent =
    row?.quarterObservationChecked===true&&market.key.startsWith('q1_') ? finite(row.observedQuarterValue) : finite(row?.liveCurrent) ??
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

  const lineupConfirmed = playerAvailability(row).confirmed;

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
    modelProjection: row?.researchOnly && market.key.startsWith("q1_") ? null : projection,
    modelProbability: row?.researchOnly || unverifiedFootballLine ? null : probability,
    giScore: row?.researchOnly || unverifiedFootballLine ? null : gi,
    prediction:
      row?.researchOnly ? "Forecast only" : unverifiedFootballLine ? "Line not confirmed" : footballScorer ? (row?.quoteVersion === 1 ? "YES" : "—") : isBinaryEventMarket(market.key) &&
      line == null &&
      probability != null
        ? "YES"
        : pickText(
            row,
            line,
            projection,
            probability
          ),
    summary: row?.researchOnly ? row.summary : unverifiedFootballLine ? "The saved sportsbook and market details could not be confirmed. This record remains available for history, but it is not a verified pick." : String(
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
    raw: {...row,savedProjectionReceipt:savedProjection,...recordNoteFields(result),historicalStatus:result?.historicalStatus||row.historicalStatus,originalResearchPick:row.originalResearchPick||result?.archivedOriginal?.prediction,originalResearchSavedAt:row.originalResearchSavedAt||result?.savedAt},
  };
}

const PRICE_ONLY_MARKETS = new Set([
  "home_runs",
  "anytime_td",
  "first_td",
  "first_basket",
  "q1_anytime_td",
]);

function isGradeablePrediction(card: RankingCard) {
  if (!card.playerName || card.playerName === "Player") return false;
  // Research stays browsable, including missing-line and Q1 candidates.
  if (card.raw?.researchOnly) return true;

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
  "nhl",
]);

type RecentPoint={value:number;date?:string;opponent?:string;gameId?:string};
const recentFormCache = new Map<string, RecentPoint[]>();

async function loadRecentFormForCard(
  card: RankingCard,
  sport: RankingsSport,
  league: string,
  signal: AbortSignal
):Promise<RecentPoint[]> {
  const key = `${sport}|${league}|${card.playerId}|${card.market}|${card.gameTime}`;
  const cached = recentFormCache.get(key);
  if (cached) return cached;

  let url = "";

  if (NATIVE_HISTORY_SPORTS.has(sport)) {
    url =
      `/api/${sport}/player/${encodeURIComponent(card.playerId)}/history` +
      `?market=${encodeURIComponent(card.market)}&before=${encodeURIComponent(card.gameTime)}`;
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
    ? datedCardHistoryPoints(payload.points,card.gameTime,card.market,sport,card.raw?.gameId)
    : Array.isArray(payload?.values)
      ? payload.values
          .map((value: any) => Number(value))
          .filter((value: number) => Number.isFinite(value)).map((value:number)=>({value}))
      : [];

  const recent = values.slice(-20);
  if (recent.length) recentFormCache.set(key, recent);
  return recent;
}

function RecentChart({
  values,
  points,
  statLabel,
  line,
  projection,
  liveValue,
}: {
  values: number[];
  points:RecentPoint[];
  statLabel:string;
  line: number | null;
  projection: number | null;
  liveValue?: number | null;
}) {
  const [selected,setSelected]=useState<number|null>(null);
  useEffect(()=>setSelected(null),[values.length,liveValue]);
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
    <><div className={styles.chart}>
      <div className={styles.chartBars}>
        {plotted.map((value, index) => (
          <button type="button" className={styles.barSlot} key={`${value}-${index}`} onClick={()=>setSelected(index)} aria-pressed={selected===index} aria-label={`${points[index]?.date||`Game ${index+1}`} ${points[index]?.opponent||""}: ${value} ${statLabel}`}>
            <div
              className={`${styles.bar} ${index === plotted.length - 1 && liveValue != null ? styles.liveBar : ""}`}
              style={{ height: `${Math.max(7, (value / max) * 100)}%` }}
            />
            <span>{index === plotted.length - 1 && liveValue != null ? "Live" : `G${index + 1}`}</span>
          </button>
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
    <p className={styles.chartReadout} role="status">{selected==null?"Tap a bar for the exact game result.":`${points[selected]?.date?new Date(points[selected].date!).toLocaleDateString("en-US",{timeZone:/^\d{4}-\d{2}-\d{2}$/.test(points[selected].date!)?"UTC":"America/Toronto",month:"short",day:"numeric"}):selected===values.length?"Live":"Game "+(selected+1)}${points[selected]?.opponent?" · "+points[selected].opponent:""}: ${plotted[selected]} ${statLabel}`}</p></>
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
  const [historyPoints,setHistoryPoints]=useState<RecentPoint[]>([]);
  const [historyValues, setHistoryValues] = useState<number[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  useEffect(() => {
    setHistoryValues([]);
    setHistoryPoints([]);
    setHistoryLoaded(false);
  }, [card.playerId, card.market, card.gameTime]);

  useEffect(() => {
    if (historyLoaded) return;

    const controller = new AbortController();
    setHistoryLoading(true);

    loadRecentFormForCard(card, sport, league, controller.signal)
      .then((values) => {
        setHistoryPoints(values);
        setHistoryValues(values.map(p=>p.value));
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
    historyLoaded,
    sport,
    league,
    card.playerId,
    card.playerName,
    card.teamName,
    card.market,
    card.gameTime,
  ]);

  const recentFormValues =
    historyValues.slice(-formSpan);
  const state = deriveState(card.raw, {
    status: card.resultStatus,
    actual: card.actual,
  });

  const statusBadge=cardStatusBadge({...card.raw,gameState:card.gameState},state);
  const voidNote=voidRecordNote({...card.raw,resultStatus:card.resultStatus});

  const current =
    state === "live"
      ? card.liveCurrent
      : state === "final"
        ? card.actual
        : null;

  const progressLine=cardProgressLine(card.raw,card.sportsbookLine,card.market);
  const observedProgress=cardObservedProgress(current,progressLine,card.market);
  const researchOutcome=researchFinalOutcome(card.raw,current,card.sportsbookLine,card.market);
  const progress=observedProgress?.percent??0;

  const binaryEvent =
    isBinaryEventMarket(card.market);
  const footballScorer = (sport === "cfb" || sport === "nfl") && ["anytime_td", "first_td", "q1_anytime_td"].includes(card.market);
  const researchOnly = card.raw?.researchOnly === true;
  const unverifiedFootballResult = researchOnly || card.market==="first_td"&&card.raw?.firstTouchdownVerified!==true || (sport === "cfb" || sport === "nfl") && (card.raw?.quoteVersion !== 1 || card.raw?.recoveredAfterStart === true);

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

  const context=publicPropContext({...card.raw,playerName:card.playerName,matchup:card.matchup,gameTime:card.gameTime,historyLoaded,gameState:state==='final'?'post':state==='live'?'in':'pre',actualResult:card.actual,liveCurrent:card.liveCurrent},sport,card.market,historyLoaded?historyValues:[]);
  const intelligence={...propIntelligence({...card.raw,rank:card.rank,marketLabel:card.marketLabel,gameTime:card.gameTime},sport,card.market),...context};
  const fittedForecast=(state==='pregame'||card.raw?.boardFrozen===true)&&card.raw?.researchForecast?.status==='available'?card.raw.researchForecast:null;
  const modelSelection=cardModelPick(card.raw);
  const firstBasket=card.market==='first_basket';
  const quarterTarget=['nfl','nba'].includes(sport)&&card.market.startsWith('q1_')&&card.raw?.lineType==='milestone';
  const scorerQuote=firstBasketQuote(card.raw);
  const footballForecast=footballForecastDisplay(card.raw);
  const displayedPick=modelSelection?.side||footballForecast?.side||(footballScorer?'YES':null)||(researchOnly?'Forecast unavailable':card.prediction);
  const evText=estimatedEvText(card.raw),evNotice=estimatedEvNotice(card.raw);
  const displayedAverage=savedProjectionEvidence(card.raw,card.raw.savedProjectionReceipt)?.projection??footballForecast?.projection??(researchOnly?cardModelProjection(card.raw):card.modelProjection);
  const edge=displayedAverage!=null&&card.sportsbookLine!=null?displayedAverage-card.sportsbookLine:null;
  const reasons = researchOnly ? intelligence.facts : splitReasons(card.summary);

  const lineMovement =
    card.openingLine != null && card.sportsbookLine != null
      ? card.sportsbookLine - card.openingLine
      : null;

  return (
    <article
      data-ranking-market={card.market}
      data-ranking-player={card.playerId}
      className={`${styles.card} ${firstBasket?styles.firstBasketCard:''} ${
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
            {movementLabel(card) ? <b className={`${styles.movement} ${movementClass(card)}`} title={card.raw?.movementScope}>{movementLabel(card)}</b> : null}
          </div>

          <span>
            {card.position ? `${card.position} · ` : ""}
            {card.teamName}
            {card.matchup ? ` · ${card.matchup}` : ""}
          </span>

          <small>
            {state === "live" ? card.gameStatus || "In Progress" : gameTimeLabel(card.gameTime)}
          </small>

          <em
            className={
              statusBadge.tone === "live" ? styles.liveBadge
                : statusBadge.tone === "final" ? styles.finalBadge
                : statusBadge.tone === "confirmed" ? styles.confirmed : styles.pending
            }
            data-card-status={statusBadge.tone}
            aria-label={`${card.playerName} status: ${statusBadge.label}`}
          >
            {statusBadge.label}
          </em>
          {statusBadge.notice ? <span className={styles.playerStatusNotice}>{statusBadge.notice}</span> : null}
          {voidNote ? <span className={styles.playerStatusNotice}>Void: {voidNote.text}</span> : null}
        </div>

        {!firstBasket?<div className={`${styles.gi} ${researchOnly ? styles.researchGi : ""}`}>
          <span>EV</span>
          <strong title={evNotice} style={{borderColor:evText.startsWith("-")?"#ef7777":evText==="—"?"#686b72":"var(--green)"}}>{evText}</strong>
        </div>:null}
      </div>

      <div className={`${styles.faceMetrics} ${firstBasket?styles.firstBasketMetrics:''}`} style={{gridTemplateColumns:`repeat(${firstBasket||binaryEvent||quarterTarget?2:3}, minmax(0, 1fr))`}}>
        {quarterTarget?<>
          <div><span>Q1 Target</span><strong>{propLineText(card.sportsbookLine)}+ {cardStatUnit(card.market)}</strong></div>
          <div><span>Sportsbook odds</span><strong>{Number(card.raw.overPrice)>0?'+':''}{card.raw.overPrice}</strong></div>

        </>:firstBasket?<>

          <div><span>Sportsbook odds</span><strong>{scorerQuote?`${scorerQuote.price>0?'+':''}${scorerQuote.price}`:'—'}</strong></div>
          <div><span>Sportsbook</span><strong>{scorerQuote?.sportsbook||'—'}</strong></div>
        </>:<>
        <div>
          <span>
            {footballScorer ? "TD target" : researchOnly && !card.raw?.quoteVerified ? "Book line unavailable" : binaryEvent
              ? "Home Run Prop"
              : card.marketLabel}
          </span>
          <strong>
            {footballScorer ? scorerTarget(card.market) : researchOnly && !card.raw?.quoteVerified ? "Not verified" : binaryEvent
              ? "HR YES"
              : card.sportsbookLine == null
                ? "Line —"
                : `O/U ${propLineText(card.sportsbookLine)}`}
          </strong>
        </div>

        <div>
          <span>{modelSelection?"Saved selection":footballForecast?.side?"Forecast direction":"Sach Pick"}</span>
          <strong
            className={
              displayedPick === "UNDER"
                ? styles.under
                : displayedPick === "OVER" ||
                    displayedPick === "YES"
                  ? styles.over
                  : ""
            }
          >
            {["OVER", "UNDER"].includes(displayedPick) && card.sportsbookLine != null
              ? `${displayedPick} ${propLineText(card.sportsbookLine)}`
              : displayedPick}
          </strong>
          {footballForecast?.side?<small>{footballForecast.basis}</small>:state==='pregame'&&researchOnly&&!modelSelection?<small>{modelPickNotice(card.raw)}</small>:null}
          {footballForecast?.side&&state==='final'?<small>Forecast result: {footballForecastOutcome(footballForecast.side,current,card.sportsbookLine)||'Awaiting official result'}</small>:null}
        </div>

{!binaryEvent?        <div>
          <span>
            {binaryEvent
              ? "HR Probability"
              : "Sach projection"}
          </span>
          <strong>
            {binaryEvent
              ? card.modelProbability == null
                ? "—"
                : `${shortNumber(card.modelProbability)}%`
              : displayedAverage==null?'Unavailable':shortNumber(displayedAverage)}
          </strong>
        </div>:null}


        </>}
      </div>

      {card.raw?.integrityVersion ? (
        <div className={styles.faceFooter}>
          {card.raw.quoteVerified ? <p>Book: {card.raw.sportsbook}</p> : null}
          <p>{firstBasket?'Chance implied by the displayed sportsbook odds.':researchOnly?intelligence.face:card.summary}</p>
        </div>
      ) : (sport === "cfb" || sport === "nfl") && (card.sportsbookLine != null || card.raw?.marketBacked === true) ? (
        <div className={styles.faceFooter}>
          <p>{card.raw?.quoteVersion === 1
            ? `${card.raw.sportsbook} · ${quarterTarget?`Q1 milestone · ${propLineText(card.sportsbookLine)}+ · ${Number(card.raw.overPrice)>0?"+":""}${card.raw.overPrice}`:card.raw.lineType === "scorer" ? `${scorerTarget(card.market)} · To score ${Number(card.raw.overPrice) > 0 ? "+" : ""}${card.raw.overPrice}` : `Main O/U · Over ${Number(card.raw.overPrice) > 0 ? "+" : ""}${card.raw.overPrice}${card.raw.underPrice == null ? "" : ` / Under ${Number(card.raw.underPrice) > 0 ? "+" : ""}${card.raw.underPrice}`}`} · Updated ${new Date(card.raw.quoteUpdatedAt).toLocaleTimeString("en-CA", {timeZone:"America/Toronto",hour:"numeric",minute:"2-digit"})} ET`
            : "Original sportsbook details could not be confirmed. Saved for history, not a verified pick."}</p>
          {card.raw?.quoteVersion === 1 ? <p>{fittedForecast?"Projection uses estimated workload and production. Recent averages remain in the expanded history.":"The history estimate is a weighted past-game baseline. The pick applies only to the named book and displayed line."}</p> : null}
        </div>
      ) : null}

      {fittedForecast ? <div className={styles.faceFooter}><p>{forecastDetailText(fittedForecast,modelSelection,shortNumber)}</p></div> : null}

      {state === "pregame" && !card.raw?.integrityVersion ? (
        <div className={styles.faceFooter}>
          <p>{card.summary}</p>

        </div>
      ) : null}

      {state === "live" && firstBasket ? <div className={styles.liveStrip}><strong>First basket · </strong><span>{current===1?'Scored first':current===0?'Another player scored first':'First-score result pending'}</span></div> : state === "live" ? (
        <div className={`${styles.liveStrip} ${researchOnly ? styles.unverifiedStrip : ""}`}>
          <div>
            <strong>{card.marketLabel} · current</strong>
            <span>
              {current == null
                ? "Live stat pending"
                : card.market==="anytime_td" ? `${shortNumber(current)} TD · target 1+` : researchOnly ? observedProgress ? `${shortNumber(current)} / ${shortNumber(observedProgress.line)} · ${shortNumber(observedProgress.remaining)} to line` : `${shortNumber(current)} current · verified line unavailable` : binaryEvent
                  ? current >= 1
                    ? `✅ ${shortNumber(current)} HR`
                    : "0 HR · live"
                  : card.sportsbookLine != null
                    ? `${shortNumber(current)} / ${propLineText(card.sportsbookLine)} · ${propLineText(Math.max(0, card.sportsbookLine - current))} to line`
                    : `${shortNumber(current)} current`}
            </span>
          </div>
          {observedProgress ? <>
            <div className={`${styles.progressTrack} ${researchOnly ? styles.researchProgress : ""}`} role="progressbar" aria-label={`${card.playerName} ${card.marketLabel} ${card.market==="anytime_td"?"toward 1+ touchdown target":"toward recorded line"}`} aria-valuemin={0} aria-valuemax={observedProgress.line} aria-valuenow={Math.max(0,Math.min(observedProgress.line,current!))} aria-valuetext={`${shortNumber(current)} of ${shortNumber(observedProgress.line)}; observed statistic, not a win probability`}>
              <i style={{ width: `${progress}%` }} />
            </div>
            <small className={styles.progressCaption}>{card.market==="anytime_td"?"Toward 1+ touchdown target":card.sportsbookLine==null?`Pregame line ${shortNumber(progressLine)} · ${card.raw?.progressQuote?.sportsbook||'saved quote'}`:"Toward recorded line"}</small>
          </> : null}
          {current!=null&&!observedProgress&&!firstBasket&&card.market!=="first_td" ? <small className={styles.progressCaption}>Progress bar unavailable: a verified numeric line is missing.</small>:null}
        </div>
      ) : null}

      {state === "final" ? (
        <div className={`${styles.resultStrip} ${unverifiedFootballResult ? styles.unverifiedStrip : result === "miss" ? styles.missStrip : ""}`}>
          <strong>{researchOnly ? researchOutcome.label : unverifiedFootballResult ? card.market==='first_td'?'First TD scoring order unverified':card.raw?.recoveredAfterStart ? "Result recorded after game started" : "Sportsbook line not confirmed" : statusSymbol(result)}</strong>
          <span>
            {researchOnly?researchOutcome.detail:<>Actual {shortNumber(current)}</>}
            {!footballScorer && !unverifiedFootballResult && card.sportsbookLine != null && current != null
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
          {!firstBasket?<div className={styles.probabilityDetail}><span>{quarterTarget?'Book-implied chance':'Model probability'}</span><strong>{quarterTarget?`${shortNumber(card.raw.overPrice>0?10000/(card.raw.overPrice+100):100*-card.raw.overPrice/(-card.raw.overPrice+100))}%`:predictionProbabilityText(card.raw)}</strong><small>{quarterTarget?'Milestone · not a two-way O/U':'Saved pregame estimate'}</small></div>:null}
          <div className={`${styles.expandedHeader} ${firstBasket?styles.firstBasketExpanded:''}`}>
            {firstBasket?<>
              <div><b>First basket chance</b><span>Book-implied likelihood</span><strong>{scorerQuote?`${shortNumber(scorerQuote.probability)}%`:'—'}</strong></div>
              <div><b>Sportsbook odds</b><span>{scorerQuote?.sportsbook}</span><strong>{scorerQuote?`${scorerQuote.price>0?'+':''}${scorerQuote.price}`:'—'}</strong></div>
            </>:<>
            <div>
              <b>{card.marketLabel}</b>
              <span>
                {footballScorer?"TD target":binaryEvent
                  ? "Binary market"
                  : "O/U"}
              </span>
              <strong>
                {footballScorer?scorerTarget(card.market):binaryEvent
                  ? "YES"
                  : propLineText(card.sportsbookLine)}
              </strong>
            </div>
            <div>
              <b>
                {binaryEvent
                  ? "HR Probability"
                  : "Sach Projection"}
              </b>
              <span>{displayedAverage==null?'Unavailable':'Model estimate'}</span>
              <strong>
                {binaryEvent
                  ? card.modelProbability == null
                    ? "—"
                    : `${shortNumber(card.modelProbability)}%`
                  : shortNumber(displayedAverage)}
              </strong>
            </div>
            <div>
              <b>{state === "pregame" ? "Projection vs line" : "Actual"}</b>
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
              <b>EV</b>
              <span>Expected return</span>
              <strong title={evNotice} style={{borderColor:evText.startsWith("-")?"#ef7777":evText==="—"?"#686b72":"var(--green)"}}>{evText}</strong>
            </div>
            </>}
          </div>

          {researchOnly ? null : state === "pregame" ? (
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

          {!firstBasket?<section className={styles.intelSection}>
            <h4>{researchOnly ? "Player Analysis" : state === "final" ? "Final Insights" : state === "live" ? "Live Insights" : "Why Sach Likes This"}</h4>
            <div className={styles.reasonList}>
              {(reasons.length ? reasons : [card.summary]).map((reason, index) => (
                <p key={`${reason}-${index}`}>
                  <span>✓</span>
                  {reason}
                </p>
              ))}
            </div>
          </section>:null}

          {!firstBasket?<section className={styles.intelSection}>
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
                key={`${card.playerId}|${card.market}|${formSpan}`}
                points={historyPoints.slice(-formSpan)}
                statLabel={card.market.replaceAll("_"," ")}
                values={recentFormValues}
                line={card.sportsbookLine}
                projection={displayedAverage}
                liveValue={state === "live" ? current : null}
              />
            )}
          </section>:null}

          <section className={styles.intelSection}>
            <h4>{state === "live" ? "Matchup (Live)" : state === "final" ? "Matchup Result" : "Matchup"}</h4>
            <div className={styles.matchupBox}>
              <strong>{card.matchup || "Matchup context"}</strong>
              <p>{card.gameStatus || (state === "pregame" ? "Scheduled" : state === "live" ? "In progress" : "Final")}</p>
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
              <h4>Book Lines</h4>
              {card.bookmakerCount != null ? <p>{card.bookmakerCount} sportsbook sources</p> : null}
              <div className={styles.lineMovement}>
                <div>
                  <span>Open</span>
                  <strong>{shortNumber(card.openingLine)}</strong>
                </div>
                <b>→</b>
                <div>
                  <span>{researchOnly ? "Recorded quote" : state === "pregame" ? "Current" : "Close"}</span>
                  <strong>{propLineText(card.sportsbookLine)}</strong>
                </div>
                {lineMovement != null && lineMovement !== 0 ? (
                  <em>
                    {`${lineMovement >= 0 ? "+" : ""}${propLineText(lineMovement)}`}
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
                {playerAvailability({...card.raw,gameState:card.gameState}).detail}
              </p>
              {playerAvailabilityNote(card.raw) ? <p>{playerAvailabilityNote(card.raw)!.text} · {playerAvailabilityNote(card.raw)!.source}{playerAvailabilityNote(card.raw)!.reportedAt ? ` · reported ${new Date(playerAvailabilityNote(card.raw)!.reportedAt!).toLocaleString()}` : playerAvailabilityNote(card.raw)!.checkedAt ? ` · checked ${new Date(playerAvailabilityNote(card.raw)!.checkedAt!).toLocaleString()}` : " · report date unavailable"}</p> : null}

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
const rankingViewCache = new Map<string,{at:number;cards:RankingCard[];dropped:any[]}>();
const JSON_FRESH_MS = 45_000;
const JSON_STALE_MS = 5 * 60_000;

async function networkJson(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(45000),
  });

  if (!response.ok) {
    throw new Error(`Ranking request failed: ${response.status}`);
  }

  const payload = await response.json();
  if(!payload||payload.success===false)throw new Error(payload?.error||'Ranking data is unavailable');
  rankingJsonCache.set(url, { at: Date.now(), payload });
  // Warm the visible preview while the user is still on the prior category.
  for (const row of (payload?.rows || []).slice(0,15)) {
    if (row.headshot) void prepareRankingImage(row.headshot);
    if (row.teamLogo) void prepareRankingImage(row.teamLogo);
  }
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
    running = sharedJsonRequest(rankingJsonInflight,url,()=>networkJson(url));
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
    const work = sharedJsonRequest(rankingJsonInflight,url,()=>networkJson(url));
    void work.catch(() => {});
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
    nbaSlateRequest("points","active"),
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
  return rankingGameForRow({...card.raw,matchup:card.matchup,teamName:card.teamName,gameTime:card.gameTime},games);
}

function applySharedGameStatus(card: RankingCard, game: SharedStatusGame | null) {
  if (!game) return card;
  const state = String(game.state || "").toLowerCase();
  if (state !== "in" && state !== "post") return card;
  const gameStatus = String(game.status || (state === "in" ? "In Progress" : "Final"));
  return {
    ...card,
    lineupStatus: card.lineupStatus,
    gameState: state,
    gameStatus,
    raw: {
      ...(card.raw || {}),
      gameState: state,
      gameStatus,
      isLive: state === "in",
      isFinal: state === "post",
      completed: state === "post",
      lineupConfirmed: card.raw?.lineupConfirmed===true,
      confirmed: card.raw?.confirmed===true,
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
  const id=String(card.raw?.gameId||"");
  return id?games.find(game=>String(game.gameId||"")===id)||null:null;
}

function cfbLivePlayerValue(game: CfbLiveGame | null, card: RankingCard) {
  if (!game) return null;

  const id = String(card.playerId || "");
  const row = (game.rows || []).find((item)=>id&&String(item.playerId||"")===id);

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
      liveCurrent: isLive ? value : card.liveCurrent,
      actualResult: isFinal && value != null ? value : card.actual,
      ...(isFinal&&value!=null?{officialFinalObservation:{sport:'cfb',gameId:String(game.gameId),playerId:String(card.playerId),market:card.market,value,at:new Date().toISOString()}}:{}),
      liveProgressPct,
      frozen: true,
      lockedAtKickoff: true,
    },
  };
}

export function PlayerRankingsPanel({
  sport,
  onPickCount,
}: {
  sport: RankingsSport;
  onPickCount?: (summary: {market:string;count:number}) => void;
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
  const [pendingHeight,setPendingHeight]=useState(0);
  const cardsRegionRef=useRef<HTMLDivElement|null>(null);
  const [error, setError] = useState("");
  const [league, setLeague] = useState("eng.1");
  const [cfbSlate, setCfbSlate] = useState<CfbSlateKey>("all");
  const [nbaSlate,setNbaSlate]=useState("active");
  const [nbaBoardLabel,setNbaBoardLabel]=useState("");
  const [nflSlate, setNflSlate] = useState<CfbSlateKey>("all");
  const [cfbLiveGames, setCfbLiveGames] = useState<CfbLiveGame[]>([]);
  const [sharedStatusGames, setSharedStatusGames] = useState<SharedStatusGame[]>([]);
  const [blockExpanded,setBlockExpanded] = useState<Record<string,boolean>>({});
  const rankingRequestSeq = useRef(0);
  const groupScroll = useHorizontalScroll();
  const marketScroll = useHorizontalScroll();

  useEffect(()=>{
    if(loading||error||cards.some(card=>card.market!==market.key))return;
    onPickCount?.({market:market.key,count:cards.filter(card=>!excludeUnavailableRanking(card.raw)&&(card.market==='first_basket'?firstBasketQuote(card.raw)!=null:card.raw?.withdrawnFromBoard!==true&&card.raw?.resultStatus!=="void"&&(cardModelPick(card.raw)||(['nfl','cfb'].includes(sport)&&footballForecastDisplay(card.raw).side)))).length});
  },[cards,loading,error,market.key,onPickCount]);

  const viewCacheKey = (
    nextGroup: string,
    nextMarket: string,
    nextSlate: CfbSlateKey = cfbSlate
  ) => `${torontoDay()}|${sport}|${league}|${nextGroup}|${nextMarket}|${sport === "cfb" ? nextSlate : sport === "nba" ? nbaSlateRequest(nextMarket,nbaSlate) : "all"}`;

  const restoreView = (nextGroup:string,nextMarket:string,nextSlate:CfbSlateKey=cfbSlate) => {
    const saved=rankingViewCache.get(viewCacheKey(nextGroup,nextMarket,nextSlate));
    if(saved&&Date.now()-saved.at<JSON_STALE_MS){setCards(saved.cards);setDropped(saved.dropped);setLoading(false);}
  };

  useEffect(()=>{
    if(!cards.length||cards.some(card=>card.market!==market.key))return;
    rankingViewCache.set(viewCacheKey(group.key,market.key,cfbSlate),{at:Date.now(),cards,dropped});
  },[cards,dropped,sport,league,group.key,market.key,cfbSlate,nbaSlate]); // eslint-disable-line react-hooks/exhaustive-deps

  const resetCfbMarketView = () => {
    // Set loading in the same render as the selected tab. The previous
    // market must never appear under the new title, even for one frame.
    rankingRequestSeq.current+=1;
    setError("");
    setPendingHeight(cardsRegionRef.current?.getBoundingClientRect().height||0);
    setLoading(true);
    setFull(false);
    setShowDropped(false);
  };

  const selectGroup = (item: Group) => {
    if (item.key === group.key) return;

    resetCfbMarketView();
    setGroupKey(item.key);
    setMarketKey(item.markets[0].key);
    restoreView(item.key,item.markets[0].key);
  };

  const selectMarket = (key: string) => {
    if (key === market.key) return;

    resetCfbMarketView();
    setMarketKey(key);
    restoreView(group.key,key);
  };

  const selectCfbSlate = (key: CfbSlateKey) => {
    if (sport !== "cfb" || key === cfbSlate) return;

    resetCfbMarketView();
    setCfbSlate(key);
    restoreView(group.key,market.key,key);
  };

  const selectNbaSlate = (key: string) => {
    if (sport !== "nba" || key === nbaSlate) return;
    rankingRequestSeq.current += 1;
    setCards([]);
    setDropped([]);
    setNbaBoardLabel("");
    setError("");
    setLoading(true);
    setFull(false);
    setShowDropped(false);
    setNbaSlate(key);
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
        // Warm one likely next category, after the current request finishes.
        const currentUrl=`/api/cfb/rankings-board?market=${encodeURIComponent(market.key)}&slate=${encodeURIComponent(cfbSlate)}`;
        prefetchJson(currentUrl);
        const nextMarket=group.key===config.groups[0].key
          ?config.groups[1]?.markets[0]
          :group.markets[group.markets.findIndex(item=>item.key===market.key)+1];
        if(nextMarket)void(rankingJsonInflight.get(currentUrl)||Promise.resolve()).then(()=>prefetchJson(`/api/cfb/rankings-board?market=${encodeURIComponent(nextMarket.key)}&slate=${encodeURIComponent(cfbSlate)}`));
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

      // NBA history recovery and roster loading are expensive. Prefetch only
      // the next market, with the correct slate; never fan out concurrently.
      for (const item of (sport === "nba" ? neighbors.slice(0,1) : neighbors)) {
        prefetchJson(sport === "nba" ? nbaSlateRequest(item.key,nbaSlate) : `/api/${sport}/rankings?market=${encodeURIComponent(item.key)}`);
      }
    }, 120);

    return () => window.clearTimeout(timer);
  }, [sport, league, groupKey, market.key, cfbSlate, nbaSlate]); // eslint-disable-line react-hooks/exhaustive-deps


  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    const requestId = ++rankingRequestSeq.current;
    const requestedMarket = market.key;
    const requestedCfbSlate = cfbSlate;
    const requestedNbaSlate = nbaSlate;

    let running=false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      if(running)return;
      running=true;
      if(retryTimer)clearTimeout(retryTimer);
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
          const resultUrl=`/api/soccer/performance?period=Week&market=${encodeURIComponent(market.key)}&league=${encodeURIComponent(league)}`;
          performance=rankingJsonCache.get(resultUrl)?.payload||null;
          prefetchJson(resultUrl);
        } else {
          const rankingUrl =
            sport === "cfb"
              ? `/api/cfb/rankings-board?market=${encodeURIComponent(market.key)}&slate=${encodeURIComponent(requestedCfbSlate)}`
              : sport === "nba" ? nbaSlateRequest(market.key,nbaSlate) : `/api/${sport}/rankings?market=${encodeURIComponent(market.key)}`;

          // Never make rankings wait for grading/performance data.
          const rankingPayload = await fetchJson(
            rankingUrl,
            controller.signal
          );

          if(!alive||controller.signal.aborted||requestId!==rankingRequestSeq.current)return;
          const requestedDay=new URL(rankingUrl,window.location.origin).searchParams.get('day');
          const scoped=sport==='nba'?scopedNbaBoard(rankingPayload,requestedMarket,requestedDay||rankingPayload?.boardDay||nbaFixtureDay(new Date())):rankingPayload;
          rawRows = scoped?.rows || [];
          if(sport==="nba")setNbaBoardLabel(scoped?.boardDay||"");
          rawDropped = scoped?.dropped || [];

          const performanceUrl =
            `/api/${sport}/performance?period=${sport==="nba"?"Week":"Today"}&market=${encodeURIComponent(market.key)}`;
          performance = rankingJsonCache.get(performanceUrl)?.payload || null;
          // Performance is secondary to the ranking board. Do not start a
          // second expensive request while CFB is still assembling its slate.
          if (sport !== "cfb") prefetchJson(performanceUrl);
        }

        const movementScope=[sport,league,requestedMarket,requestedCfbSlate,sport==="nba"?nbaSlate:"",rawRows[0]?.boardDay||torontoDay(new Date().toISOString())].join("|");
        try{
          const stored=window.localStorage.getItem("sach-rank-movement-v2|"+movementScope);
          const tracked=trackRankBoard(rawRows,stored?JSON.parse(stored) as RankBoard:null,movementScope);
          rawRows=tracked.rows.map((r:any)=>r.boardFrozen?{...r,movement:'same'}:r);window.localStorage.setItem("sach-rank-movement-v2|"+movementScope,JSON.stringify(tracked.board));
        }catch{rawRows=trackRankBoard(rawRows,null,movementScope).rows}
        const normalized = rawRows
          .slice(0, ["nfl","cfb"].includes(sport) ? 75 : 25)
          .map((row: any) => {
            let enriched = row;
            let result = performance
              ? resultForPlayer(sport==='nba'||sport==='wnba'?{results:performance.sachPickPerformance?.results||[]}:performance, row)
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
                  lineupConfirmed: row?.lineupConfirmed === true || /^confirmed starter$/i.test(String(row?.availability||"")),
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
          (sport === "cfb" && requestedCfbSlate !== cfbSlate) ||
          (sport === "nba" && requestedNbaSlate !== nbaSlate)
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

        // Cards render immediately; image decoding must not delay the board.
        const staged = isolated;
        for(const card of staged.slice(0,5)){
          if(card.headshot)void prepareRankingImage(card.headshot);
          if(card.teamLogo)void prepareRankingImage(card.teamLogo);
        }
        if(!alive||controller.signal.aborted||requestId!==rankingRequestSeq.current)return;
        // The cards effect caches the merged state after official final
        // observations are retained; never publish the stale staged board.
        setCards(previous=>staged.map(card=>{
          const old=previous.find(p=>p.playerId===card.playerId&&p.market===card.market&&String(p.raw?.gameId||'')===String(card.raw?.gameId||''));
          const raw=retainParticipation(card.raw,old?.raw);
          return retainCardFinal({...card,raw,lineupStatus:playerAvailability({...raw,gameState:card.gameState}).confirmed?"Confirmed":"Pending"},old);
        }));
        setDropped(rawDropped);
      } catch (cause) {
        if (!alive || controller.signal.aborted || requestId!==rankingRequestSeq.current) return;
        // Keep the last good board on screen. A background refresh failure
        // should never turn the ranking section into a blank panel.
        setError(
          cause instanceof Error
            ? /abort|timeout|timed out/i.test(cause.message) ? "Rankings are taking longer than expected. Retrying…" : "Player rankings are temporarily unavailable. Retrying…"
            : "Player rankings are temporarily unavailable."
        );
        retryTimer=setTimeout(run,5000);
      } finally {
        running=false;
        if (
          alive &&
          requestId === rankingRequestSeq.current &&
          requestedMarket === market.key &&
          (sport !== "cfb" || requestedCfbSlate === cfbSlate) &&
          (sport !== "nba" || requestedNbaSlate === nbaSlate)
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
      if(retryTimer)clearTimeout(retryTimer);
    };
  }, [sport, groupKey, marketKey, league, cfbSlate, nbaSlate]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!["nfl","cfb","nhl","nba","wnba","cbb"].includes(sport) || !cards.length) return;

    const statusGames = cardObservationGames(sharedStatusGames,cards).filter(
      (game) => game.id && cards.some(card=>sharedGameForCard(card,[game])!=null)
    );
    if (!statusGames.length) return;

    let cancelled = false;
    const pregameFetched=new Map<string,number>();

    const run = async () => {
      const payloads = await Promise.all(
        statusGames.map(async (game) => {
          if(game.state==="pre"){
            const last=pregameFetched.get(String(game.id))||0;
            const refreshMs=Date.parse(game.date||"")-Date.now()>2*60*60_000?5*60_000:60_000;
            if(Date.now()-last<refreshMs)return {game,payload:null};
            pregameFetched.set(String(game.id),Date.now());
          }
          try {
            const response = await fetch(
              sport === "nfl" || sport === "cfb" ? `/api/football/live-player-stats?sport=${sport}&gameId=${encodeURIComponent(String(game.id))}` : sport === "nhl" ? `/api/nhl/live-player-stats?gameId=${encodeURIComponent(String(game.id))}` : `/api/basketball/live-player-stats?sport=${sport}&gameId=${encodeURIComponent(String(game.id))}`,
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
          const game = sharedGameForCard(card, statusGames);
          if (!game) return card;

          const payload = payloads.find(
            (entry) => String(entry.game.id) === String(game.id)
          )?.payload;

          const row = (payload?.rows || []).find((item:any)=>String(item.playerId||"")===String(card.playerId||""));

          const participant = payload?.success===true && String(payload.gameId)===String(game.id)
            ? (payload.participants||[]).find((p:any)=>String(p.playerId)===String(card.playerId)) : null;
          const updatedRaw=applyParticipationEvidence({...card.raw,gameId:String(game.id),playerId:card.playerId},payload,String(game.id));
          const current = payload?.success===true&&String(payload.gameId)===String(game.id)?finite(row?.stats?.[card.market]):null;
          if (current == null) {
            const checkedQuarter=['nfl','cfb','nba'].includes(sport)&&card.market.startsWith('q1_')&&row?.stats&&Object.hasOwn(row.stats,card.market);
            return payload?.success===true&&String(payload.gameId)===String(game.id) ? {...card,...(checkedQuarter?{actual:null,liveCurrent:null,liveProgressPct:null}:{}),raw:{...updatedRaw,...(checkedQuarter?{quarterObservationChecked:true,observedQuarterValue:null,actualResult:null,liveCurrent:null,officialFinalObservation:null}: {})},lineupStatus:playerAvailability({...updatedRaw,gameState:game.state}).confirmed?"Confirmed":"Pending"} : card;
          }

          const progress =
            card.sportsbookLine != null && card.sportsbookLine > 0
              ? Math.max(0, Math.min(200, (current / card.sportsbookLine) * 100))
              : card.liveProgressPct;

          return {
            ...card,
            lineupStatus:playerAvailability({...updatedRaw,gameState:game.state}).confirmed?"Confirmed":"Pending",
            gameState:payload.state==="post"?"post":String(game.state||card.gameState),
            liveCurrent: game.state === "in" ? current : card.liveCurrent,
            actual: payload.state === "post" || game.state === "post" ? current : card.actual,
            liveProgressPct: progress,
            raw: {
              ...updatedRaw,
              ...(['nfl','cfb','nba'].includes(sport)&&card.market.startsWith('q1_')?{quarterObservationChecked:true,observedQuarterValue:current}:{}),
              gameState:payload.state==="post"?"post":String(game.state||card.gameState),
              liveCurrent: game.state === "in" ? current : card.liveCurrent,
              actualResult: payload.state === "post" || game.state === "post" ? current : card.actual,
              ...(payload.state==='post'||game.state==='post'?{officialFinalObservation:{sport,gameId:String(game.id),playerId:String(card.playerId),market:card.market,value:current,at:payload.updatedAt||new Date().toISOString()}}:{}),
              liveStatsUpdatedAt: payload.updatedAt,
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

    const withStatus = cards.filter(card=>card.market===market.key)
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
        if(sport==='nba'&&(excludeUnavailableRanking(card.raw)||!publicNbaRanking(card.raw)))return false;
        if (card.raw?.boardFrozen === true) return true;
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
    if (!((sport === "cfb" && cfbSlate === "all")||(sport === "nfl" && nflSlate === "all"))) return [];
    return rankingTimeBlocks(displayCards);
  }, [sport, cfbSlate, nflSlate, displayCards]);

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
          <h2>{["nfl","cfb"].includes(sport)?"Top Plays":"Top 25 Rankings"}</h2>
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

      {sport==='nba'?<div className={styles.tabsFrame}><div className={styles.tabs} aria-label="NBA ranking slate">{[['active','Live / current slate'],['previous','Previous slate'],['today','Today'],['tomorrow','Tomorrow']].map(([key,label])=><button type="button" key={key} className={nbaSlate===key?styles.activeTab:''} onClick={()=>selectNbaSlate(key)}>{label}</button>)}</div></div>:null}

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
        <div className={`${styles.tabs} ${sport === "nba" ? styles.nbaMarketTabs : ""}`} role="group" aria-label={`${sport.toUpperCase()} player prop markets`} ref={marketScroll.ref}>
          {group.markets.map((item) => (
            <button
              type="button"
              key={item.key}
              className={item.key === market.key ? styles.activeTab : ""}
              aria-pressed={item.key === market.key}
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
          {["nfl","cfb"].includes(sport)?"Top Plays":"Top 25"} · {sourceText}
          {sport==='nba'&&nbaBoardLabel?` · ${nbaBoardLabel}`:''}
          {sport==='nba'&&displayCards.some(c=>c.raw?.boardFrozen)?' · Locked at first tipoff':''}
        </p>
      </div>

      {dropped.length ? (
        <div className={styles.dropped}>
          <button
            type="button"
            onClick={() => setShowDropped((value) => !value)}
          >
            DROPPED from {["nfl","cfb"].includes(sport)?"Top Plays":"Top 25"} ({dropped.length}) {showDropped ? "⌃" : "⌄"}
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

      {error ? (
        <div className={styles.state}>{error}</div>
      ) : null}

      <div className={styles.cards} ref={cardsRegionRef} style={loading&&pendingHeight?{minHeight:pendingHeight}:undefined} aria-busy={loading}>
        {loading&&!displayCards.length?<div className={styles.skeletonStack} aria-label={`Loading ${market.label} rankings`}>
          {[0,1,2].map(item=><div className={styles.skeletonCard} key={item}><i/><span/><b/><em/></div>)}
        </div>:null}
        {((sport === "cfb" && cfbSlate === "all")||(sport === "nfl" && nflSlate === "all"))
          ? cfbAllDayGroups.map((block) => (
              <section key={block.key} style={{ marginBottom: 18, paddingTop: 4 }}>
                <button type="button" aria-expanded={blockExpanded[`${market.key}|${block.key}`] ?? !block.completed}
                  aria-controls={`cfb-block-${block.key}`}
                  onClick={()=>setBlockExpanded(previous=>({...previous,[`${market.key}|${block.key}`]:!(previous[`${market.key}|${block.key}`]??!block.completed)}))}
                  style={{ display: "flex", width:"100%", background:"transparent", cursor:"pointer", border:0, textAlign:"left", justifyContent: "space-between", alignItems: "center", gap: 10, borderBottom: "1px solid rgba(229,187,69,.35)", padding: "8px 2px", marginBottom: 8 }}>
                  <strong style={{ color: "#e5bb45" }}>{block.label}</strong>
                  <span style={{ color: "#9da1a8", fontSize: 11 }}>{block.completed?"Final · ":""}{block.rows.length} saved · {(blockExpanded[`${market.key}|${block.key}`]??!block.completed)?"Collapse ⌃":"Expand ›"}</span>
                </button>
                {(blockExpanded[`${market.key}|${block.key}`]??!block.completed) ? <div id={`cfb-block-${block.key}`}>
                  {(full ? block.rows : block.rows.slice(0, 5)).map((card) => (
                    <PlayerCard key={`${sport}-${market.key}-${block.key}-${card.playerId}-${card.raw?.gameId}`} card={card} sport={sport} league={league} />
                  ))}
                </div> : null}
              </section>
            ))
          : visible.map((card) => (
              <PlayerCard key={`${sport}-${market.key}-${card.playerId}-${card.raw?.gameId}`} card={card} sport={sport} league={league} />
            ))}
      </div>

      {!loading && !error && !displayCards.length ? (
        <div className={styles.state}>
          {sport === 'nba' && (market.key.startsWith('q1_') || market.key === 'first_basket') ? `No verified ${market.label} data is available for this slate.` : <>No eligible {market.label} rankings are available for the current slate.</>}
        </div>
      ) : null}

      {displayCards.length > (["nfl","cfb"].includes(sport) ? 15 : 5) ? (
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
              : (["nfl","cfb"].includes(sport)?"View All Top Plays":"View Full Top 25")}
        </button>
      ) : null}
    </div>
  );
}

