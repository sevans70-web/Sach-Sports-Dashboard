/** ESPN identifies NBA/CBB seasons by their ending year; WNBA uses calendar years. */
export function basketballHistorySeasons(sport:string,before:string|null,now=new Date()){
 const parsed=before?new Date(before):now;
 const cutoff=Number.isFinite(parsed.getTime())?parsed:now;
 const year=cutoff.getUTCFullYear()+(sport!=='wnba'&&cutoff.getUTCMonth()>=8?1:0);
 return [year-1,year];
}
/** ESPN returns preseason in the same gamelog response. Keep the regular-season chart comparable. */
export function basketballRegularSeasonGroups(payload:any){
 return (Array.isArray(payload?.seasonTypes)?payload.seasonTypes:[]).filter((group:any)=>/\bregular season\b/i.test(String(group.displayName||'')));
}
/** Filter before taking Last 20 so later games cannot displace pregame history. */
export function basketballHistoryWindow(rows:any[],before:string|null,now=Date.now()){
 const parsed=before?Date.parse(before):now,cutoff=Number.isFinite(parsed)?parsed:now;
 const unique=new Map<string,any>();
 for(const row of rows){
  const time=Date.parse(row.date);
  if(!row.gameId||!Number.isFinite(time)||time>=cutoff||typeof row.value!=='number'||!Number.isFinite(row.value))continue;
  unique.set(String(row.gameId),row);
 }
 return [...unique.values()].sort((a,b)=>Date.parse(a.date)-Date.parse(b.date)).slice(-20);
}
