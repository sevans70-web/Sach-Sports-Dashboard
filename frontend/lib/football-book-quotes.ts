import {nullableNumber} from "@/lib/provider-fetch";
import {recordNoteFields} from '@/lib/record-notes';

export const FOOTBALL_QUOTE_VERSION = 1;
const norm = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const categoryKey=(v:unknown)=>{const key=norm(v);return ({rushrecyards:'rushingreceivingyards',rushreceivingyards:'rushingreceivingyards',passrushyards:'passingrushingyards'} as Record<string,string>)[key]||key};
// Provider names may include a college abbreviation. It is not a different player.
const playerKey = (v: string) => norm(v.replace(/\s*\([^)]*\)\s*$/, ""));
const price = (v: unknown) => {
  const n = nullableNumber(v);
  return n != null && Math.abs(n) >= 100 ? n : null;
};
const implied = (n: number) => n > 0 ? 100 / (n + 100) : -n / (-n + 100);

export type FootballBookRow = {
  eventId: string; matchup: string; gameTime: string; playerName: string; teamName: string;
  line: number | null; price: number; prob: number; bookmakerCount: number;
  quoteMarket: string; quotePeriod: string; sourceCategory: string; sourcePeriod: string;
  quoteVersion: number; sportsbook: string; sportsbookKey: string;
  overPrice: number; underPrice: number | null; quoteUpdatedAt: string;
  lineType: "main" | "scorer" | "milestone"; quoteId: string; quoteUrl: string; capturedAt: string;
};

/** Read only the provider's game -> book -> prop contract, never nested alternateLines.
 * Keep one executable quote, with BOTH prices at the SAME line for two-way props.
 * Never average thresholds/prices or merge games played on different dates.
 */
