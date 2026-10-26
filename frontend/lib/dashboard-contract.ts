import {eligiblePropPrediction,verifiedPropQuote} from "@/lib/prop-integrity";
import {cardModelPick} from '@/lib/saved-model-pick';
export const DASHBOARD_SPORTS = ["mlb","nfl","cfb","nba","wnba","nhl","soccer","cbb"] as const;
export type DashboardSport = typeof DASHBOARD_SPORTS[number];
// Pause public discovery, not historical storage or settlement.
export const VISIBLE_SPORTS: readonly DashboardSport[] = ["nfl","cfb","nba","nhl","cbb"];
export const DEFAULT_MARKETS:Record<DashboardSport,string>={mlb:"home_runs",nfl:"passing_yards",cfb:"passing_yards",nba:"points",wnba:"points",nhl:"shots_on_goal",soccer:"shots_on_target",cbb:"points"};
const torontoDayFormatter=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Toronto",year:"numeric",month:"2-digit",day:"2-digit"});
export function dashboardDay(value:Date|string){
 const d=value instanceof Date?value:new Date(value);if(!Number.isFinite(d.getTime()))return "";
 const parts=torontoDayFormatter.formatToParts(d);
 const p=(t:string)=>parts.find(x=>x.type===t)?.value||"";return `${p("year")}-${p("month")}-${p("day")}`;
}
export function dashboardSlate<T extends {id?:string;date:string;state:string}>(games:T[],now=new Date(),allDates=false):T[]{
 const today=dashboardDay(now),byId=new Map<string,T>();
 for(const g of games)if(g.date&&dashboardDay(g.date))byId.set(g.id||g.date,g);
 const all=[...byId.values()],current=all.filter(g=>g.state==="in"||dashboardDay(g.date)===today);
 const future=all.filter(g=>g.state!=="post"&&dashboardDay(g.date)>today).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
 const next=future[0]?dashboardDay(future[0].date):"";
 const selected=allDates?all:[...current,...future.filter(g=>dashboardDay(g.date)===next)];
 const order:Record<string,number>={in:0,pre:1,post:2};
 return selected.sort((a,b)=>(order[a.state]??1)-(order[b.state]??1)||Date.parse(a.date)-Date.parse(b.date));
}
export function dashboardCounts(games:any[],rows:any[],requireFootballQuote=false){
 const gameIds=new Set(games.map(g=>String(g.id||g.gameId||""))),days=new Set(games.map(g=>dashboardDay(g.date||g.tipoff||"")));
 const unique=new Map<string,any>();
 for(const row of rows){
  const id=String(row.gameId||row.gamePk||row.game_pk||""),time=row.gameTime||row.kickoff||row.startTime||row.gameDate||"";
  if(id&&!gameIds.has(id))continue;
  if(!id&&(!time||!days.has(dashboardDay(time))))continue;
  const player=String(row.playerId||row.player_id||row.playerName||row.name||"");if(!player)continue;
  const line=row.sportsbookLine??row.marketLine??row.line,projection=row.modelProjection??row.projection??row.model_projection;
  const side=row.prediction??row.pickSide??(line!=null&&projection!=null?(Number(projection)>=Number(line)?"OVER":"UNDER"):null);
  unique.set(`${player}|${id||dashboardDay(time)}`,{...row,sportsbookLine:line,modelProjection:projection,prediction:side});
 }
 const ranked=[...unique.values()];
 const props=ranked.filter(r=>verifiedPropQuote(r,Date.now(),r.boardFrozen===true)&&r.marketBacked!==false&&!r.earlyModel);
 const predictions=props.filter(r=>eligiblePropPrediction(r)&&r.resultStatus!=="void");
 // Match the cards' saved-selection rule, including frozen pregame picks.
 // Do not count withdrawn/void records or require a separate validation registry.
 const modelSelections=ranked.filter(r=>r.withdrawnFromBoard!==true&&r.resultStatus!=="void"&&cardModelPick(r));
 // A game having started does not prove that a provider published a lineup.
 const confirmed=games.reduce((n,g)=>n+Number(g.awayLineupConfirmed===true)+Number(g.homeLineupConfirmed===true),0);
 return {games:games.length,live:games.filter(g=>g.state==="in").length,finals:games.filter(g=>g.state==="post").length,lineups:games.length*2,confirmedLineups:confirmed,pendingLineups:games.length*2-confirmed,rankedPlayers:ranked.length,playerProps:props.length,predictions:predictions.length,estimatedPicks:modelSelections.length,modelPickRows:modelSelections,verifiedRows:predictions};
}

/** Give each professional sport with a playable fixture a home-page slot. */
export function featuredDashboardGames(games:any[],limit=3){
 const order:Record<string,number>={in:0,pre:1,post:2};
 const sorted=[...games].sort((a,b)=>(order[a.state]??1)-(order[b.state]??1)||Date.parse(a.date)-Date.parse(b.date));
 const selected:any[]=[];
 for(const sport of ['nba','wnba','nhl','nfl']){
  const game=sorted.find(g=>g.sport===sport&&g.state!=='post');
  if(game&&selected.length<limit)selected.push(game);
 }
 for(const game of sorted)if(selected.length<limit&&!selected.includes(game))selected.push(game);
 return selected;
}
