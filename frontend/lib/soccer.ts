export const SOCCER_LEAGUES = [
  ["Premier League", "eng.1"],
  ["MLS", "usa.1"],
  ["Champions League", "uefa.champions"],
  ["La Liga", "esp.1"],
  ["Serie A", "ita.1"],
  ["Bundesliga", "ger.1"],
  ["Ligue 1", "fra.1"],
] as const;

export const SOCCER_MARKETS = [
  ["shots_on_target", "🎯", "Shots on Target"],
  ["shots", "👟", "Shots"],
  ["saves", "🧤", "Goalkeeper Saves"],
  ["goals", "⚽", "Goals"],
  ["assists", "🅰️", "Assists"],
] as const;

export type SoccerMarketKey = typeof SOCCER_MARKETS[number][0];

export type SoccerGame = {
  gameId: string;
  kickoff: string;
  awayTeam: string;
  homeTeam: string;
  awayTeamId: string;
  homeTeamId: string;
  awayLogo?: string;
  homeLogo?: string;
  awayScore?: string | number | null;
  homeScore?: string | number | null;
  status: string;
  state: string;
  completed: boolean;
};

export type SoccerRanking = {
  rank: number;
  playerId: string;
  playerName: string;
  photoUrl?: string;
  team: string;
  teamId: string;
  position: string;
  matchup: string;
  opponent: string;
  homeAway: string;
  kickoff?: string;
  games: number;
  avgMetric: number;
  lastMetric: number;
  avgMinutes: number;
  expectedMinutes: number;
  startRate: number;
  projection: number;
  modelTarget: number;
  modelProbability: number;
  giScore: number;
  availability: string;
  why: string;
  sportsbook?: string;
  marketLine?: number;
  overOdds?: number | null;
  underOdds?: number | null;
};

export type SoccerMatchupIntel = {
  gameId: string;
  matchup: string;
  kickoff: string;
  status: string;
  reason: string;
  bestProp: string;
  rankedPlayers: number;
  playersToWatch: string[];
};

export type SoccerRosterPlayer = {
  playerId: string;
  playerName: string;
  photoUrl?: string;
  position: string;
  jersey?: string;
};

export type SoccerRosterResponse = {
  success: boolean;
  teamId: string;
  teamName: string;
  players: SoccerRosterPlayer[];
  error?: string;
};

export type SoccerDashboardResponse = {
  success: boolean;
  league: string;
  leagueSlug: string;
  updatedAt: string;
  games: SoccerGame[];
  rankings: Record<SoccerMarketKey, SoccerRanking[]>;
  matchupIntelligence: SoccerMatchupIntel[];
  playersTracked: number;
  propSource?: string;
  propCounts?: Record<string, number>;
  owls?: {
    received: number;
    matchedToSelectedLeagueSlate: number;
    meta?: unknown;
  };
  historyDiagnostics?: {
    currentTeams: number;
    rosterPlayers: number;
    historicalEvents: number;
    appearancesParsed: number;
    playersWithHistory: number;
    rankingRowsWithHistory: number;
    corePlayersRequested?: number;
    corePlayersMatched?: number;
    corePlayersWithHistory?: number;
    coreAppearancesParsed?: number;
  };
  errors?: string[];
};
