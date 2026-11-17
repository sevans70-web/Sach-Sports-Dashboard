# R1 durable NBA recovery — controlled release awaiting approval

**GO for a controlled deployment approval request. Nothing uploaded; R1 is not production-complete.** This replaces the withdrawn earlier R1 packages; their approvals do not authorize this new artifact.

## Frozen identity

- Artifact: `R1-2026-11-17-4c23239-6173e391`.
- Application source: `4c2323988f00aa955ef6f345d0a6270f0fc0b61f`, descendant of `6d98710`.
- Worker: `sach-sports-cloudflare-test` only.
- Bundle/config/assets SHA256: `6173e39163b64964c07591a9b93f94c4282a71df8abfc694af85e8edfeb97aca`, 425 files.
- `candidate.tar.gz` SHA256: `47fb603427002383ccfa99e39d4d90a48a20369c04b51c82d1bc0ccba18fa153`.
- Active compatible fallback deployment: `4699c3c4-5067-4347-b3b7-9d205fee5085`; select version `a48c431a-5c3e-4491-8529-38cb20dfa898` at 100% for rollback.

## Scope and readiness evidence

Includes the verified NBA redirect/cache/PR memory/EV repairs, stored-evidence-first recovery and complete validated durable NBA source inputs; NFL 17-tab visibility and capture/checkpoint recovery; NHL loading/identity/ranking recovery; bounded independent capture/grading. No model, probability formula, calibration, featured qualification or original-record rewrite.

The only new application repair in this preparation removes the permanent 64-fixture NBA cutoff. Actual current inputs discovered 65 fixtures and the old cutoff withheld three otherwise supported Points players. Foreground now admits at most 128 distinct NBA source lookups (at most 256 durable-read/HTTP subrequests), leaving 94 of 350 for other work. Background collects the full discovery set through existing 220-request reservations, four-source concurrency, deadlines and resumable checkpoints. College behavior is unchanged. Unavailable inputs are reported honestly.

48 selected checks passed, zero failures; one intentionally skipped withdrawn-baseline diagnostic. Final compiled shipping tests include cold summary/redirect/auth/errors/timeouts, NFL cold capture/checkpoints, NHL evidence handling, fallback/restart and all-sport official grading. Resource tests cover foreground/background isolation, cancellation, retry limits and concurrent combination forecasts. Durable recovery preserves 5,382 real observations and seven-market projection/probability/EV parity. A deliberately stricter 30-request job budget advances through four phases and survives restart. TypeScript has zero diagnostics; production build and upload-free dry-run pass. Upload gzip is 7,573.14 KiB, below the existing 10 MiB module allowance; no plan change. This does not measure live production peak memory.

115 legitimate public ESPN requests returned HTTP 200: 50 player logs and 65 complete recent fixtures. Snapshot finished November 17 at 5:04:46 PM Toronto. Final compiled forecasts support all 25 captured public rows in each of seven NBA markets, without changing selection rules. This is the public displayed cohort, not the whole unfiltered sportsbook pool. Captured-data workerd replay is not production egress verification. Desktop/mobile-size browser replays cover NBA7/NFL17/NHL6, featured/history and retained PR cards after forced 503, without hydration errors. None is a live production candidate pass.

Evidence: `docs/audits/2026-11-17-r1-durable-release/README.md`, checksummed raw current responses, before/after reports and complete logs. Prior 844-test regression evidence is reused for unchanged paths, not presented as a new full-suite run.

## Bindings, backup and schedule safeguards

Keep existing SQLite namespace `fc70a55e49c84d28bacc562a8d5cfb62`, KV `644df6a469e84dba90c8f7dac410f895`, assets and secret binding names/values. Existing SQLite schema initialization adds `nba_history_versions` and `nba_history_checks`; no new namespace or migration. NBA source evidence is persisted only by fenced background jobs; foreground reads only. No historical data import is proposed.

Compatibility `2026-11-06`, `nodejs_compat`, Worker 350/job 220 requests, source concurrency 4. Existing schedules: capture `*/2 * * * *`, grade `0,30 * * * *`, archive `10-17 9 * * *`. Automatic builds stay paused with branch include `__cw08_manual_release_only__`.

