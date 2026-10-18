export const ADMIN_EMAIL = "sachsportsplatform@gmail.com";
export const ADMIN_SPORTS = ["nfl", "cfb", "nba", "wnba", "nhl", "cbb"] as const;
export function isAdminUser(user: any) {
  return Boolean(user?.id && String(user.email || "").trim().toLowerCase() === ADMIN_EMAIL && user.email_confirmed_at && !user.is_anonymous);
}
export function sameOriginMutation(origin: string | null, expected: string, fetchSite?: string | null) {
  return Boolean(origin && origin === expected && (!fetchSite || ["same-origin", "none"].includes(fetchSite)));
}
export function adminResult(row: any) {
  const status = row.withdrawnFromBoard === true ? "void" : row.historicalStatus || row.status;
  const original = row.archivedOriginal || {};
  return {
    key: String(row.key || `${row.gameDate}|${row.market}|${row.playerId}|${row.gameId || row.matchup}`),
    player: String(row.playerName || "Unknown player"), playerId: String(row.playerId || ""),
    team: String(row.teamName || ""), market: String(row.market || ""),
    gameId: String(row.gameId || ""), matchup: String(row.matchup || ""), gameTime: row.gameTime || null,
    gameDate: row.gameDate || null, side: original.prediction ?? row.pickSide ?? row.prediction ?? null,
    line: original.sportsbookLine ?? row.sportsbookLine ?? null, actual: row.actual ?? null,
    status: ["hit", "miss", "push", "pending", "void"].includes(status) ? status : "unknown",
    savedAt: row.savedAt || null, gradedAt: row.gradedAt || null,
    verifiedPick: row.recommendationEligible === true, quoteVerified: row.quoteVerified === true,
    sportsbook: row.sportsbook || null, quoteUpdatedAt: row.quoteUpdatedAt || null,
    reason: row.reviewReason || null, withdrawn: row.withdrawnFromBoard === true,
    recoveredAfterStart: row.recoveredAfterStart === true,
  };
}
export function adminResultCounts(rows: ReturnType<typeof adminResult>[]) {
  const count = (status: string) => rows.filter(row => row.status === status).length;
  const hits = count("hit"), misses = count("miss"), pushes = count("push");
  return { total: rows.length, hits, misses, pushes, settled: hits + misses + pushes,
    pending: count("pending"), void: count("void"), unknown: count("unknown"),
    hitRate: hits + misses ? Math.round(hits / (hits + misses) * 1000) / 10 : null };
}
