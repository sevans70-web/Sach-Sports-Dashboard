import type {OpportunityGame} from '@/lib/opportunity-backtest';
const number=(v:any)=>v==null||typeof v==='boolean'||String(v).trim()===''?null:Number.isFinite(Number(v))?Number(v):null;
const minutes=(v:any)=>/^\d+:\d{2}$/.test(String(v))?Number(String(v).split(':')[0])+Number(String(v).split(':')[1])/60:number(v);
const pair=(v:any)=>{const m=String(v).match(/^(\d+)\s*[-/]\s*(\d+)$/);return m&&Number(m[1])<=Number(m[2])?[Number(m[1]),Number(m[2])]:null};
const markets={points:'PTS',rebounds:'REB',assists:'AST',threes_made:'3PT',steals:'STL',blocks:'BLK'};
export type BasketballContext={starter:boolean|null;home:boolean;usage:number|null;fieldGoalAttempts:number;freeThrowAttempts:number;turnovers:number;
 teamPossessions:number;allowed:Record<string,number>;duration:number};

/** Census observations from completed fixtures, including explicit DNPs. The
 * target starter flag and target usage are outcomes, never forecast features. */
export function basketballModelObservations(payload:any,identity:{sport:'nba'|'wnba'|'cbb';season:string;gameId:string;source:string;retrievedAt:string}):OpportunityGame[]{
 const h=payload?.header,c=h?.competitions?.[0],at=Date.parse(identity.retrievedAt),time=Date.parse(c?.date||h?.date||'');
 if(String(h?.id)!==identity.gameId||String(h?.season?.year)!==identity.season||Number(h?.season?.type)!==2||c?.status?.type?.completed!==true||!Number.isFinite(time)||!Number.isFinite(at)||time>=at-48*3600000)return [];
 const sides=c.competitors||[];if(sides.length!==2||sides.some((s:any)=>!s.team?.id)||String(sides[0].team.id)===String(sides[1].team.id))return [];
 const teams=(payload.boxscore?.players||[]).flatMap((team:any)=>{
  const side=sides.find((s:any)=>String(s.team.id)===String(team.team?.id));if(!side)return [];
  const groups=team.statistics||[];if(groups.length!==1)return [];
  const group=groups[0],labels=group.labels||group.names||[],index=(label:string)=>labels.indexOf(label),totals=group.totals||[];
  const total=(label:string)=>index(label)<0?null:label==='3PT'?pair(totals[index(label)])?.[0]??null:number(totals[index(label)]);
  const fg=pair(totals[index('FG')]),ft=pair(totals[index('FT')]),to=total('TO'),oreb=total('OREB');
  if(!fg||!ft||to==null||oreb==null)return [];
  const stats=Object.fromEntries(Object.entries(markets).map(([key,label])=>[key,total(label)]));
  if(Object.values(stats).some(v=>v==null))return [];
  const parsed=(group.athletes||[]).map((row:any)=>{
   const raw=row.stats||[],dnp=row.didNotPlay===true,id=String(row.athlete?.id||'');
   const get=(label:string)=>dnp?0:index(label)<0?null:number(raw[index(label)]);
   const min=dnp?0:minutes(raw[index('MIN')]),f=dnp?[0,0]:pair(raw[index('FG')]),t=dnp?[0,0]:pair(raw[index('FT')]);
   const values=Object.fromEntries(Object.entries(markets).map(([key,label])=>[key,label==='3PT'?(dnp?0:pair(raw[index(label)])?.[0]??null):get(label)]));
   if(!id||min==null||min<0||!f||!t||get('TO')==null||Object.values(values).some(v=>v==null))return null;
   return {id,name:String(row.athlete.displayName||''),minutes:min,starter:typeof row.starter==='boolean'?row.starter:null,fga:f[1],fta:t[1],to:get('TO')!,values};
  });
  // Missing player statistics cannot be silently converted to zero. Require
  // independently reported player totals to reconcile to the team totals.
  if(parsed.some((p:any)=>!p))return [];
  const players=parsed as NonNullable<typeof parsed[number]>[];
  if(new Set(players.map(p=>p.id)).size!==players.length||Object.keys(markets).some(m=>players.reduce((s,p)=>s+p.values[m]!,0)!==stats[m])||players.reduce((s,p)=>s+p.fga,0)!==fg[1]||players.reduce((s,p)=>s+p.fta,0)!==ft[1]||players.reduce((s,p)=>s+p.to,0)!==to||number(side.score)!=null&&number(side.score)!==stats.points)return [];
  const teamMinutes=players.reduce((s,p)=>s+p.minutes,0),duration=teamMinutes/5;
  if(duration<(identity.sport==='nba'?47:39)||duration>80||players.some(p=>p.minutes>duration+1))return [];
  return [{teamId:String(side.team.id),home:side.homeAway==='home',players,stats,teamMinutes,duration,usageDenominator:fg[1]+.44*ft[1]+to,possessions:fg[1]+.44*ft[1]-oreb+to}];
 });
 if(teams.length!==2||new Set(teams.map((t:any)=>t.teamId)).size!==2)return [];
 return teams.flatMap((team:any)=>{
  const opponent=teams.find((t:any)=>t!==team)!;
  return team.players.flatMap((p:any)=>Object.keys(markets).map(market=>({
   ...identity,gameTime:new Date(time).toISOString(),playerId:p.id,playerName:p.name,teamId:team.teamId,opponentId:opponent.teamId,
   market,actual:p.values[market],workload:p.minutes,basketballContext:{starter:p.starter,home:team.home,
    usage:p.minutes>0&&team.usageDenominator>0?(p.fga+.44*p.fta+p.to)*(team.teamMinutes/5)/(p.minutes*team.usageDenominator):null,
    fieldGoalAttempts:p.fga,freeThrowAttempts:p.fta,turnovers:p.to,teamPossessions:(team.possessions+opponent.possessions)/2,
    allowed:opponent.stats,duration:team.duration}}))) as OpportunityGame[];
 });
}
