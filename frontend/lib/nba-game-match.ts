import {dashboardDay} from "@/lib/dashboard-contract";
import {quoteMatchesFixture} from '@/lib/main-market-quotes';
/** NBA books may list the court tip ten minutes after the advertised start.
 * Require the same full away/home identity and sports day; the caller also
 * requires a unique official fixture. Preserve the provider time for auditing. */
export function nbaQuoteMatchesGame(prop:any,game:any){
 // ESPN's official LAC display name is "LA Clippers"; books also use the full
 // city. Require that exact official name AND abbreviation. Never alias the
 // Lakers, a different opponent/date, or an unverified generic "LA" team.
 const aliases=(name:string,abbr:string,existing:string[]|undefined)=>String(abbr||'').toUpperCase()==='LAC'&&['la clippers','los angeles clippers'].includes(String(name||'').toLowerCase())
  ?[...(existing||[]),'LA Clippers','Los Angeles Clippers']:existing;
 return nbaPropMatchesGame(prop,game)&&quoteMatchesFixture(prop,{...game,
  awayTeamAliases:aliases(game.awayTeam,game.awayAbbr,game.awayTeamAliases),
  homeTeamAliases:aliases(game.homeTeam,game.homeAbbr,game.homeTeamAliases),
 },15*60_000);
}
const nickname=(value:string)=>String(value||"").toLowerCase().trim().split(/\s+/).at(-1)?.replace(/[^a-z0-9]/g,"")||"";
/** A prop for a different date/opponent must never fall back to the nearest game. */
export function nbaPropMatchesGame(prop:any,game:any){
 const date=prop.gameTime?new Date(prop.gameTime):null;
 if(date&&Number.isFinite(date.getTime())&&dashboardDay(date)!==dashboardDay(game.tipoff))return false;
 const sides=String(prop.matchup||"").split(/\s*@\s*|\s+vs\.?\s+/i);
 if(sides.length!==2)return false;
 return nickname(sides[0])===nickname(game.awayTeam)&&nickname(sides[1])===nickname(game.homeTeam);
}

/** Providers may identify a player's team by full name or league abbreviation.
 * Compare against the official matched roster; never treat an unknown tag as a match. */
export function nbaQuoteMatchesRosterTeam(prop:any,roster:any){
 const norm=(v:unknown)=>String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'');
 const tag=norm(prop.playerTeam??prop.teamName);if(!tag)return true;
 const abbr=norm(roster.teamAbbr);
 const aliases:Record<string,string[]>={ny:['nyk'],gs:['gsw'],sa:['sas'],no:['nop'],uta:['utah'],phx:['pho'],bkn:['brk']};
 const lac=abbr==='lac'&&['laclippers','losangelesclippers'].includes(norm(roster.teamName));
 const candidates=[abbr,norm(roster.teamName),...(aliases[abbr]||[]),...(lac?['laclippers','losangelesclippers']:[])];
 return candidates.includes(tag);
}
