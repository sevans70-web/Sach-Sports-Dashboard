/** Exact-fixture official final observations outrank cached performance totals.
 * This updates observed statistics only, never a line, pick, GI or history row. */
const num=(v:any)=>v==null||typeof v==='boolean'||String(v).trim()===''?null:Number.isFinite(Number(v))?Number(v):null;
export type FinalCardObservation={sport:string;gameId:string;playerId:string;market:string;value:number;at:string};
export function finalCardObservation(row:any,market=String(row?.market||'')):FinalCardObservation|null{
 const o=row?.officialFinalObservation;
 if(market.startsWith('q1_')&&row?.quarterObservationChecked===true&&num(row.observedQuarterValue)==null)return null;
 if(!o||!['nfl','cfb','nba','wnba','cbb','nhl'].includes(o.sport)||!o.gameId||!o.playerId||!o.market||num(o.value)==null||!Number.isFinite(Date.parse(o.at)))return null;
 if(String(row.gameId)!==String(o.gameId)||String(row.playerId)!==String(o.playerId)||market!==o.market||row.sport&&row.sport!==o.sport)return null;
 return {...o,value:Number(o.value)};
}
export function retainCardFinal<T extends {playerId:string;market:string;actual:number|null;gameState:string;raw:any}>(next:T,previous?:T):T{
 if(next.market.startsWith('q1_')&&next.raw?.quarterObservationChecked===true&&num(next.raw.observedQuarterValue)==null)return next;
 const old=previous&&finalCardObservation({...previous.raw,playerId:previous.playerId},previous.market);
 if(!old||String(next.raw?.gameId)!==old.gameId||next.playerId!==old.playerId||next.market!==old.market||next.raw?.sport&&next.raw.sport!==old.sport)return next;
 const incoming=finalCardObservation({...next.raw,playerId:next.playerId},next.market);
 if(incoming&&Date.parse(incoming.at)>=Date.parse(old.at))return next;
 return {...next,actual:old.value,gameState:'post',raw:{...next.raw,gameState:'post',isFinal:true,completed:true,actualResult:old.value,officialFinalObservation:old}};
}
