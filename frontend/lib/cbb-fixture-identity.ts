/** Model history uses official team IDs, never a sportsbook abbreviation or
 * the season of an older statistical baseline. Missing evidence stays missing. */
export function cbbFixtureIdentity(game:any,team:string){
 const key=String(team||'').trim().toUpperCase();
 const away=!!key&&key===String(game?.awayAbbr||'').trim().toUpperCase();
 const home=!!key&&key===String(game?.homeAbbr||'').trim().toUpperCase();
 const matched=away!==home;
 return {
  teamId:matched?String((away?game.awayTeamId:game.homeTeamId)||''):null,
  opponentId:matched?String((away?game.homeTeamId:game.awayTeamId)||''):null,
  season:game?.season||null,
 };
}
