export const CFB_MARKETS = [
  ["passing_yards", "🏈", "Passing Yards"],
  ["pass_completions", "✅", "Pass Completions"],
  ["rushing_yards", "🏃", "Rushing Yards"],
  ["receiving_yards", "🙌", "Receiving Yards"],
  ["receptions", "🧤", "Receptions"],
  ["anytime_td", "🔥", "Anytime TD"],
  ["first_td", "1️⃣", "First TD"],
] as const;

export type CfbMarketKey = typeof CFB_MARKETS[number][0];

export type CfbRankingRow = {
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
};

export type CfbRosterPlayer = {
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
