# Sach Sports Cloudflare migration — decision assessment
Date: 2026-11-05 (Toronto)

## Decision
**NO-GO on a full Railway shutdown/cutover. CONDITIONAL GO on a separately deployed Cloudflare UI/API staging instance.**

## Verified via GitHub Actions
- vinext check: 100% reported supported imports/config; no reported compatibility issues.
- Cloudflare Workers build succeeded on `cloudflare-compatibility-test` after removing Railway's `output: "standalone"` from that branch.
- Initial local Worker error `node:inspector StubSession: The Session method is not implemented` traced to `lib/runtime-cpu.ts` invoked from `instrumentation.ts`.
- Skipping Node-only CPU sampler and persistent scheduler for workerd made local dev and preview smoke checks respond HTTP 200: `/api/health`, `/`, `/nba`, `/nfl`, `/nhl`, `/cfb`, `/cbb`.
- Verification: https://github.com/sevans70-web/Sach-Sports-Dashboard/actions/runs/42149693953

## Architecture blockers found in source
1. `frontend/instrumentation.ts`: first-deployment and every-ten-minute capture loop; safeguards every 120 seconds, CPU profiler and `process.cpuUsage`. Disabled on Workers, with no replacement. If switched to Workers now, automated captures and grading halt.
2. `frontend/app/api/history/capture/route.ts` writes capture manifests to `/data/sach-history` via Node fs, mkdir, rename, and path operations. History segments use `frontend/lib/history-archive.ts` and rely on local writable storage.
3. `frontend/app/api/history/safeguards/route.ts` scans `/data/sach-history` and writes pregame and official-final protected checkpoints to the filesystem. `frontend/lib/protected-history.ts` uses a filesystem-based outbox and replication to cloud storage.
4. `frontend/scripts/recover-and-start.mjs` boots Railway's standalone Node server, checks mounted persistent disk, and spawns backup scripts. It cannot run as a Workers request process.
5. Existing local smoke tests have no production provider credentials and only prove HTTP 200, not correct real odds/projections, grading, database writes, backups or cost.
6. Measured prior Railway RAM approx 4.7 GB average / approx 12 GB peak; Workers limit 128 MB memory/isolate. Computational workloads must be measured separately and possibly remain on other compute.
7. `vinext` is beta as of this assessment. Do not treat scanner result as full operational proof.

## Recommended safe architecture
- Cloudflare Worker (possibly paid): dashboard UI and inexpensive short-lived read/API requests.
- Supabase: shared active prediction metadata and current seven-day history after read/write migration and verification.
- Verified Google Drive archives: retain backups with checksums and recovery tests. Consider Cloudflare R2 only after measuring cost and proving safe migration.
- Dedicated scheduler/compute job: immutable pregame checkpointing; data-provider fetch and model computation; grading and finals; periodic snapshots; Drive backup. Could be Cloudflare Cron/Queues *only if* resource profiling fits Worker limits; otherwise retain one slim external compute worker.
- Stop Railway only when both scheduled jobs and history/archive integrity pass in a parallel run. Do not disrupt My Money HQ.

## Go/no-go gates
1. Deploy disposable staging Worker with no write permissions to production.
2. Display real data, probabilities, forecasts and all required markets on NBA/NFL/NHL/CFB/CBB; validate expected outputs.
3. Execute a full scheduled capture + grade cycle with real provider data in staging; record CPU, memory, wall time, requests, errors.
4. Replace all local writable /data operations with durable, idempotent atomic or transactional storage; protect same-day and pregame snapshots.
5. Prove seven-day history restoration and verified Google Drive backup/archive by comparing counts/checksums and recovering a sample.
6. Run Railway and Cloudflare side by side without duplicate provider charges, conflicting writers, or double grading.
7. Calculate total Cloudflare Workers+storage+Supabase+scheduled compute+provider/backup cost and verify within owner's budget.
8. Only then cut production traffic over and decommission Railway after observing stability.

## Current status
No Cloudflare deployment, data migration, production write, billing plan change or Railway shutdown has been performed.
