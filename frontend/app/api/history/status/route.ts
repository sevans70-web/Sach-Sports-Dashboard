import { promises as fs } from "node:fs";
import path from "node:path";
import {cloudWriteStatus} from "../../../../scripts/history-cloud.mjs";
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

  let backup:any=null;try{backup=JSON.parse(await fs.readFile(path.join(root,"_system","last-backup.json"),"utf8"))}catch{}
  let retention:any=null;try{retention=JSON.parse(await fs.readFile(path.join(root,"_system","last-retention-preview.json"),"utf8"))}catch{}
  return NextResponse.json(
    {
      success: storage.ok,
      storage,
      capture,
      cloudWrites: cloudWriteStatus(),
      backup,
      retention,
      localRetentionDays:7,
      archiveDestination:"Google Drive",
      pruningRequiresVerifiedArchive:true,
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

