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

/** Provider team suffixes label identity; they are not part of a player's name.
 * A suffix conflicting with current official roster membership is rejected. */
export function cbbQuotePlayerName(value:string){
 const source=String(value||'').trim(),match=source.match(/^(.*?)\s+\(([A-Za-z0-9& .-]{1,16})\)$/);
 return {name:match?match[1].trim():source,teamTag:match?match[2].trim().toUpperCase():null};
}
export function cbbQuoteTeam(quote:any,player:any){
 const team=String(player?.team||quote.playerTeam||'').trim().toUpperCase();
 return quote.providerTeamTag&&quote.providerTeamTag!==team?'':team;
}
