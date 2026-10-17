import {dashboardDay} from "@/lib/dashboard-contract";
/** Resolve provider display-name aliases only after roster IDs are known. */
export function uniqueRankingRows<T extends Record<string,any>>(rows:T[]):T[]{
 const seen=new Set<string>();
 return rows.filter(row=>{
  const player=String(row.playerId||row.playerName?.replace(/\([^)]*\)/g,"").trim()||"").toLowerCase();
  const game=String(row.gameId||row.matchup||"").toLowerCase().replace(/[^a-z0-9]/g,"");
  const date=row.gameTime&&Number.isFinite(Date.parse(row.gameTime))?dashboardDay(row.gameTime):"";
  const key=`${player}|${game}|${date}`;if(seen.has(key))return false;seen.add(key);return true;
 });
}
