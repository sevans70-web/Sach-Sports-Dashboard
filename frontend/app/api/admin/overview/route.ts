import { promises as fs } from "node:fs";
import path from "node:path";
import { adminJson, currentAdmin } from "@/lib/admin-auth";
import { historyRoot } from "@/lib/durable-history";
import probabilityReport from '@/model-research/2026-10-19/probability-evaluation.json';
import footballReport from '@/model-research/2026-10-19/nfl-population/probability-evaluation.json';
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
      evidence: "The probability engine has been fitted and evaluated on 48,848 observations across six sports, plus a separate NFL population of 14,950 observations from 352 completed games. It estimates workload and efficiency separately and tests forecast uncertainty. Results remain mixed; these are experimental models, with no validated GI or picks.",
      probabilityEvaluation: {version:probabilityReport.modelId,modelGroups:probabilityReport.reports.filter(r=>r.reason===null).length,sourceDataSha256:probabilityReport.sourceDataSha256,exactQuoteSamples:probabilityReport.reports.reduce((n,r)=>n+r.exactQuoteSamples,0),giEnabled:probabilityReport.giEnabled},
      footballEvaluation: {version:footballReport.modelId,observations:footballReport.observations,markets:footballReport.reports.map(r=>({market:r.group,forecasts:r.forecasts,interval80Coverage:r.interval80Coverage,exactQuoteSamples:r.exactQuoteSamples}))},
      missing: ["Frozen pregame role, availability and matchup context", "Exact historical book-line probability calibration and fresh independent validation", "Independent quarter and scorer models", "Improved passing/rushing forecasts and receiving-yard uncertainty"] },
    access: { administrator: "Dashboard email only", testers: "Tester invitations and accounts are not enabled in this release." },
  });
}
