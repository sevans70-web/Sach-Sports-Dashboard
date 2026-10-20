import {dashboardDay} from "@/lib/dashboard-contract";
import {quoteMatchesFixture} from '@/lib/main-market-quotes';
/** NBA books may list the court tip ten minutes after the advertised start.
 * Require the same full away/home identity and sports day; the caller also
 * requires a unique official fixture. Preserve the provider time for auditing. */
export function nbaQuoteMatchesGame(prop:any,game:any){
 return nbaPropMatchesGame(prop,game)&&quoteMatchesFixture(prop,game,15*60_000);
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
