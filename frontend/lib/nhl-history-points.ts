import {nullableNumber as num} from '@/lib/provider-fetch';
/** Dated official regular-season observations for descriptive card history. */
export function nhlHistoryPoints(payload:any,market:string){
 return (payload?.gameLog||[]).flatMap((g:any)=>{
  const date=String(g.gameDate||''),gameId=String(g.gameId||'');if(!gameId||!/^\d{4}-\d{2}-\d{2}$/.test(date))return [];
  const toi=String(g.toi??g.timeOnIce??''),parts=toi.match(/^(\d+):(\d{2})$/),seconds=parts?Number(parts[1])*60+Number(parts[2]):null;
  if(seconds==null||seconds<=0)return [];
  let value:number|null=null;
  if(market==='points'){value=num(g.points);if(value==null){const goals=num(g.goals),assists=num(g.assists);if(goals!=null&&assists!=null)value=goals+assists}}
  else if(market==='goalie_saves'){value=num(g.saves);if(value==null){const shots=num(g.shotsAgainst),goals=num(g.goalsAgainst);if(shots!=null&&goals!=null&&shots>=goals)value=shots-goals}}
  else {const key:Record<string,string>={shots_on_goal:'shots',goals:'goals',assists:'assists',blocked_shots:'blockedShots'};if(key[market])value=num(g[key[market]])}
  return value==null?[]:[{gameId,date,value,iceTimeSeconds:seconds,source:'NHL official regular-season game log'}];
 });
}
