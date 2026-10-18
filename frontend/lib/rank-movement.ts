type Entry={rank:number;movement:'new'|'up'|'down'|'same';previousRank:number|null;since:string};
export type RankBoard={scope:string;entries:Record<string,Entry>};
export function trackRankBoard(rows:any[],previous:RankBoard|null,scope:string,now=new Date().toISOString()){
 const old=previous?.scope===scope?previous.entries:{},entries:Record<string,Entry>={};
 const tracked=rows.map(row=>{
  const key=String(row.playerId||row.player_id||row.playerName)+'|'+String(row.gameId||row.gameTime||row.matchup||'');
  const rank=Number(row.rank),prior=old[key];if(!Number.isFinite(rank)||rank<=0)return row;
  const delta=prior?prior.rank-rank:0;
  const entry:Entry=!prior?{rank,movement:'new',previousRank:null,since:now}:delta?{rank,movement:delta>0?'up':'down',previousRank:prior.rank,since:now}:{...prior,rank};
  entries[key]=entry;
  return {...row,movement:entry.movement,previousRank:entry.previousRank,movementSince:entry.since,movementScope:'Compared with the previous observed board on this device today; NEW means newly tracked in this board.'};
 });
 return {rows:tracked,board:{scope,entries}};
}
