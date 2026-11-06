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

## Automated compatibility scan — passed (2026-11-06)
- GitHub Actions: https://github.com/sevans70-web/Sach-Sports-Dashboard/actions/runs/42147330846
- `npx --yes vinext@latest check` result: **100% compatible** (12 supported, 0 partial, 0 issues).
- Detected 42 pages, 5 layouts, 70 route handlers, 1 loading boundary, Next.js 16 proxy.
- 4/4 supported import groups and 2/2 supported config fields.
- **This is an API/syntax compatibility scan, not a successful Workers build or runtime smoke test.** The persistent Node scheduler, child processes, filesystem storage, 128MB isolate limit and archive backup migration still need separate testing and redesign.
- No Cloudflare deployment, production change, or paid subscription was performed by this check.

## Cloudflare build and local runtime check — 2026-11-05 evening
- Build workflow: https://github.com/sevans70-web/Sach-Sports-Dashboard/actions/runs/42147810782 — passed after removing Railway `output: "standalone"` from **test branch only**.
- `vinext init --platform=cloudflare --cdn-cache=none --data-cache=none --image-optimization=none --no-prerender` succeeded in isolated CI runner.
- `npm run build:vinext` completed successfully; no Cloudflare account or billing was used.
- First local preview attempts missed the port/IPv4 binding; corrected those in the test harness.
- Actual local workerd preview launched and served routes, but `/api/health`, `/`, `/nba`, `/nfl`, `/nhl`, `/cfb`, `/cbb` all returned HTTP 500.
- Response body: `Error: The Session method is not implemented` in Miniflare `core/entry.worker.js`. This is an unresolved local Worker runtime blocker, not evidence of successful page serving or necessarily an application-level bug.
- Diagnostic run: https://github.com/sevans70-web/Sach-Sports-Dashboard/actions/runs/42148934322 .
- Do not deploy or migrate until a real Worker preview returns 200 on health and sports routes. Investigate local Miniflare/cf compatibility and generate persistent safe Cloudflare config.
