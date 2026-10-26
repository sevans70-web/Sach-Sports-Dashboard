declare global {
  var __sachHistoryScheduler:
    | {
        started: boolean;
        inFlight: boolean;
        timer?: ReturnType<typeof setInterval>;
      }
    | undefined;
}

const SPORTS = ["nfl", "nba", "cfb", "nhl", "cbb", "soccer", "wnba", "mlb"] as const;
const TEN_MINUTES = 10 * 60 * 1000;

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function hit(base: string, path: string, timeoutMs = 120_000, method="GET") {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${base}${path}`, {
      method,
      cache: "no-store",
      signal: controller.signal,
      headers: { "x-sach-history-scheduler": "1" },
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok || payload?.success === false) {
      throw new Error(
        payload?.error ||
          `HTTP ${response.status} for ${path}`,
      );
    }

    return payload;
  } finally {
    clearTimeout(timer);
  }
}

async function runCycle(base: string, deep = false) {
  const state =
    globalThis.__sachHistoryScheduler ||
    (globalThis.__sachHistoryScheduler = {
      started: true,
      inFlight: false,
    });

  if (state.inFlight) {
    console.log("[sach-history] skipped overlapping capture cycle");
    return;
  }

  state.inFlight = true;
  const startedAt = new Date().toISOString();
  console.log(`[sach-history] capture cycle started ${startedAt}`);

  try {

    for (const sport of SPORTS) {
      const suffix = deep ? "&deep=1" : "";
      const path = `/api/history/capture?sport=${sport}${suffix}`;

      try {
        const result = await hit(base, path, 180_000);
        console.log(
          `[sach-history] ${sport} capture ok saved=${result?.saved ?? 0} failed=${result?.failed ?? 0}`,
        );
      } catch (firstError) {
        console.error(
          `[sach-history] ${sport} first attempt failed`,
          firstError instanceof Error ? firstError.message : String(firstError),
        );

        await sleep(15_000);

        try {
          const result = await hit(base, path, 180_000);
          console.log(
            `[sach-history] ${sport} retry ok saved=${result?.saved ?? 0} failed=${result?.failed ?? 0}`,
          );
        } catch (secondError) {
          console.error(
            `[sach-history] ${sport} retry failed`,
            secondError instanceof Error ? secondError.message : String(secondError),
          );
        }
      }

      // Avoid hammering the odds/data providers between sports.
      await sleep(1_500);
    }
    // Capture current pregame evidence before cold archive recovery.
    if (deep) {
      try {
        const recovered = await hit(base, "/api/history/recover?days=45", 180_000);
        console.log(
          `[sach-history] startup recovery checked=${recovered?.checked ?? 0} recovered=${recovered?.recovered ?? 0}`,
        );
      } catch (error) {
        console.error(
          "[sach-history] startup recovery failed",
          error instanceof Error ? error.message : String(error),
        );
      }
    }

  } finally {
    state.inFlight = false;
    console.log(`[sach-history] capture cycle finished ${new Date().toISOString()}`);
  }
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  if (globalThis.__sachHistoryScheduler?.started) return;

  globalThis.__sachHistoryScheduler = {
    started: true,
    inFlight: false,
  };

  const {startRuntimeMonitor}=await import("./lib/runtime-monitor");
  startRuntimeMonitor(process.env.SACH_HISTORY_DIR||"/data/sach-history");

  const port = process.env.PORT || "3000";
  const base = `http://127.0.0.1:${port}`;

  console.log(
    `[sach-history] scheduler registered; automatic capture every 10 minutes; root=${process.env.SACH_HISTORY_DIR || "/data/sach-history"}`,
  );

  // First run: recover any archived history first, then capture/grade all sports.
  setTimeout(() => {
    runCycle(base, true).catch((error) =>
      console.error(
        "[sach-history] startup cycle",
        error instanceof Error ? error.message : String(error),
      ),
    );
  }, 20_000);

  // Independent per-sport guards do not wait for the eight-sport capture loop.
  // At most two guard requests run concurrently; HTTP routes also coalesce work.
  const guards=new Set<string>(),guardLast=new Map<string,number>();let guardIndex=0;
  const guardTimer=setInterval(()=>{
    for(let count=0;count<SPORTS.length&&guards.size<2;count++){
      const sport=SPORTS[guardIndex++%SPORTS.length];if(guards.has(sport)||Date.now()-(guardLast.get(sport)||0)<30_000)continue;
      guards.add(sport);guardLast.set(sport,Date.now());
      hit(base,`/api/history/safeguards?sport=${sport}`,240_000,"POST")
       .then(()=>{})
       .catch(error=>console.error('[sach-save]',sport,error instanceof Error?error.message:String(error)))
       .finally(()=>guards.delete(sport));
    }
  },5000);
  guardTimer.unref();

  globalThis.__sachHistoryScheduler.timer = setInterval(() => {
    runCycle(base, false).catch((error) =>
      console.error(
        "[sach-history] scheduled cycle",
        error instanceof Error ? error.message : String(error),
      ),
    );
  }, TEN_MINUTES);
}
