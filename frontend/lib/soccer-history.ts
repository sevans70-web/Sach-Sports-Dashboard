import { normalizeName } from "@/lib/owls-soccer";

export type SoccerAppearance = {
  gameId: string;
  gameDate: string;
  playerId: string;
  playerName: string;
  photoUrl: string;
  teamId: string;
  team: string;
  position: string;
  starter: boolean;
  minutes: number;
  shots: number;
  shots_on_target: number;
  goals: number;
  assists: number;
  saves: number;
};

export type SoccerRosterPlayer = {
  playerId: string;
  playerName: string;
  photoUrl: string;
  teamId: string;
  team: string;
  position: string;
};

type MetricKey =
  | "minutes"
  | "shots"
  | "shots_on_target"
  | "goals"
  | "assists"
  | "saves";

function num(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(
    String(value ?? "")
      .split(":")[0]
      .replace("%", "")
      .replace(/[^\d.+-]/g, ""),
  );
  return Number.isFinite(parsed) ? parsed : 0;
}

function statKey(label: unknown): MetricKey | null {
  const key = String(label ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

  const map: Record<string, MetricKey> = {
    min: "minutes",
    mins: "minutes",
    minute: "minutes",
    minutes: "minutes",
    sh: "shots",
    shots: "shots",
    totalshots: "shots",
    shotstotal: "shots",
    shotattempts: "shots",
    attempts: "shots",
    sog: "shots_on_target",
    sot: "shots_on_target",
    shotsontarget: "shots_on_target",
    shotsongoal: "shots_on_target",
    ongoal: "shots_on_target",
    g: "goals",
    gl: "goals",
    goal: "goals",
    goals: "goals",
    a: "assists",
    ast: "assists",
    assist: "assists",
    assists: "assists",
    sv: "saves",
    save: "saves",
    saves: "saves",
    goalkeepersaves: "saves",
    goaliesaves: "saves",
  };

  return map[key] ?? null;
}

function firstString(obj: any, keys: string[]) {
  if (!obj || typeof obj !== "object") return "";
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (value && typeof value === "object") {
      for (const nested of ["displayName", "fullName", "shortName", "name", "abbreviation"]) {
        const nestedValue = value[nested];
        if (typeof nestedValue === "string" && nestedValue.trim()) return nestedValue.trim();
      }
    }
  }
  return "";
}

function athleteFrom(row: any) {
  return row?.athlete || row?.player || row?.participant || row || {};
}

function baseAppearance(
  athleteRow: any,
  context: { gameId: string; gameDate: string; teamId?: string; team?: string },
): SoccerAppearance {
  const athlete = athleteFrom(athleteRow);
  const position =
    firstString(athlete, ["position"]) ||
    firstString(athleteRow, ["position", "positionAbbreviation"]);

  return {
    gameId: context.gameId,
    gameDate: context.gameDate,
    playerId: String(athlete?.id || athlete?.uid || athleteRow?.id || ""),
    playerName:
      firstString(athlete, ["displayName", "fullName", "shortName", "name"]) ||
      firstString(athleteRow, ["displayName", "fullName", "shortName", "name"]),
    photoUrl:
      String(
        athlete?.headshot?.href ||
          athlete?.headshot ||
          athleteRow?.headshot?.href ||
          athleteRow?.headshot ||
          "",
      ),
    teamId: String(context.teamId || athlete?.team?.id || athleteRow?.team?.id || ""),
    team:
      context.team ||
      firstString(athlete?.team, ["displayName", "name"]) ||
      firstString(athleteRow?.team, ["displayName", "name"]) ||
      "",
    position: String(position || "").toUpperCase(),
    starter: Boolean(
      athleteRow?.starter ??
        athleteRow?.isStarter ??
        athleteRow?.starting ??
        athleteRow?.lineupStatus === "starter",
    ),
    minutes: 0,
    shots: 0,
    shots_on_target: 0,
    goals: 0,
    assists: 0,
    saves: 0,
  };
}

function applyLabelStats(target: SoccerAppearance, labels: unknown[], values: unknown[]) {
  let found = 0;
  labels.forEach((label, index) => {
    const key = statKey(label);
    if (!key) return;
    target[key] = num(values[index]);
    found += 1;
  });
  return found;
}

function applyObjectStats(target: SoccerAppearance, stats: any) {
  if (!stats || typeof stats !== "object" || Array.isArray(stats)) return 0;
  let found = 0;

  for (const [rawKey, rawValue] of Object.entries(stats)) {
    const key = statKey(rawKey);
    if (!key) continue;
    target[key] = num(rawValue);
    found += 1;
  }

  return found;
}