The verified November 16 backup remains in the existing Drive folder `1q0FpKWUxzvGq7KM7bc6ov1hkXjTgaFYe`: manifest `1Gl1quPVMBo5ELLFKBIAuQEOkHqqQRKZf`, SHA256 `80765c6ba9187d4c5c0f639889a72c04ec9cbfa14fd55e1d28f49585afd31a6b`, 20,466 records/132 parts/three data objects. Metadata availability and original sizes rechecked; prior authenticated checksum/isolated-restore evidence reused, no new export/import. Never replace later records with this older recovery point.

CW08 remains deployment `39ea465b-ca3f-47f8-9bd2-50eb2f1ad174`, version `46e95f99-98f2-4abe-a2b2-0ff24b4f8e4b`, cron `*/15 * * * *`. Do not deploy it, modify bindings or access its research tables.

## Activation, only after explicit approval

1. Recheck this archive/fingerprint, source ancestry, backup/fallback availability, exact bindings and schedules, paused builds and protected-record inventories. Refresh actual current quotes and evidence health; abort on a critical mismatch. Prices captured during rehearsal are not current release-time odds.
2. Pin the existing authenticated manual build environment to the Git commit containing this package. Fetch source ancestry, install pinned dependencies, run `node scripts/prepare-r1-durable-release.mjs --prepare-only` in `frontend`. It extracts the approved artifact; do not recompile it, enable public previews or transfer credentials. Keep automatic builds paused.
3. Verify preparation again immediately before `node scripts/deploy-cloudflare.mjs --tag r1-durable --message 'Approved R1 durable; source4c23239; fingerprint6173e391'`. Restore manual command settings afterward. No data import, credential changes or research Worker upload.

## Mandatory actual production acceptance and immediate fallback

- Actual desktop/mobile browser sessions: all NBA7 markets, valid signed/zero EV or precise missing reasons, featured/history; all NFL17 tabs/quarterbacks and honest unsupported forecasts; NHL6 tabs and legitimate supported Shots/Points/Assists/Saves coverage. Model/evidence holds remain holds. Cross-check API versus DOM, started-game preservation, hydration and refresh retention. Replays cannot satisfy this gate.
- Cold usable page target <=15 seconds, representative warm API p95 <=5 seconds; inspect actual memory, HTTP/compatibility errors, timeouts, source cooldowns and request counts. A slow upstream timeout test is safe failure evidence, not a loading-performance pass.
- Observe the entire 38-market capture rotation (about 38 minutes) and NBA/NFL/NHL grading rotation (up to 90 minutes), including independent progress, <=220 job/<350 Worker requests, safe retries and no duplicates/overwrites. Confirm durable NBA sources accumulate and recover after a cold restart. If legitimate games or grades are not available, leave the specific acceptance item open; do not fabricate it or declare completion.
- Compare every protected pre-upload record and later additions separately; preserve original receipt times/picks/grades. Verify CW08 status and paused builds remain unchanged.

On any critical failure immediately select the available fallback version above at 100%. Its `namespace-fallback.js` entry holds capture/grading alarms without deleting SQLite/KV, additive evidence tables or newly captured records. No database restore, schema deletion or fallback rebuild. Verify fallback browser/API/history and record the rollback deployment ID.

R1/CW11/V62 stay open until all actual production acceptance passes. Only then move fully verified tracker rows to 100% completed.

## Deferred, not release scope

Expanded sportsbook populations beyond the verified displayed cohort; a separately scoped NBA evidence-completeness dashboard; SportsGameOdds optional credential recovery; new NFL unsupported-quarter/first-touchdown models; NHL goals/assists model releases remain separate work. No new paid service or frozen CW08 tuning. If ESPN denies a cold request and neither valid cached rankings nor sufficiently fresh discovery exists, the correct result remains explicit unavailability. No preflight test can guarantee provider uptime; the controlled release must prove recovery from its actual production evidence before acceptance.
