import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = process.env.SACH_HISTORY_DIR || "/data/sach-history";
const RECOVERY_DIR = path.join(ROOT, "mlb", "performance");
const ARCHIVE_DIR = path.join(ROOT, "mlb", "archive");

const BATTER_CATEGORIES = [
  "home_runs",
  "hits",
  "total_bases",
  "runs",
  "rbis",
  "walks",
  "stolen_bases",
  "hits_runs_rbis",
  "batter_strikeouts",
] as const;

const PITCHER_CATEGORIES = [
  "strikeouts",
  "outs_recorded",
  "hits_allowed",
  "walks_allowed",
  "earned_runs",
] as const;

function countDay(history: any, day: string): number {
  const categories: Record<string, any> =
    history?.days?.[day]?.categories || {};

  return (Object.values(categories) as any[]).reduce<number>(
    (total, rows) => total + (Array.isArray(rows) ? rows.length : 0),
    0,
  );
}

function mergeDay(history: any, day: string, recovered: any) {
  if (!recovered?.categories) return history;

  const out = structuredClone(
    history && typeof history === "object"
      ? history
      : { schema_version: 1, days: {} },
  );

  out.days = out.days || {};

  // Prefer already-graded normal history over recovered copies.
  if (countDay(out, day) === 0) out.days[day] = recovered;

  return out;
}

function localFile(day: string) {
  return path.join(RECOVERY_DIR, `${day}.json`);
}

