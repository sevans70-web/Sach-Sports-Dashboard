import { promises as fs } from "node:fs";
import path from "node:path";
import { adminJson, currentAdmin } from "@/lib/admin-auth";
import { historyRoot } from "@/lib/durable-history";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET() {
  if (!await currentAdmin()) return adminJson({ error: "Administrator sign-in required." }, 401);
  let capture: any = null;
  try { capture = JSON.parse(await fs.readFile(path.join(historyRoot(), "_system", "last-capture.json"), "utf8")); } catch {}
  let storageReadable = false;
  try { await fs.access(historyRoot()); storageReadable = true; } catch {}
  return adminJson({
    updatedAt: new Date().toISOString(), commit: process.env.RAILWAY_GIT_COMMIT_SHA || "local",
    storageReadable, capture,
    backupConfigured: Boolean(process.env.BACKUP_DRIVE_FOLDER_ID && process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET && process.env.GOOGLE_OAUTH_REFRESH_TOKEN),
    backupVerification: "Configuration only. Latest completed Drive backup is not independently verified by this screen.",
    models: { validated: 0, status: "GI scores and betting picks are withheld. The validated-model registry is empty.",
      evidence: "Experimental workload backtest: 48,848 player-game-market observations; 224 selected players. Mixed error results; no exact-price betting calibration or validated profitability.",
      missing: ["Frozen pregame role, availability and matchup context", "Sport-specific opportunity estimates and held-out calibration", "Independent quarter and scorer models"] },
    access: { administrator: "Dashboard email only", testers: "Tester invitations and accounts are not enabled in this release." },
  });
}
