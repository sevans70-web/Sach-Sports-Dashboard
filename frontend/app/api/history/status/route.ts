import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { durableHistoryStatus, historyRoot } from "@/lib/durable-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const root = historyRoot();
  const manifest = path.join(root, "_system", "last-capture.json");
  const storage = await durableHistoryStatus();

  let capture: any = null;

  try {
    capture = JSON.parse(await fs.readFile(manifest, "utf8"));
  } catch {}

  return NextResponse.json(
    {
      success: storage.ok,
      storage,
      capture,
      schedulerExpectedEveryMinutes: 10,
      updatedAt: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    },
  );
}
