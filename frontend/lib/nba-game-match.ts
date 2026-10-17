import {dashboardDay} from "@/lib/dashboard-contract";
const nickname=(value:string)=>String(value||"").toLowerCase().trim().split(/\s+/).at(-1)?.replace(/[^a-z0-9]/g,"")||"";
/** A prop for a different date/opponent must never fall back to the nearest game. */
export function nbaPropMatchesGame(prop:any,game:any){
 const date=prop.gameTime?new Date(prop.gameTime):null;
 if(date&&Number.isFinite(date.getTime())&&dashboardDay(date)!==dashboardDay(game.tipoff))return false;
 const sides=String(prop.matchup||"").split(/\s*@\s*|\s+vs\.?\s+/i);
 if(sides.length!==2)return false;
 return nickname(sides[0])===nickname(game.awayTeam)&&nickname(sides[1])===nickname(game.homeTeam);
}
