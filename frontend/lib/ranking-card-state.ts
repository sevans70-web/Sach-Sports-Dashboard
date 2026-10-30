/** A prediction's grade/void status is not the game's clock. */
export function rankingCardState(row:any,status:string):"pregame"|"live"|"final"{
  const state=String(row?.gameState??row?.state??"").toLowerCase();
  if(state==='post'||state==='final'||row?.completed===true||row?.isFinal===true)return 'final';
  if(state==='in'||state==='live'||row?.isLive===true||row?.result_live===true)return 'live';
  if(state==='pre'||state==='scheduled')return 'pregame';
  return ['hit','miss','push','void'].includes(status)?'final':'pregame';
}

/** Stable display order only. Original ranks and selection evidence stay intact. */
export function completedRankingsLast<T extends {raw?:any;gameState?:string;resultStatus?:string}>(cards:T[]):T[]{
 const final=(card:T)=>rankingCardState({...card.raw,gameState:card.gameState||card.raw?.gameState},card.resultStatus||'')==='final';
 return [...cards].sort((a,b)=>Number(final(a))-Number(final(b)));
}

/** Use supplied clock/period evidence; elapsed time never establishes a live game. */
export function rankingStatusText(game:any,sport:string){
 const state=String(game?.state||game?.gameState||'').toLowerCase();
 if(['post','final'].includes(state))return game.status||'Final';
 if(!['in','live'].includes(state))return game.status||'Scheduled';
 const period=Number(game.period),clock=typeof game.clock==='string'?game.clock.trim():'';
 const regulation=sport==='nhl'?3:sport==='cbb'?2:4;
 const periodText=game.periodLabel||game.quarter||(Number.isInteger(period)&&period>0?(['nfl','cfb','nba','wnba','cbb','nhl'].includes(sport)?period>regulation?`OT${period-regulation}`:`${sport==='nhl'?'P':sport==='cbb'?'H':'Q'}${period}`:`Period ${period}`):'');
 const parts=[String(game.status||'In Progress')];
 for(const part of [periodText,clock])if(part&&!parts.some(text=>text.toLowerCase().includes(String(part).toLowerCase())))parts.push(String(part));
 return parts.join(' · ');
}

/** Always put completed games after live and scheduled games within a date. */
export function playableSlateOrder<T extends {state:string;date:string;id?:string}>(games:T[]):T[]{
 const priority:Record<string,number>={in:0,live:0,pre:1,scheduled:1,post:2,final:2};
 return [...games].sort((a,b)=>(priority[a.state]??1)-(priority[b.state]??1)||Date.parse(a.date)-Date.parse(b.date)||String(a.id||'').localeCompare(String(b.id||'')));
}

/** Observed distance toward a numeric threshold, never a pick probability.
 * Unknown statistics and scorer outcomes cannot produce a percentage. */
export function rankingLineProgress(actual:unknown,line:unknown,market:string){
 if(actual==null||line==null||(typeof actual==="string"&&!actual.trim())||(typeof line==="string"&&!line.trim())||typeof actual==="boolean"||typeof line==="boolean")return null;
 if(/(?:first|anytime|home_runs)/.test(market))return null;
 const value=Number(actual),threshold=Number(line);
 if(!Number.isFinite(value)||!Number.isFinite(threshold)||threshold<=0)return null;
 return {actual:value,line:threshold,percent:Math.max(0,Math.min(100,value/threshold*100)),remaining:Math.max(0,threshold-value)};
}

/** A current/final score must belong to this exact fixture, not just this team. */
export function rankingGameForRow<T extends {id?:string;gameId?:string;date?:string;tipoff?:string|null;awayTeam?:string;homeTeam?:string;awayAbbr?:string;homeAbbr?:string}>(row:any,games:T[]):T|null{
 const id=String(row?.gameId||row?.game_id||"");
 if(id)return games.find(g=>String(g.id||g.gameId||"")===id)||null;
 const time=Date.parse(row?.gameTime||""),norm=(v:any)=>String(v||"").toLowerCase().replace(/[^a-z0-9]/g,"");
 if(!Number.isFinite(time))return null;
 const matchup=norm(row.matchup),team=norm(row.teamName||row.team);
 return games.find(g=>{
  const delta=Math.abs(time-Date.parse(g.date||g.tipoff||""));if(!Number.isFinite(delta)||delta>5*60_000)return false;
  const away=[norm(g.awayTeam),norm(g.awayAbbr)].filter(Boolean),home=[norm(g.homeTeam),norm(g.homeAbbr)].filter(Boolean);
  return matchup?away.some(n=>matchup.includes(n))&&home.some(n=>matchup.includes(n)):[...away,...home].includes(team);
 })||null;
}
