/** Names come from the official same-season standings, keyed by team abbreviation.
 * No nickname suffix/fuzzy matching and no aliases shared between teams. */
const name=(v:any)=>typeof v==='string'?v:typeof v?.default==='string'?v.default:'';
export function nhlTeamAliases(payload:any,season:string){
 const candidates=new Map<string,string[][]>();
 for(const row of Array.isArray(payload?.standings)?payload.standings:[]){
  if(String(row.seasonId)!==season)continue;
  const abbr=name(row.teamAbbrev).trim().toUpperCase(),full=name(row.teamName).trim(),common=name(row.teamCommonName).trim();
  if(!abbr||!full||!common)continue;
  candidates.set(abbr,[...(candidates.get(abbr)||[]),[full,common,abbr]]);
 }
 const result=new Map<string,string[]>();
 for(const [abbr,rows]of candidates)if(rows.length===1)result.set(abbr,rows[0]);
 return result;
}
