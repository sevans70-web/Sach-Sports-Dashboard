import {dashboardDay} from '@/lib/dashboard-contract';
type Entry={rank:number;movement:'new'|'up'|'down'|'same';previousRank:number|null;since:string};
export type RankBoard={scope:string;entries:Record<string,Entry>};
export function trackRankBoard(rows:any[],previous:RankBoard|null,scope:string,now=new Date().toISOString()){
 const comparable=previous?.scope===scope;
 const old=comparable?previous.entries:{},entries:Record<string,Entry>={};
 // An empty provider refresh is not a new comparison board.
 if(!rows.length&&comparable)return {rows:[],board:previous!};
 const tracked=rows.map(row=>{
  const key=String(row.playerId||row.player_id||row.playerName)+'|'+String(row.gameId||row.gameTime||row.matchup||'');
  const rank=Number(row.rank),prior=old[key];if(!Number.isFinite(rank)||rank<=0)return row;
  const started=row.frozen||row.boardFrozen||row.lockedAtKickoff||['in','post','live','final'].includes(String(row.gameState||row.state).toLowerCase())||Date.parse(row.gameTime||row.startTime||'')<=Date.parse(now);
  const delta=prior?prior.rank-rank:0;
  const entry:Entry=!prior?{rank,movement:comparable?'new':'same',previousRank:null,since:now}:delta?{rank,movement:delta>0?'up':'down',previousRank:prior.rank,since:now}:{...prior,rank};
  if(started){entry.movement='same';entry.previousRank=null;}
  entries[key]=entry;
  return {...row,movement:entry.movement,previousRank:entry.previousRank,movementSince:entry.since,movementScope:'Compared with the previous observed board on this device today; NEW means entered after a comparison board already existed.'};
 });
 return {rows:tracked,board:{scope,entries}};
}

/** DROPPED is a same-fixture, same-day pregame replacement, never graduation
 * at kickoff, a stale prior slate, or an item still on the current board. */
export function currentDroppedRows(dropped:any[],active:any[],market:string,day:string,now=Date.now()){
 const fixture=(r:any)=>String(r.gameId||r.gamePk||r.game_pk||r.gameTime||r.startTime||'');
 const player=(r:any)=>String(r.playerId||r.player_id||r.pitcher_id||r.batter_id||r.playerName||'');
 const fixtures=new Set(active.map(fixture).filter(Boolean)),present=new Set(active.map(r=>fixture(r)+'|'+player(r))),seen=new Set<string>();
 return dropped.filter(r=>{
  const time=r.gameTime||r.startTime||r.game_date||r.gameDate||'',key=fixture(r)+'|'+player(r);
  if(!fixture(r)||!player(r)||!fixtures.has(fixture(r))||present.has(key)||seen.has(key)||r.market&&r.market!==market||dashboardDay(time)!==day||!Number.isFinite(Date.parse(time))||Date.parse(time)<=now||r.frozen||r.boardFrozen||r.lockedAtKickoff||['in','post','live','final'].includes(String(r.gameState||r.state).toLowerCase()))return false;
  seen.add(key);return true;
 });
}
