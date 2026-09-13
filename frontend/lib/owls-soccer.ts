export type SoccerPropMetric =
  | "shots_on_target"
  | "shots"
  | "saves"
  | "goals"
  | "assists";

export type OwlsSoccerProp = {
  playerName: string;
  metric: SoccerPropMetric;
  line: number;
  book: string;
  overOdds: number | null;
  underOdds: number | null;
  team: string;
  eventText: string;
  rawCategory: string;
};

const BOOK_KEYS = new Set([
  "pinnacle",
  "bet365",
  "fanduel",
  "draftkings",
  "caesars",
  "betmgm",
  "kalshi",
  "novig",
  "polymarket",
]);

function str(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[^\d+.-]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstString(obj: Record<string, any>, keys: string[]) {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (value && typeof value === "object") {
      for (const nestedKey of ["name", "displayName", "fullName", "label", "title"]) {
        if (typeof value[nestedKey] === "string" && value[nestedKey].trim()) {
          return value[nestedKey].trim();
        }
      }
    }
  }
  return "";
}

function firstNumber(obj: Record<string, any>, keys: string[]) {
  for (const key of keys) {
    const value = numeric(obj[key]);
    if (value !== null) return value;
  }
  return null;
}

function normalizeCategory(value: string): SoccerPropMetric | null {
  const key = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (
    key.includes("shots_on_target") ||
    key.includes("shot_on_target") ||
    key.includes("shotsontarget") ||
    key === "sot"
  ) {
    return "shots_on_target";
  }

  if (
    key === "shots" ||
    key.includes("player_shots") ||
    key.includes("total_shots") ||
    key.includes("shots_attempted")
  ) {
    return "shots";
  }

  if (
    key === "saves" ||
    key.includes("goalkeeper_saves") ||
    key.includes("goalie_saves") ||
    key.includes("keeper_saves")
  ) {
    return "saves";
  }

  if (
    key === "goals" ||
    key.includes("anytime_goalscorer") ||
    key.includes("goalscorer") ||
    key.includes("player_goals")
  ) {
    return "goals";
  }

  if (
    key === "assists" ||
    key.includes("player_assists") ||
    key.includes("soccer_assists")
  ) {
    return "assists";
  }

  return null;
}

function oddsFromSide(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "string") return numeric(value);

  if (typeof value === "object") {
    const obj = value as Record<string, any>;
    for (const key of [
      "americanOdds",
      "american",
      "odds",
      "price",
      "priceAmerican",
      "american_price",
    ]) {
      const parsed = numeric(obj[key]);
      if (parsed !== null) return parsed;
    }
  }

  return null;
}

function playerNameFrom(obj: Record<string, any>) {
  const direct = firstString(obj, [
    "playerName",
    "player_name",
    "player",
    "athleteName",
    "athlete_name",
    "athlete",
    "participantName",
    "participant_name",
  ]);

  if (direct) return direct;

  // Common outcome shape: description/name is the player while the parent carries the market.
  const outcomeName = firstString(obj, ["description", "runnerName", "selectionName"]);
  return outcomeName;
}

function categoryFrom(obj: Record<string, any>) {
  return firstString(obj, [
    "category",
    "propType",
    "prop_type",
    "marketType",
    "market_type",
    "market",
    "stat",
    "statType",
    "stat_type",
    "type",
    "key",
    "label",
  ]);
}

function lineFrom(obj: Record<string, any>) {
  return firstNumber(obj, [
    "line",
    "points",
    "total",
    "value",
    "threshold",
    "handicap",
    "strike",
    "overUnder",
    "over_under",
  ]);
}

function eventTextFrom(obj: Record<string, any>) {
  const pieces = [
    firstString(obj, ["eventName", "event_name", "gameName", "game_name", "matchup", "name", "title"]),
    firstString(obj, ["homeTeam", "home_team", "home"]),
    firstString(obj, ["awayTeam", "away_team", "away"]),
    firstString(obj, ["team", "teamName", "team_name"]),
    firstString(obj, ["league", "competition", "tournament"]),
  ].filter(Boolean);
  return pieces.join(" | ");
}

function bookFrom(obj: Record<string, any>, inheritedBook: string) {
  const direct = firstString(obj, ["book", "sportsbook", "bookmaker", "source"]).toLowerCase();
  if (direct) return direct;
  return inheritedBook;
}

function walk(
  node: unknown,
  inherited: {
    book: string;
    category: string;
    eventText: string;
    team: string;
  },
  out: OwlsSoccerProp[],
  depth = 0,
) {
  if (depth > 12 || node === null || node === undefined) return;

  if (Array.isArray(node)) {
    for (const item of node) walk(item, inherited, out, depth + 1);
    return;
  }

  if (typeof node !== "object") return;

  const obj = node as Record<string, any>;
  const localBook = bookFrom(obj, inherited.book);
  const localCategory = categoryFrom(obj) || inherited.category;
  const localEventText = [inherited.eventText, eventTextFrom(obj)].filter(Boolean).join(" | ");
  const localTeam =
    firstString(obj, ["team", "teamName", "team_name", "club", "clubName"]) || inherited.team;

  const playerName = playerNameFrom(obj);
  const metric = normalizeCategory(localCategory);
  const line = lineFrom(obj);

  if (playerName && metric && line !== null && line >= 0) {
    const overOdds =
      oddsFromSide(obj.over) ??
      oddsFromSide(obj.overOdds) ??
      oddsFromSide(obj.over_odds) ??
      oddsFromSide(obj.overPrice) ??
      oddsFromSide(obj.over_price);

    const underOdds =
      oddsFromSide(obj.under) ??
      oddsFromSide(obj.underOdds) ??
      oddsFromSide(obj.under_odds) ??
      oddsFromSide(obj.underPrice) ??
      oddsFromSide(obj.under_price);

    out.push({
      playerName,
      metric,
      line,
      book: localBook || "owls",
      overOdds,
      underOdds,
      team: localTeam,
      eventText: localEventText,
      rawCategory: localCategory,
    });
  }

  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;

    const nextBook =
      BOOK_KEYS.has(key.toLowerCase()) ? key.toLowerCase() : localBook;

    const keyMetric = normalizeCategory(key);
    const nextCategory = keyMetric ? key : localCategory;

    walk(
      value,
      {
        book: nextBook,
        category: nextCategory,
        eventText: localEventText,
        team: localTeam,
      },
      out,
      depth + 1,
    );
  }
}

export function parseOwlsSoccerProps(payload: unknown): OwlsSoccerProp[] {
  const rows: OwlsSoccerProp[] = [];
  walk(payload, { book: "", category: "", eventText: "", team: "" }, rows);

  const seen = new Set<string>();
  const deduped: OwlsSoccerProp[] = [];

  for (const row of rows) {
    const key = [
      row.playerName.toLowerCase(),
      row.metric,
      row.line,
      row.book.toLowerCase(),
      row.eventText.toLowerCase(),
    ].join("|");

    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }

  return deduped;
}

export function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(fc|afc|cf|sc|club)\b/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

export function americanImplied(odds: number | null) {
  if (odds === null || !Number.isFinite(odds)) return null;
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

export function fairOverProbability(
  overOdds: number | null,
  underOdds: number | null,
) {
  const over = americanImplied(overOdds);
  const under = americanImplied(underOdds);

  if (over === null && under === null) return null;
  if (over !== null && under === null) return over * 100;
  if (over === null && under !== null) return (1 - under) * 100;

  const total = (over || 0) + (under || 0);
  if (total <= 0) return null;
  return ((over || 0) / total) * 100;
}