function pushIfUseful(out: SoccerAppearance[], row: SoccerAppearance, found: number) {
  if (!row.playerName) return;
  if (found > 0 || row.starter) out.push(row);
}

function parsePlayerBlocks(
  blocks: any[],
  context: { gameId: string; gameDate: string },
  out: SoccerAppearance[],
) {
  for (const teamBlock of blocks || []) {
    const team = teamBlock?.team || teamBlock?.competitor || {};
    const teamId = String(team?.id || teamBlock?.teamId || "");
    const teamName =
      firstString(team, ["displayName", "shortDisplayName", "name"]) ||
      firstString(teamBlock, ["teamName"]);

    for (const group of teamBlock?.statistics || teamBlock?.stats || []) {
      const labels =
        group?.labels ||
        group?.names ||
        group?.keys ||
        group?.descriptions ||
        group?.displayNames ||
        [];

      for (const athleteRow of group?.athletes || group?.players || group?.participants || []) {
        const row = baseAppearance(athleteRow, {
          ...context,
          teamId,
          team: teamName,
        });

        let found = 0;
        found += applyLabelStats(row, labels, athleteRow?.stats || athleteRow?.values || []);
        found += applyObjectStats(row, athleteRow?.statistics);
        found += applyObjectStats(row, athleteRow?.statsMap);
        pushIfUseful(out, row, found);
      }
    }
  }
}

function parseRosterStyle(
  rosters: any[],
  context: { gameId: string; gameDate: string },
  out: SoccerAppearance[],
) {
  for (const teamBlock of rosters || []) {
    const team = teamBlock?.team || {};
    const teamId = String(team?.id || teamBlock?.teamId || "");
    const teamName =
      firstString(team, ["displayName", "shortDisplayName", "name"]) ||
      firstString(teamBlock, ["teamName"]);

    const groups = teamBlock?.roster || teamBlock?.athletes || teamBlock?.players || [];
    for (const athleteRow of groups) {
      const row = baseAppearance(athleteRow, {
        ...context,
        teamId,
        team: teamName,
      });

      let found = 0;
      const labels =
        athleteRow?.labels ||
        athleteRow?.statLabels ||
        athleteRow?.statistics?.labels ||
        [];
      const values =
        athleteRow?.stats ||
        athleteRow?.values ||
        athleteRow?.statistics?.values ||
        [];

      found += applyLabelStats(row, labels, values);
      found += applyObjectStats(row, athleteRow?.statistics);
      found += applyObjectStats(row, athleteRow?.statsMap);
      pushIfUseful(out, row, found);
    }
  }
}

function recursivePlayerStats(
  node: any,
  context: { gameId: string; gameDate: string },
  out: SoccerAppearance[],
  depth = 0,
) {
  if (!node || depth > 10) return;

  if (Array.isArray(node)) {
    for (const item of node) recursivePlayerStats(item, context, out, depth + 1);
    return;
  }

  if (typeof node !== "object") return;

  const athlete = node?.athlete || node?.player;
  const labels = node?.labels || node?.statLabels || node?.names;
  const values = node?.stats || node?.values;

  if (athlete && Array.isArray(labels) && Array.isArray(values)) {
    const row = baseAppearance(node, context);
    const found = applyLabelStats(row, labels, values) + applyObjectStats(row, node?.statistics);
    pushIfUseful(out, row, found);
  }

  for (const value of Object.values(node)) {
    recursivePlayerStats(value, context, out, depth + 1);
  }
}

function dedupeAppearances(rows: SoccerAppearance[]) {
  const merged = new Map<string, SoccerAppearance>();

  for (const row of rows) {
    if (!row.playerName) continue;
    const key = `${row.gameId}|${normalizeName(row.playerName)}|${row.teamId}`;
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, row);
      continue;
    }

    const next = { ...existing };
    next.playerId = next.playerId || row.playerId;
    next.photoUrl = next.photoUrl || row.photoUrl;
    next.teamId = next.teamId || row.teamId;
    next.team = next.team || row.team;
    next.position = next.position || row.position;
    next.starter = next.starter || row.starter;

    for (const keyName of [
      "minutes",
      "shots",
      "shots_on_target",
      "goals",
      "assists",
      "saves",
    ] as MetricKey[]) {
      next[keyName] = Math.max(Number(next[keyName] || 0), Number(row[keyName] || 0));
    }

    merged.set(key, next);
  }

  return [...merged.values()];
}

