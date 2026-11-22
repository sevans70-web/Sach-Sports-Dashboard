/** Keep a player's quotes separated by the official fixture. A back-to-back
 * or doubleheader must not replace the other game's evidence. */
const player=(v:unknown)=>String(v??'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
const fixture=(v:unknown)=>String(v??'').trim();
/** Verified book-name aliases belong only to the matching official roster ID.
 * Never apply nickname/fuzzy matching to historical identities or other players. */
const rosterAliases:Record<string,{official:string;aliases:string[]}>= {
 '4871145':{official:'Josh Giddey',aliases:['Joshua Giddey']},
 '5160992':{official:'Alex Sarr',aliases:['Alexandre Sarr']},
 '3138196':{official:'Cameron Johnson',aliases:['Cam Johnson']},
};
export function nbaRosterNameKeys(row:{playerId?:unknown;playerName?:unknown}){
 const official=player(row.playerName),known=rosterAliases[fixture(row.playerId)];
 return [...new Set([official,...(known&&player(known.official)===official?known.aliases.map(player):[])])].filter(Boolean);
}
export function nbaQuotePlayerFixtureKey(quote:{playerName?:unknown;gameTime?:unknown;matchup?:unknown}){
 return [player(quote.playerName),fixture(quote.gameTime),player(quote.matchup)].join('|');
}
export function nbaOfficialPlayerFixtureKey(row:{gameId?:unknown;playerId?:unknown;playerName?:unknown}){
 return fixture(row.gameId)+'|'+(fixture(row.playerId)||player(row.playerName));
}

/** Deduplicate by the *official* game ID after fixture matching, not by the
 * sportsbook's kickoff timestamp (books can differ by several minutes).
 * Quotes for another fixture of the same player must remain distinct. */
export function dedupeNbaFixtureQuotes<T extends {bookmakerCount?:number}>(
  matched:{quote:T;gameId:unknown;playerId:unknown;playerName:unknown}[]
):T[]{
 const selected=new Map<string,T>();
 for(const {quote,gameId,playerId,playerName} of matched){
  const key=nbaOfficialPlayerFixtureKey({gameId,playerId,playerName});
  if(!gameId||!key||key.endsWith('|'))continue;
  const current=selected.get(key);
  if(!current||Number(quote.bookmakerCount||0)>Number(current.bookmakerCount||0))selected.set(key,quote);
 }
 return [...selected.values()];
}
