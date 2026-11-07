/** Keep a player's quotes separated by the official fixture. A back-to-back
 * or doubleheader must not replace the other game's evidence. */
const player=(v:unknown)=>String(v??'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
const fixture=(v:unknown)=>String(v??'').trim();
export function nbaQuotePlayerFixtureKey(quote:{playerName?:unknown;gameTime?:unknown;matchup?:unknown}){
 return [player(quote.playerName),fixture(quote.gameTime),player(quote.matchup)].join('|');
}
export function nbaOfficialPlayerFixtureKey(row:{gameId?:unknown;playerId?:unknown;playerName?:unknown}){
 return fixture(row.gameId)+'|'+(fixture(row.playerId)||player(row.playerName));
}