export function extractAppearances(
  payload: any,
  context: { gameId: string; gameDate: string },
) {
  const root = payload?.gamepackageJSON || payload;
  const out: SoccerAppearance[] = [];

  parsePlayerBlocks(root?.boxscore?.players || [], context, out);
  parsePlayerBlocks(root?.boxscore?.playerStats || [], context, out);
  parseRosterStyle(root?.rosters || root?.boxscore?.rosters || [], context, out);

  if (!out.length) recursivePlayerStats(root, context, out);

  return dedupeAppearances(out);
}

export function extractRosterPlayers(
  payload: any,
  context: { teamId: string; team: string },
) {
  const athletes =
    payload?.athletes ||
    payload?.team?.athletes ||
    payload?.roster ||
    payload?.items ||
    [];

  const rows: SoccerRosterPlayer[] = [];

  const walk = (node: any, depth = 0) => {
    if (!node || depth > 7) return;

    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }

    if (typeof node !== "object") return;

    const athlete = node?.athlete || node;
    const name = firstString(athlete, ["displayName", "fullName", "shortName", "name"]);

    if (name && (athlete?.id || node?.athlete?.id)) {
      const position =
        firstString(athlete, ["position"]) ||
        firstString(node, ["position", "positionAbbreviation"]);

      rows.push({
        playerId: String(athlete?.id || node?.athlete?.id || ""),
        playerName: name,
        photoUrl: String(athlete?.headshot?.href || athlete?.headshot || ""),
        teamId: context.teamId,
        team: context.team,
        position: String(position || "").toUpperCase(),
      });
      return;
    }

    for (const value of Object.values(node)) walk(value, depth + 1);
  };

  walk(athletes);

  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = row.playerId || normalizeName(row.playerName);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function tokens(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function playerNameScore(a: string, b: string) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 100;

  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) return 0;

  const lastA = ta[ta.length - 1];
  const lastB = tb[tb.length - 1];
  let score = 0;

  if (lastA === lastB) score += 58;
  else if (lastA.length >= 5 && lastB.length >= 5 && (lastA.includes(lastB) || lastB.includes(lastA))) score += 35;

  if (ta[0] === tb[0]) score += 28;
  else if (ta[0]?.[0] && ta[0][0] === tb[0]?.[0]) score += 12;

  const setB = new Set(tb);
  const overlap = ta.filter((token) => setB.has(token)).length;
  score += Math.min(20, overlap * 10);

  if (na.includes(nb) || nb.includes(na)) score += 15;

  return Math.min(99, score);
}

export function buildHistoryIndex(rows: SoccerAppearance[]) {
  const map = new Map<string, SoccerAppearance[]>();
  for (const row of rows) {
    const key = normalizeName(row.playerName);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  }
  return map;
}

export function findPlayerHistory(
  playerName: string,
  history: Map<string, SoccerAppearance[]>,
  teamHint = "",
) {
  const exact = history.get(normalizeName(playerName));
  if (exact?.length) return exact;

  let bestKey = "";
  let bestScore = 0;

  for (const [key, rows] of history.entries()) {
    const candidate = rows[0]?.playerName || key;
    let score = playerNameScore(playerName, candidate);

    if (teamHint) {
      const normalizedHint = normalizeName(teamHint);
      const teamMatch = rows.some((row) => {
        const team = normalizeName(row.team);
        return team && normalizedHint && (team.includes(normalizedHint) || normalizedHint.includes(team));
      });
      if (teamMatch) score += 10;
    }

    if (score > bestScore) {
      bestScore = score;
      bestKey = key;
    }
  }

  return bestScore >= 70 ? history.get(bestKey) || [] : [];
}

export function findRosterPlayer(
  playerName: string,
  roster: SoccerRosterPlayer[],
  teamHint = "",
) {
  let best: SoccerRosterPlayer | null = null;
  let bestScore = 0;
  const normalizedHint = normalizeName(teamHint);

  for (const row of roster) {
    let score = playerNameScore(playerName, row.playerName);

    if (normalizedHint) {
      const team = normalizeName(row.team);
      if (team && (team.includes(normalizedHint) || normalizedHint.includes(team))) score += 10;
    }

    if (score > bestScore) {
      bestScore = score;
      best = row;
    }
  }

  return bestScore >= 70 ? best : null;
}

export function scheduleEventRows(payload: any) {
  const candidates =
    payload?.events ||
    payload?.schedule ||
    payload?.items ||
    payload?.team?.schedule ||
    [];

  if (!Array.isArray(candidates)) return [];

  return candidates
    .map((event: any) => {
      const competition = event?.competitions?.[0] || {};
      const type = event?.status?.type || competition?.status?.type || {};
      return {
        gameId: String(event?.id || competition?.id || ""),
        kickoff: String(event?.date || competition?.date || ""),
        completed: Boolean(type?.completed || type?.state === "post"),
      };
    })
    .filter((event: any) => event.gameId);
}
