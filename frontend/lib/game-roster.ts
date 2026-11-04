/** Never assign an unrelated or ambiguous roster by array position. */
export function gameRosterForSide<T extends {teamId:string;teamName:string;teamAbbr:string;side:string}>(rosters:T[],side:'away'|'home',game:any):T|undefined{
 const norm=(value:unknown)=>String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');
 const expectedId=String(game[side+'TeamId']||'');
 const names=[game[side+'Team'],game[side+'Abbr']].map(norm).filter(Boolean);
 const matches=rosters.filter(roster=>{
  if(roster.side&&roster.side!==side)return false;
  if(expectedId&&roster.teamId)return expectedId===String(roster.teamId);
  return [roster.teamName,roster.teamAbbr].map(norm).some(name=>name&&names.includes(name));
 });
 return matches.length===1?matches[0]:undefined;
}

/** Season starts and depth-chart membership do not confirm today's lineup. */
export function gameRosterStarter(raw:any,currentGame:boolean){
 return currentGame&&raw?.starter===true;
}
