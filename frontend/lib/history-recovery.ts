import { promises as fs } from "node:fs";
import path from "node:path";
import {
  readDurableHistory,
  writeDurableHistory,
  historyRoot,
} from "@/lib/durable-history";

type SupportedSport = "nfl" | "cfb" | "nba" | "wnba" | "nhl" | "cbb";

type ArchiveSnapshot = {
  capturedAt?: string;
  hash?: string;
  payload?: any;
};

const SUPPORTED = new Set<SupportedSport>([
  "nfl",
  "cfb",
  "nba",
  "wnba",
  "nhl",
  "cbb",
]);

function safeNumber(value: any) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function rowsFromPayload(payload: any, market: string): any[] {
  const candidates = [
    payload?.rows,
    payload?.rankings,
    payload?.data?.rows,
    payload?.data?.rankings,
    payload?.[market],
    payload?.rankings?.[market],
    payload?.data?.[market],
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length) return candidate;
    if (Array.isArray(candidate?.rankings) && candidate.rankings.length) {
      return candidate.rankings;
    }
  }

  return [];
}

async function readFirstObjectFromJsonArray(file: string, maxBytes = 24 * 1024 * 1024) {
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

      const chunk = buffer.subarray(0, bytesRead).toString("utf8");

      for (const char of chunk) {
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
          if (escaped) {
            escaped = false;
          } else if (char === "\\") {
            escaped = true;
          } else if (char === '"') {
            inString = false;
          }
          continue;
        }

        if (char === '"') {
          inString = true;
          continue;
        }

        if (char === "{") depth += 1;
        if (char === "}") depth -= 1;

        if (depth === 0) {
          return JSON.parse(text) as ArchiveSnapshot;
        }
      }
    }

    return null;
  } catch {
    return null;
  } finally {
    await handle.close();
  }
}

async function readUsefulSnapshot(file: string, market: string) {
  try {
    const stat = await fs.stat(file);

    // Normal archive files can be read fully. Giant legacy files are streamed
    // only far enough to extract the first snapshot so we never load 1+ GB.
    if (stat.size <= 32 * 1024 * 1024) {
      const parsed = JSON.parse(await fs.readFile(file, "utf8"));
      const snapshots: ArchiveSnapshot[] = Array.isArray(parsed) ? parsed : [];

      for (let i = snapshots.length - 1; i >= 0; i -= 1) {
        if (rowsFromPayload(snapshots[i]?.payload, market).length) {
          return snapshots[i];
        }
      }

      return null;
    }

    return readFirstObjectFromJsonArray(file);
  } catch {
    return null;
  }
}

function isVerifiablePregameRow(row: any, capturedAt: string | undefined) {
  if (
    row?.frozen ||
    row?.lockedAtKickoff ||
    row?.lockedAtPuckDrop ||
    row?.lockedAtStart ||
    row?.frozenAt
  ) {
    return true;
  }

  const captureTime = Date.parse(String(capturedAt || ""));
  const gameTime = Date.parse(String(row?.gameTime || row?.tipoff || row?.date || ""));

  if (!Number.isFinite(captureTime) || !Number.isFinite(gameTime)) return false;

  // Small tolerance for route processing immediately around lock.
  return captureTime <= gameTime + 2 * 60 * 1000;
}

function predictionSide(sport: SupportedSport, row: any, market: string) {
  const raw = String(
    row?.pickSide ??
      row?.prediction ??
      row?.pick ??
      "",
  ).toUpperCase();

  if (sport === "cfb") {
    if (raw === "UNDER") return "under";
    if (raw === "OVER") return "over";
    return undefined;
  }

  if (sport === "nba" && market === "first_basket") return "FIRST BASKET";
  if (raw === "UNDER") return "UNDER";
  if (raw === "OVER") return "OVER";
  return null;
}

