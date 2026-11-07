# Sach Sports — Cloudflare staging configuration audit
Date: 2026-11-06
Purpose: Make this an explicit, ordered setup. Do not ask owner to search for settings never configured.

## Evidence
Read Railway production service `marvelous-wholeness` variable NAMES ONLY (no values copied), `frontend/lib/owls-provider.ts`, `frontend/lib/sgo-supplement.ts`, `frontend/scripts/history-cloud.mjs`, `frontend/lib/drive-history-reader.ts`, `frontend/instrumentation.ts` and Cloudflare `frontend/cloudflare.config.ts`. GitHub live read-only probes: https://github.com/sevans70-web/Sach-Sports-Dashboard/actions/runs/42322490245

### Already configured
- Cloudflare Worker `sach-sports-cloudflare-test`, built successfully from branch `cloudflare-compatibility-test`.
- Cloudflare GitHub integration and separate deployment token.
- KV binding `VINEXT_KV_CACHE` added to the code; this is a cache binding, NOT an odds API key.
- No provider, Supabase, or Google Drive runtime secret was supplied to Cloudflare. This is expected; setup has not been done, so don't ask owner to check an empty list.

### Railway environment variable inventory (NAMES ONLY)
`OWLS_INSIGHT_API_KEY`, `SPORTSGAMEODDS_API_KEY`, `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SECRET_KEY`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `BACKUP_DRIVE_FOLDER_ID`; two Railway-specific flags `RAILPACK_DISABLE_CACHES`, `NO_CACHE`.

## Phased setup and safety gates
1. Public read-only sports predictions: configure **runtime** secrets `OWLS_INSIGHT_API_KEY` and `SPORTSGAMEODDS_API_KEY` on the **Sach Sports test Worker** in Cloudflare Settings -> Variables and Secrets, not under Build variables. Copy values securely from Railway source without putting any in chat, GitHub, docs or screenshots. Validate calls to NFL/NBA/NHL/CFB/CBB and actual projections. Provider subscription and quotas unchanged, avoid parallel heavy polling.
2. `SUPABASE_URL` and `SUPABASE_KEY` may be required for history reads. Do NOT copy powerful `SUPABASE_SECRET_KEY` or a service-role credential yet: the current app has write paths and staging must not overwrite production history. Determine whether `SUPABASE_KEY` is safe/anon and only enable read paths after verifying access rules. If a read-only Supabase role is needed, create dedicated scope before exposing history endpoints.
3. Existing local /data history writes, snapshots, protected outbox, grading, and Google Drive backups are incompatible with Workers local filesystem. Design a durable shared storage strategy and replacement scheduler (Cloudflare scheduled or separate minimal compute job) first.
4. Configure Google OAuth and backup folder secrets **only after** replacing/testing archive and checksum restoration in staging. Do not expose Google service-account JSON or refresh token unnecessarily.
5. Performance and billing tests and 7-day history restoration gates before traffic cutover / Railway shutdown.

Cloudflare docs: build variables are not runtime secrets; use Worker Settings -> Variables and Secrets (Secret type). The Worker's `nodejs_compat` and 2026-11-06 compatibility date allow access to runtime secrets through `process.env`.

## Runtime secrets diagnostic update — November 7, 2026
- Public API probes diagnosed `worker_secret_missing` for OWLS-based NFL/CBB feeds despite keys being entered in Cloudflare UI.
- Cloudflare's official docs permit `cloudflare:workers` env bindings and `process.env` under nodejs compatibility. Test branch now directly reads `cloudflare:workers` binding values for OWLS and SportsGameOdds, falling back to process.env. Never prints secret values.
- Verify real staging HTTP responses after Worker deployment; do not confuse 200 with meaningful predicted rows.

## November 7 binding verification
- Read-only staging API tests continued to classify OWLS as `worker_secret_missing` even after direct `cloudflare:workers` import.
- Typed config now explicitly declares `OWLS_INSIGHT_API_KEY: bindings.secret()` and `SPORTSGAMEODDS_API_KEY: bindings.secret()`; the build + local smoke checks passed. Live Worker must be deployed and probed again before success can be asserted.

## Retest after Cloudflare build variable type correction
- On November 7 user changed the two entries in Cloudflare settings from Variable to Secret.
- Retest deployment after that edit. A Worker deploy requires runtime secrets, which may not be the same as build-time settings. Confirm actual Worker binding before calling it fixed.
