import {dashboardDay} from "@/lib/dashboard-contract";
import {footballQuoteFields} from "@/lib/football-book-quotes";

const clean = (v: unknown) => String(v || "").toLowerCase().replace(/[^a-z0-9]/g, "");
export function cfbTimeBlock(time: string) {
  const date = new Date(time);
  if (!Number.isFinite(date.getTime())) return "";
  const hour = Number(new Intl.DateTimeFormat("en-US", {timeZone:"America/Toronto", hour:"2-digit", hour12:false}).format(date)) % 24;
  return hour < 15 ? "early" : hour < 19 ? "afternoon" : "evening";
}

/** Restore recorded values only. Never run today's model to reconstruct a past pick. */
export function retainedCfbRows(records: any[], schedule: any[], gameDay: string, slate: string, now = Date.now()) {
  return records.flatMap(p => {
    const scorer=p.market==='anytime_td'||p.market==='first_td';
    if (!p.playerId || p.withdrawnFromBoard || (!scorer&&p.sportsbookLine==null) || (p.sportsbookLine!=null&&!Number.isFinite(Number(p.sportsbookLine)))) return [];
    const game = schedule.find(g => String(g.id) === String(p.gameId) || clean(`${g.awayTeam} @ ${g.homeTeam}`) === clean(p.matchup));
    if (!game || dashboardDay(game.date) !== gameDay || cfbTimeBlock(game.date) !== slate) return [];
    if (game.state === "pre" && !game.completed && Date.parse(game.date) > now) return [];
    const rank = Number(p.rank || p.originalRank || p.lastSeenRank || 0);
    if (rank < 1 || rank > 25) return [];
    const late = p.recoveredAfterStart === true || Date.parse(p.savedAt || "") > Date.parse(game.date) + 120_000;
    const teamId = clean(p.teamName) === clean(game.awayTeam) ? game.awayTeamId : clean(p.teamName) === clean(game.homeTeam) ? game.homeTeamId : "";
    return [{...footballQuoteFields(p), rank, playerId:String(p.playerId), playerName:p.playerName,
      teamName:p.teamName, teamId, position:p.position || "", matchup:p.matchup,
      headshot:p.headshot || (/^\d+$/.test(String(p.playerId)) ? `https://a.espncdn.com/i/headshots/college-football/players/full/${p.playerId}.png` : ""),
      teamLogo:p.teamLogo || (String(teamId) === String(game.awayTeamId) ? game.awayLogo : game.homeLogo) || "",
      gameId:String(game.id), gameTime:game.date, gameState:game.completed ? "post" : game.state,
      gameStatus:game.status || "", sportsbookLine:p.sportsbookLine, modelProjection:p.modelProjection,
      perGame:p.modelProjection, modelProbability:p.modelProbability, giScore:p.giScore,
      bookmakerCount:p.bookmakerCount || 0, marketBacked:true, frozen:true, recoveredAfterStart:late,
      lockedAtKickoff:!late, savedAt:p.savedAt, frozenAt:p.frozenAt,
      actualResult:p.actual, liveCurrent:p.actual, resultStatus:late ? "void" : p.status,
      summary:late ? "Saved after kickoff; retained as recorded history, not a pregame recommendation." : "Original saved prediction retained through the end of the game day.",
    }];
  });
}
