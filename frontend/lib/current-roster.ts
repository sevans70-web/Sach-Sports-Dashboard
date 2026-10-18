/** Current roster membership controls present-day team identity, independently
 * of the team attached to an older statistical baseline. No historical writes. */
export async function currentRosterPlayers<T extends {playerId:number|string;team:string}>(players:T[],teams:{id:string;abbr:string}[],load:(id:string)=>Promise<string[]>){
 const unique=[...new Map(teams.filter(t=>t.id&&t.abbr).map(t=>[t.id,t])).values()];
 const membership=new Map<string,Set<string>>(),unavailableTeams:string[]=[];
 for(let i=0;i<unique.length;i+=6)await Promise.all(unique.slice(i,i+6).map(async team=>{
  try{const ids=await load(team.id);if(!ids.length)throw new Error("empty roster");for(const id of ids){const set=membership.get(String(id))||new Set<string>();set.add(team.abbr);membership.set(String(id),set)}}
  catch{unavailableTeams.push(team.abbr)}
 }));
 const out=new Map<string,T>();
 for(const p of players){const current=membership.get(String(p.playerId));if(current?.size!==1)continue;out.set(String(p.playerId),{...p,team:[...current][0]})}
 return {players:[...out.values()],unavailableTeams,unverifiedPlayers:players.filter(p=>!out.has(String(p.playerId))).length};
}
export function espnRosterIds(payload:any):string[]{
 const ids=new Set<string>();const walk=(items:any[])=>{for(const item of items){if(Array.isArray(item?.items))walk(item.items);const athlete=item?.athlete||item;if(athlete?.id)ids.add(String(athlete.id))}};
 walk(Array.isArray(payload?.athletes)?payload.athletes:[]);return [...ids];
}
export function nhlRosterIds(payload:any):string[]{return ["forwards","defensemen","goalies"].flatMap(key=>(Array.isArray(payload?.[key])?payload[key]:[]).filter((p:any)=>p?.id).map((p:any)=>String(p.id)))}
