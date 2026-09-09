export type MlbGame = {
  gamePk: number;
  gameDate: string;
  startTime: string;
  status: string;
  statusCode: string;
  statusGroup: "preview" | "live" | "final" | "other";
  isDelayed: boolean;
  isLive: boolean;
  isFinal: boolean;
  venue: string;
  away: MlbTeamSide;
  home: MlbTeamSide;
};

export type MlbTeamSide = {
  id: number | null;
  name: string;
  score: number | null;
  probablePitcher: string;
};

export type RankingRow = Record<string, unknown> & {
  rank?: number;
  player_id?: number | string;
  pitcher_id?: number | string;
  player_name?: string;
  pitcher_name?: string;
  headshot_url?: string;
  team_abbreviation?: string;
  team_name?: string;
  opponent_abbreviation?: string;
  opponent_name?: string;
  opposing_probable_pitcher?: string;
  probable_pitcher?: string;
  gi_score?: number;
  probability?: number;
  hr_probability?: number;
  projection?: number;
  lineup_confirmed?: boolean;
  batting_order?: number;
  position_abbreviation?: string;
};

export const BATTER_MARKETS = [
  ["home_runs", "🔥", "Home Runs"],
  ["hits", "⚾", "Hits"],
  ["total_bases", "💥", "Total Bases"],
  ["runs", "🏃", "Runs"],
  ["rbis", "🎯", "RBIs"],
  ["walks", "👁️", "Walks"],
  ["stolen_bases", "💨", "Stolen Bases"],
  ["hits_runs_rbis", "📊", "H+R+RBI"],
] as const;

export const PITCHER_MARKETS = [
  ["strikeouts", "🎯", "Strikeouts"],
  ["outs_recorded", "⏱️", "Outs"],
  ["hits_allowed", "⚾", "Hits Allowed"],
  ["walks_allowed", "◎", "Walks Allowed"],
  ["earned_runs", "🏃", "Earned Runs"],
] as const;

export function teamLogo(teamId: number | null | undefined) {
  return teamId ? `https://www.mlbstatic.com/team-logos/${teamId}.svg` : "";
}

export function playerHeadshot(playerId: string | number | null | undefined) {
  return playerId
    ? `https://img.mlbstatic.com/mlb-photos/image/upload/w_180,q_auto:best/v1/people/${playerId}/headshot/67/current`
    : "";
}

export function numberValue(value: unknown, digits = 1) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : "—";
}

export function percentValue(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${n <= 1 ? Math.round(n * 100) : Math.round(n)}%`;
}

export function rankingPlayerId(row: RankingRow) {
  return row.player_id ?? row.pitcher_id ?? "";
}

export function rankingName(row: RankingRow) {
  return String(row.player_name ?? row.pitcher_name ?? "MLB Player");
}
