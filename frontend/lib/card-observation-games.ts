/** Exact saved game IDs keep archived cards observable after they leave the current schedule. */
export function cardObservationGames<T extends {id?:string;date?:string;state?:string}>(games:T[],cards:Array<{gameTime?:string;gameState?:string;raw?:any}>):Array<T|{id:string;date:string;state:string}>{
 const result:Array<T|{id:string;date:string;state:string}>=[...games],seen=new Set(games.map(g=>String(g.id||'')));
 for(const card of cards){
  const id=String(card.raw?.gameId||'');
  if(!/^\d+$/.test(id)||seen.has(id))continue;
  const date=String(card.gameTime||card.raw?.gameTime||'');
  if(!Number.isFinite(Date.parse(date)))continue;
  const raw=String(card.gameState||card.raw?.gameState||'').toLowerCase();
  const state=raw==='final'?'post':raw==='live'?'in':['pre','in','post'].includes(raw)?raw:'pre';
  seen.add(id);result.push({id,date,state});
 }
 return result;
}