function convertRow(
  sport: SupportedSport,
  market: string,
  day: string,
  snapshot: ArchiveSnapshot,
  row: any,
  index: number,
) {
  const sportsbookLine = safeNumber(
    row?.sportsbookLine ?? row?.line ?? row?.referenceLine,
  );

  const modelProjection = safeNumber(
    row?.modelProjection ?? row?.projection,
  );

  const playerId = String(row?.playerId ?? row?.player_id ?? "").trim();
  const playerName = String(row?.playerName ?? row?.player_name ?? "").trim();
  const matchup = String(row?.matchup ?? "").trim();

  if (!playerId || !playerName || !matchup) return null;

  // Keep only true betting predictions. TD scorer markets may legitimately
  // have no numeric line.
  const scorerMarket =
    market === "anytime_td" ||
    market === "first_td" ||
    market === "first_basket";

  if (sportsbookLine == null && !scorerMarket) return null;
  if (!isVerifiablePregameRow(row, snapshot.capturedAt)) return null;

  const savedAt = String(snapshot.capturedAt || new Date().toISOString());
  const rank = safeNumber(row?.rank) ?? index + 1;
  const gameId = String(row?.gameId ?? row?.eventId ?? row?.game_id ?? "");

  const common: any = {
    key: `${day}|${market}|${playerId}|${matchup}`,
    gameDate: day,
    gameTime: String(row?.gameTime ?? row?.tipoff ?? row?.date ?? ""),
    gameId,
    matchup,
    market,
    playerId,
    playerName,
    teamName: String(row?.teamName ?? row?.team ?? ""),
    teamLogo: String(row?.teamLogo ?? ""),
    headshot: String(row?.headshot ?? ""),
    sportsbookLine,
    modelProjection,
    modelProbability: safeNumber(row?.modelProbability ?? row?.probability),
    giScore: safeNumber(row?.giScore ?? row?.score) ?? 0,
    bookmakerCount: safeNumber(row?.bookmakerCount) ?? 0,
    rank,
    savedAt,
    status: "pending",
    actual: null,
    gradedAt: null,
    frozenAt: savedAt,
    recoveredAfterStart: false,
  };

  if (sport === "nfl") {
    common.position = String(row?.position ?? "");
    common.teamId = String(row?.teamId ?? "");
    common.sportsbookProbability = safeNumber(row?.sportsbookProbability);
    common.pickSide = predictionSide(sport, row, market);
    common.originalRank = rank;
    common.lastSeenRank = rank;
    common.lastSeenAt = savedAt;
  } else if (sport === "cfb") {
    common.position = String(row?.position ?? "");
    common.pick = predictionSide(sport, row, market);
  } else {
    common.pickSide = predictionSide(sport, row, market);
  }

  return common;
}

export async function recoverHistoryFromArchives(
  requestedDays = 45,
  onlySport?: string | null,
) {
  const root = historyRoot();
  const today = new Date();
  const cutoff = new Date(today.getTime() - Math.max(1, requestedDays) * 86400000);
  const targetSports = onlySport && SUPPORTED.has(onlySport as SupportedSport)
    ? [onlySport as SupportedSport]
    : [...SUPPORTED];

  let checked = 0;
  let recovered = 0;
  let skippedExisting = 0;
  let skippedUnverifiable = 0;
  const details: any[] = [];

  for (const sport of targetSports) {
    const archiveDir = path.join(root, sport, "archive");
    let names: string[] = [];

    try {
      names = await fs.readdir(archiveDir);
    } catch {
      continue;
    }

    for (const name of names) {
      const match = name.match(/^(.+)_(\d{4}-\d{2}-\d{2})\.json$/);
      if (!match) continue;

      const [, market, day] = match;
      const dayTime = Date.parse(`${day}T12:00:00Z`);
      if (!Number.isFinite(dayTime) || dayTime < cutoff.getTime()) continue;

      checked += 1;

      const existing = await readDurableHistory<any>(sport, market, day);
      if (existing.length) {
        skippedExisting += 1;
        continue;
      }

      const file = path.join(archiveDir, name);
      const snapshot = await readUsefulSnapshot(file, market);

      if (!snapshot) {
        skippedUnverifiable += 1;
        continue;
      }

      const sourceRows = rowsFromPayload(snapshot.payload, market);
      const converted = sourceRows
        .map((row, index) => convertRow(sport, market, day, snapshot, row, index))
        .filter(Boolean);

      if (!converted.length) {
        skippedUnverifiable += 1;
        continue;
      }

      const ok = await writeDurableHistory(sport, market, day, converted);

      if (ok) {
        recovered += 1;
        details.push({
          sport,
          market,
          day,
          rows: converted.length,
        });
      }
    }
  }

  return {
    success: true,
    checked,
    recovered,
    skippedExisting,
    skippedUnverifiable,
    details,
  };
}