async function readLocalDay(day: string) {
  try {
    const parsed = JSON.parse(await fs.readFile(localFile(day), "utf8"));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

async function writeLocalDay(day: string, payload: any) {
  try {
    await fs.mkdir(RECOVERY_DIR, { recursive: true });
    const target = localFile(day);
    const temp = `${target}.${process.pid}.tmp`;
    await fs.writeFile(temp, JSON.stringify(payload, null, 2), "utf8");
    await fs.rename(temp, target);
    return true;
  } catch {
    return false;
  }
}

async function readFirstSnapshot(file: string, maxBytes = 24 * 1024 * 1024) {
  const handle = await fs.open(file, "r");

  try {
    const chunkSize = 256 * 1024;
    let offset = 0;
    let started = false;
    let depth = 0;
    let inString = false;
    let escaped = false;
    let text = "";

    while (offset < maxBytes) {
      const buffer = Buffer.alloc(chunkSize);
      const { bytesRead } = await handle.read(buffer, 0, chunkSize, offset);
      if (!bytesRead) break;
      offset += bytesRead;

      for (const char of buffer.subarray(0, bytesRead).toString("utf8")) {
        if (!started) {
          if (char === "{") {
            started = true;
            depth = 1;
            text = "{";
          }
          continue;
        }

        text += char;

        if (inString) {
          if (escaped) escaped = false;
          else if (char === "\\") escaped = true;
          else if (char === '"') inString = false;
          continue;
        }

        if (char === '"') {
          inString = true;
          continue;
        }

        if (char === "{") depth += 1;
        if (char === "}") depth -= 1;

        if (depth === 0) return JSON.parse(text);
      }
    }

    return null;
  } catch {
    return null;
  } finally {
    await handle.close();
  }
}

async function archiveSnapshot(stream: string, day: string) {
  const file = path.join(ARCHIVE_DIR, `${stream}_${day}.json`);

  try {
    const stat = await fs.stat(file);

    if (stat.size <= 32 * 1024 * 1024) {
      const parsed = JSON.parse(await fs.readFile(file, "utf8"));
      const rows = Array.isArray(parsed) ? parsed : [];

      for (let index = rows.length - 1; index >= 0; index -= 1) {
        if (rows[index]?.payload) return rows[index];
      }

      return null;
    }

    // Legacy Sept. 27 archives are very large. Stream only the first snapshot
    // instead of loading a 100MB+ file into the app process.
    return readFirstSnapshot(file);
  } catch {
    return null;
  }
}

function rowsFromPayload(payload: any, category: string, pitcher = false) {
  const roots = pitcher
    ? [payload?.pitcher, payload?.rankings, payload?.data?.pitcher, payload]
    : [payload?.batter, payload?.rankings, payload?.data?.batter, payload];

  for (const root of roots) {
    if (!root || typeof root !== "object") continue;

    const value = root?.[category];

    const rows = Array.isArray(value)
      ? value
      : Array.isArray(value?.rankings)
        ? value.rankings
        : Array.isArray(payload?.rows)
          ? payload.rows
          : [];

    if (rows.length) return rows;
  }

  return [];
}

async function archivedRows(category: string, day: string, pitcher = false) {
  const snapshot = await archiveSnapshot(category, day);
  if (!snapshot?.payload) return [];
  return rowsFromPayload(snapshot.payload, category, pitcher);
}

async function homeRunPool(day: string) {
  const snapshot = await archiveSnapshot("home_runs", day);
  const payload = snapshot?.payload || {};

  const roots = [
    payload?.batter,
    payload?.rankings,
    payload?.data?.batter,
    payload,
  ];

  for (const root of roots) {
    if (Array.isArray(root?.home_runs_pool) && root.home_runs_pool.length) {
      return root.home_runs_pool;
    }
  }

  return [];
}

function num(value: any) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normName(value: any) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .replace(/\b(jr|sr|ii|iii|iv)\b/gi, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

async function mlbResults(day: string) {
  const scheduleUrl =
    `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${encodeURIComponent(day)}`;

  let schedule: any = null;

  try {
    const response = await fetch(scheduleUrl, { cache: "no-store" });
    if (response.ok) schedule = await response.json();
  } catch {}

  const games = (
    schedule?.dates?.flatMap((entry: any) => entry.games || []) || []
  ).filter((game: any) => {
    const state = String(
      game?.status?.abstractGameState || game?.status?.detailedState || "",
    );

    return /final|completed|game over/i.test(state);
  });

  const byId = new Map<string, any>();
  const byName = new Map<string, any>();

  await Promise.all(
    games.map(async (game: any) => {
      try {
        const response = await fetch(
          `https://statsapi.mlb.com/api/v1/game/${encodeURIComponent(
            String(game.gamePk),
          )}/boxscore`,
          { cache: "no-store" },
        );

        if (!response.ok) return;

        const box = await response.json();

        for (const side of ["away", "home"]) {
          for (const player of Object.values(
            box?.teams?.[side]?.players || {},
          ) as any[]) {
            const id = String(player?.person?.id || "");
            const name = String(player?.person?.fullName || "");

            const row = {
              id,
              name,
              batting: player?.stats?.batting || null,
              pitching: player?.stats?.pitching || null,
              gamePk: String(game.gamePk),
            };

            if (id) byId.set(id, row);

            const key = normName(name);
            if (key) byName.set(key, row);
          }
        }
      } catch {}
    }),
  );

  return { byId, byName };
}

function resultFor(row: any, results: any, pitcher = false) {
  const id = String(
    pitcher
      ? row?.pitcher_id || row?.player_id || row?.playerId || ""
      : row?.player_id || row?.batter_id || row?.playerId || "",
  );

  const name = normName(
    pitcher
      ? row?.pitcher_name || row?.player_name || row?.playerName
      : row?.player_name || row?.player || row?.playerName,
  );

  return (id && results.byId.get(id)) || results.byName.get(name) || null;
}

function recoverBatterCategory(rows: any[], category: string, results: any) {
  const threshold: Record<string, number> = {
    home_runs: 1,
    hits: 1,
    total_bases: 2,
    runs: 1,
    rbis: 1,
    walks: 1,
    stolen_bases: 1,
    hits_runs_rbis: 2,
    batter_strikeouts: 1,
    emerging_power: 1,
  };

  return rows.slice(0, 25).map((raw: any, index: number) => {
    const row = {
      ...raw,
      category,
      rank: Number(raw?.rank || index + 1),
    };

    const found = resultFor(row, results, false);
    const stat = found?.batting;
    if (!stat) return row;

    const actual: any = {
      home_runs: num(stat.homeRuns),
      hits: num(stat.hits),
      total_bases: num(stat.totalBases),
      runs: num(stat.runs),
      rbis: num(stat.rbi),
      walks: num(stat.baseOnBalls),
      stolen_bases: num(stat.stolenBases),
      batter_strikeouts: num(stat.strikeOuts),
    };

    actual.hits_runs_rbis =
      actual.hits + actual.runs + actual.rbis;

    const key = category === "emerging_power" ? "home_runs" : category;
    const reached = actual[key] >= threshold[category];

    return {
      ...row,
      game_pk: row?.game_pk || row?.gamePk || found.gamePk,
      actual: actual[key],
      actual_hits: actual.hits,
      actual_home_runs: actual.home_runs,
      actual_total_bases: actual.total_bases,
      actual_runs: actual.runs,
      actual_rbis: actual.rbis,
      actual_walks: actual.walks,
      actual_stolen_bases: actual.stolen_bases,
      actual_hits_runs_rbis: actual.hits_runs_rbis,
      actual_batter_strikeouts: actual.batter_strikeouts,
      correct: reached,
      game_finished: true,
      result_live: false,
      result_label: reached ? "✅ Hit" : "❌ Miss",
    };
  });
}

function recoverPitcherCategory(rows: any[], category: string, results: any) {
  const fields: Record<string, string> = {
    strikeouts: "strikeOuts",
    outs_recorded: "outs",
    hits_allowed: "hits",
    walks_allowed: "baseOnBalls",
    earned_runs: "earnedRuns",
  };

  return rows.slice(0, 25).map((raw: any, index: number) => {
    const row = {
      ...raw,
      category,
      rank: Number(raw?.rank || index + 1),
    };

    const found = resultFor(row, results, true);
    const stat = found?.pitching;
    if (!stat) return row;

    let actual = num(stat[fields[category]]);

    if (category === "outs_recorded" && typeof stat.outs === "undefined") {
      const innings = String(stat.inningsPitched || "0");
      const [whole, fraction] = innings.split(".");
      actual = num(whole) * 3 + num(fraction);
    }

    const projection = Number(
      row?.projection ??
        row?.modelProjection ??
        row?.[`projected_${category}`],
    );

    const absoluteError = Number.isFinite(projection)
      ? Math.abs(actual - projection)
      : null;

    return {
      ...row,
      game_pk: row?.game_pk || row?.gamePk || found.gamePk,
      actual,
      absolute_error: absoluteError,
      finalized: absoluteError != null,
      game_finished: true,
      result_live: false,
      result_label:
        absoluteError == null
          ? "Final"
          : absoluteError <= 1
            ? "Within 1"
            : "Outside 1",
    };
  });
}

function emergingCandidates(rows: any[]) {
  return rows
    .filter((row: any) => {
      const rank = num(row?.rank || row?.hr_rank);
      const season = row?.season_stats || {};
      const homeRuns = num(
        row?.season_home_runs ||
          season?.home_runs ||
          season?.homeRuns,
      );

      const plateAppearances = num(
        row?.season_plate_appearances ||
          season?.plate_appearances ||
          season?.plateAppearances ||
          season?.pa,
      );

      const gi = num(row?.gi_score || row?.giScore || row?.score);
      const probability = num(
        row?.home_run_probability ||
          row?.hr_probability ||
          row?.probability ||
          row?.modelProbability,
      );

      return (
        !(rank >= 1 && rank <= 25) &&
        homeRuns <= 18 &&
        (homeRuns <= 15 || (plateAppearances > 0 && plateAppearances <= 325)) &&
        (gi >= 52 || probability >= 10)
      );
    })
    .slice(0, 10);
}

async function recoverArchiveDay(day: string) {
  const results = await mlbResults(day);
  const batterCategories: Record<string, any[]> = {};
  const pitcherCategories: Record<string, any[]> = {};

  for (const category of BATTER_CATEGORIES) {
    const rows = await archivedRows(category, day, false);
    if (rows.length) {
      batterCategories[category] = recoverBatterCategory(
        rows,
        category,
        results,
      );
    }
  }

  for (const category of PITCHER_CATEGORIES) {
    const rows = await archivedRows(category, day, true);
    if (rows.length) {
      pitcherCategories[category] = recoverPitcherCategory(
        rows,
        category,
        results,
      );
    }
  }

  let pool = await homeRunPool(day);
  if (!pool.length) pool = await archivedRows("home_runs", day, false);

  const emerging = emergingCandidates(pool);

  return {
    batter: {
      captured_at: new Date().toISOString(),
      categories: batterCategories,
    },
    pitcher: {
      captured_at: new Date().toISOString(),
      categories: pitcherCategories,
    },
    emerging: {
      captured_at: new Date().toISOString(),
      categories: {
        emerging_power: recoverBatterCategory(
          emerging,
          "emerging_power",
          results,
        ),
      },
    },
  };
}

function snapshotDay(data: any, day: string) {
  return {
    batter: data?.batter?.days?.[day] || null,
    pitcher: data?.pitcher?.days?.[day] || null,
    emerging: data?.emerging?.days?.[day] || null,
  };
}

function hasAnyDay(payload: any) {
  const parts = [payload?.batter, payload?.pitcher, payload?.emerging];

  return parts.some((part) =>
    Object.values(part?.categories || {}).some(
      (rows: any) => Array.isArray(rows) && rows.length,
    ),
  );
}

async function candidateDays() {
  const days = new Set<string>();

  try {
    const names = await fs.readdir(RECOVERY_DIR);
    for (const name of names) {
      const match = name.match(/^(\d{4}-\d{2}-\d{2})\.json$/);
      if (match) days.add(match[1]);
    }
  } catch {}

  try {
    const names = await fs.readdir(ARCHIVE_DIR);
    for (const name of names) {
      const match = name.match(/_(\d{4}-\d{2}-\d{2})\.json$/);
      if (match) days.add(match[1]);
    }
  } catch {}

  return [...days].sort();
}

export async function mergeRailwayMlbHistory(data: any) {
  const days = await candidateDays();
  const localRecovered: string[] = [];
  const archiveRecovered: string[] = [];

  for (const day of days) {
    const current = snapshotDay(data, day);

    if (hasAnyDay(current)) {
      await writeLocalDay(day, current);
      continue;
    }

    let recovered = await readLocalDay(day);

    if (recovered && hasAnyDay(recovered)) {
      localRecovered.push(day);
    } else {
      recovered = await recoverArchiveDay(day);

      if (recovered && hasAnyDay(recovered)) {
        archiveRecovered.push(day);
        await writeLocalDay(day, recovered);
      }
    }

    if (recovered && hasAnyDay(recovered)) {
      data.batter = mergeDay(data.batter, day, recovered.batter);
      data.pitcher = mergeDay(data.pitcher, day, recovered.pitcher);
      data.emerging = mergeDay(data.emerging, day, recovered.emerging);
    }
  }

  return {
    data,
    localRecovered,
    archiveRecovered,
    availableDays: days,
  };
}
