export const NFL_MARKETS = [
  ["passing_yards", "🏈", "Passing Yards"],
  ["passing_tds", "🎯", "Passing TDs"],
  ["qb_rushing_yards", "🏃", "QB Rushing Yards"],
  ["passing_rushing_yards", "⚡", "Passing + Rushing Yards"],
  ["rushing_yards", "🏃", "Rushing Yards"],
  ["rushing_tds", "🏁", "Rushing TDs"],
  ["receiving_yards", "🙌", "Receiving Yards"],
  ["receptions", "🧤", "Receptions"],
  ["rushing_receiving_yards", "🔀", "Rushing + Receiving Yards"],
  ["anytime_td", "🔥", "Anytime TD"],
  ["first_td", "1️⃣", "First TD"],
  ["q1_passing_yards", "1Q", "Q1 Passing Yards"],
  ["q1_receiving_yards", "1Q", "Q1 Receiving Yards"],
  ["q1_receptions", "1Q", "Q1 Receptions"],
  ["q1_qb_rushing_yards", "1Q", "Q1 QB Rushing Yards"],
  ["q1_rushing_yards", "1Q", "Q1 Rushing Yards"],
  ["q1_pass_attempts", "1Q", "Q1 Pass Attempts"],
  ["q1_pass_completions", "1Q", "Q1 Pass Completions"],
  ["q1_rushing_receiving_yards", "1Q", "Q1 Rush + Receiving Yards"],
  ["q1_anytime_td", "1Q", "Q1 Anytime TD"],
  ["q1_rush_attempts", "1Q", "Q1 Rush Attempts"],
] as const;

export type NflMarketKey = typeof NFL_MARKETS[number][0];

export type NflRankingRow = {
  rank:number;
  playerId:string;
  playerName:string;
  teamName:string;
  teamId?:string;
  teamLogo?:string;
  position?:string;
  headshot?:string;
  matchup:string;
  gameTime?:string;
  giScore:number;
  modelProbability?:number;
  modelProjection?:number|null;
  projectionGames?:number|null;
  sportsbookLine?:number|null;
  sportsbookProbability?:number|null;
  bookmakerCount?:number;
  perGame?:number|null;
  seasonTotal?:number|null;
  gamesPlayed?:number|null;
  season?:number|null;
  summary:string;
  marketBacked:boolean;
  resultStatus?:"pending"|"hit"|"miss"|"push"|"void";
  actualResult?:number|null;
  resultSymbol?:string;
  resultMargin?:number|null;
  gameId?:string;
  gameState?:"pre"|"in"|"post"|string;
  gameStatus?:string;
  liveCurrent?:number|null;
  liveProgressPct?:number|null;
  movement?:"new"|"up"|"down"|"same";
  previousRank?:number|null;
};

export type NflRosterPlayer = {
  id:string;
  name:string;
  position:string;
  jersey?:string;
  headshot?:string;
  className?:string;
  height?:string;
  weight?:string;
};

export function cleanName(v:string){
  return v.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/gi," ").trim().toLowerCase();
}
export function safeNumber(v:unknown){
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