export function footballBookRows(payload: any, market: string, aliases: string[], now = Date.now(), allowQuarterMilestones=false): FootballBookRow[] {
  const binary = /^(anytime_td|first_td|q1_anytime_td)$/.test(market);
  const categories = new Set(aliases.map(categoryKey));
  const grouped = new Map<string, FootballBookRow[]>();
  for (const game of Array.isArray(payload?.data) ? payload.data : []) {
    const away = String(game.awayTeam || game.away_team || "");
    const home = String(game.homeTeam || game.home_team || "");
    const gameTime = String(game.commenceTime || game.commence_time || game.startTime || game.date || "");
    if (!away || !home || !Number.isFinite(Date.parse(gameTime))) continue;
    const matchup = `${away} @ ${home}`;
    for (const book of Array.isArray(game.books) ? game.books : []) {
      const sportsbookKey = String(book.key || "");
      if (!sportsbookKey) continue;
      for (const prop of Array.isArray(book.props) ? book.props : []) {
        const category = categoryKey(prop.category ?? prop.market ?? prop.type);
        const periods=[prop.periodID,prop.periodId,prop.period,prop.periodName].map(norm).filter(Boolean);
        const periodKey=(value:string)=>["game","fullgame","ft","0"].includes(value)?"game":["1q","q1","1","1stquarter","firstquarter"].includes(value)?"q1":value;
        if(new Set(periods.map(periodKey)).size>1)continue;
        const period = periods[0]||"";
        const quarter = market.startsWith("q1_");
        const base = market.replace(/^q1_/, "");
        const q1Period = ["1q", "q1", "1", "1stquarter", "firstquarter"].includes(period);
        const baseAliases:Record<string,string[]> = {
          passing_yards:["passingyards","passyards","playerpassingyards"],
          rushing_yards:["rushingyards","rushyards","playerrushingyards"],
          receiving_yards:["receivingyards","receptionyards","playerreceivingyards"],
        };
        const bases=baseAliases[base]||[norm(base)];
        const evidenceCategory=categoryKey(prop.sourceCategory??prop.category??prop.market??prop.type);
        const explicitQuarter=quarter&&bases.some(name=>["q1"+name,name+"q1","1q"+name,name+"1q","firstquarter"+name,name+"firstquarter"].includes(evidenceCategory));
        if(quarter&&!explicitQuarter&&!q1Period)continue;
        if (!categories.has(category) && !explicitQuarter && !(quarter && q1Period && bases.includes(category))) continue;
        if (period && (market.startsWith("q1_") ? !["1q", "q1", "1", "1stquarter", "firstquarter"].includes(period) : !["game", "fullgame", "ft", "0"].includes(period))) continue;
        const playerName = String(prop.playerName || prop.player_name || "").trim();
        const quoteUpdatedAt = String(prop.lastUpdate || book.lastUpdate || "");
        const updated = Date.parse(quoteUpdatedAt);
        // A cached snapshot cannot establish that a pregame price is still available.
        if (!playerName || !Number.isFinite(updated) || now - updated > 15 * 60_000 || updated > now + 60_000) continue;
        if (prop.suspended || prop.isSuspended || prop.active === false) continue;
        const structure = norm(prop.marketStructure || prop.lineType || prop.kind || "");
        const alternate = prop.isAlternate === true || prop.isMainLine === false ||
          /milestone|alternate|ladder/.test(structure) || /(?:^|-)alt(?:-|$)/i.test(String(prop.propId || ""));
        const overPrice = price(prop.overPrice ?? prop.over_price);
        const underPrice = price(prop.underPrice ?? prop.under_price);
        const line = nullableNumber(prop.line ?? prop.point ?? prop.total);
        const milestone=allowQuarterMilestones&&quarter&&structure==='milestone'&&line!=null&&line>0&&underPrice==null&&prop.isAlternate!==true;
        if(binary&&alternate)continue;
        if (overPrice == null || (!binary && !milestone && (alternate || underPrice == null || line == null))) continue;
        // With both sides available, remove the bookmaker margin for the model input.
        const p = implied(overPrice);
        const prob = Math.round((underPrice == null ? p : p / (p + implied(underPrice))) * 1000) / 10;
        const row: FootballBookRow = {
          quoteMarket:market,quotePeriod:quarter?"q1":"game",
          sourceCategory:String(prop.sourceCategory??prop.category??prop.market??prop.type??""),
          sourcePeriod:String([prop.sourcePeriod,prop.periodID,prop.periodId,prop.period,prop.periodName].find(v=>String(v??'').trim())??""),
          eventId: String(game.gameId || game.eventId || game.id || ""), matchup, gameTime,
          playerName, teamName: String(prop.team || prop.teamName || ""), line,
          price: overPrice, prob, bookmakerCount: 1, quoteVersion: FOOTBALL_QUOTE_VERSION,
          sportsbook: String(book.title || book.name || sportsbookKey), sportsbookKey,
          overPrice, underPrice, quoteUpdatedAt, lineType: binary ? "scorer" : milestone ? "milestone" : "main",
          quoteId: String(prop.propId || ""), quoteUrl: String(prop.event_link || book.event_link || ""), capturedAt: new Date(now).toISOString(),
        };
        const key = `${playerKey(playerName)}|${norm(matchup)}|${Date.parse(gameTime)}|${market}`;
        grouped.set(key, [...(grouped.get(key) || []), row]);
      }
    }
  }
  return [...grouped.values()].map(rows => {
    // A stable book preference avoids picking whichever line flatters our projection.
    const priority = ["bet365", "pinnacle", "fanduel", "draftkings", "caesars", "betmgm"];
    const order = (r: FootballBookRow) => { const i = priority.indexOf(r.sportsbookKey); return i < 0 ? 99 : i; };
    // Prefer a real two-way contract before sportsbook preference; a
    // one-sided target must not hide an available main line. Within a book,
    // choose the lowest milestone before its update time.
    rows.sort((a, b) => Number(a.lineType==='milestone') - Number(b.lineType==='milestone') || order(a) - order(b) || (a.lineType==='milestone'&&b.lineType==='milestone'?Number(a.line)-Number(b.line):0) || Date.parse(b.quoteUpdatedAt) - Date.parse(a.quoteUpdatedAt) || a.quoteId.localeCompare(b.quoteId));
    const selected = rows[0];
    return {...selected, bookmakerCount: new Set(rows.filter(r => r.lineType === selected.lineType && r.line === selected.line).map(r => r.sportsbookKey)).size};
  });
}

export function footballQuoteFields(row: any) {
  return {...recordNoteFields(row),quoteMarket:row.quoteMarket,quotePeriod:row.quotePeriod,sourceCategory:row.sourceCategory,sourcePeriod:row.sourcePeriod,quoteVersion: row.quoteVersion, sportsbook: row.sportsbook, sportsbookKey: row.sportsbookKey,
    overPrice: row.overPrice, underPrice: row.underPrice, quoteUpdatedAt: row.quoteUpdatedAt,
    lineType: row.lineType, quoteId: row.quoteId, quoteUrl: row.quoteUrl, capturedAt: row.capturedAt || row.savedAt};
}

/** A provider timestamp is not evidence of kickoff. Require the same official
 * away/home fixture and kickoff before using a quote as a recommendation. */
export function footballQuoteGame(row: any, schedule: any[]) {
  const matchup = norm(row.matchup);
  const time = Date.parse(row.gameTime || "");
  if (!matchup || !Number.isFinite(time)) return undefined;
  return schedule.find(game => norm(`${game.awayTeam} @ ${game.homeTeam}`) === matchup &&
    Number.isFinite(Date.parse(game.date)) && Math.abs(Date.parse(game.date) - time) <= 5 * 60_000);
}

