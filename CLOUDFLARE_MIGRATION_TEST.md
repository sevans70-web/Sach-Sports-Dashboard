# Cloudflare compatibility test — Sach Sports

This is an isolated migration experiment. Production remains on `nextjs-migration` and Railway; Money HQ remains separate.

## Verified code dependencies (2026-11-05)
- Next.js 16 App Router application in `frontend/`; Railway builds standalone Node output.
- `frontend/instrumentation.ts`: persistent `setInterval` and `setTimeout` scheduling; five active sports NFL/NBA/CFB/NHL/CBB.
- `frontend/scripts/recover-and-start.mjs`: Node child processes, local HTTP recovery server and a persistent `/data` volume.
- `frontend/scripts/backup-to-drive.mjs`: local file enumeration, streams, Google OAuth and MD5 verification.
- `frontend/app/api/history/capture/route.ts`: writes historical snapshots to the local volume; schedules deferred grading.
- `frontend/app/api/history/safeguards/route.ts`: polls official results and protects snapshots.
- Railway environment variables include Supabase and data-provider credentials; never copy secrets into Git.

## Required before deployment
1. From `frontend/` run `npx vinext check` and record compatibility findings. Official guide: https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/
2. Configure a separate vinext/Cloudflare build in this test branch only. Do not replace production Next.js scripts.
3. Separate read-only UI/routes from background captures, model computation, backup/retention and any other Node-specific APIs that cannot fit Workers.
4. Replace local `/data` writes with durable verified storage. Preserve 7-day live history and pregame frozen picks; archive older data with checksum-backed backup before deletion.
5. Move `setInterval` tasks to scheduled jobs with idempotency locks and independent CPU duration/memory measurements.
6. Prepare test-only Cloudflare bindings/secrets; no production keys in repository and no write access to production database for first smoke tests.
7. Verify NBA/NFL/NHL/CFB/CBB pages, live and saved picks, odds, grading, history, backups and latency against Railway.
8. Benchmark Worker CPU/requests/memory and external data-provider fees; confirm affordable monthly spending before routing users to Cloudflare.

## Safety
- No automatic deployment of this branch to Railway production.
- No changes to My Money HQ Worker or its D1 database.
- No paid plan changes, data deletion or infrastructure shutdown until the independent deployment passes functional and archive verification.
