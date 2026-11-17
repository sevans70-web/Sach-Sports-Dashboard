# Corrected R1 — controlled manual release awaiting approval

**No upload is authorized yet.** All preparation gates pass. Source/application commit `e65304c8f1bda7c5265494d417c31abbee3f7be8`; use the release-package Git commit containing this plan when starting the manual environment. No application code changed during freezing.

## Frozen identity

- Artifact ID: **`R1-2026-11-17-e65304c-832d9ab3`**.
- Worker: **`sach-sports-cloudflare-test`**.
- Archive `candidate.tar.gz`: SHA256 **`62fd7f9543cf1a54be9a8ba7e0cb3c5bebbf899f5b9e35e5813ad9593a3fa8a0`**.
- Tested bundle/config/assets fingerprint: **`832d9ab38287f57ca12d3caa7297249324c6fbe8c770fb8612022ad9620720e4`**,424files.
- Existing rollback deployment **`a43f9bf6-bdb6-4e45-a5b0-7d1b2881cfcb`**, serving version **`a48c431a-5c3e-4491-8529-38cb20dfa898`** at100%. Both are available through the authenticated integration.

This replaces the withdrawn November16 package. Never prepare or upload that earlier archive.

## Included repairs and reused verification

NBA: compatible manual redirect rejection, live-scoreboard/cache/schema safety, PR memory bounds, signed/zero EV across7markets, athlete/season-specific403 cooldowns and exact cached-evidence recovery. NFL: quote-backed17-tab visibility and bounded cold capture/checkpoint/restart. NHL: loading/current-season/exact-identity and retained-ranking recovery, with existing model validation holds. Independent capture/grading/replay lanes and all historical first-evidence safeguards remain included.

Reuse `docs/audits/2026-11-17-r1-nba-recovery`:844regression passed/0failed;19shipping-runtime plus2new NBA compiled checks passed;0TypeScript diagnostics; build passed. Fallback/withdrawn/corrected Points model partitions are identical; controlled denied-source comparison returns9/0/9 eligible rows with exact fallback/corrected probability/projection/EV parity. Real compiled route outage tests recover all7recorded NBA markets, with0history writes. These are local tests, not production acceptance.

New checks only: tested source hashes/output identity; reproducible archive/extraction;4package/CLI-safety checks; upload-free dry-run; read-only production binding/schedule/rollback/build-filter checks; verified backup availability and authenticated manifest checksum readback. No investigation, full suite, model fitting or application rebuild was repeated.

## Existing backup and configuration

The previously restored20,466-record recovery point remains available in the existing owned Drive folder `1q0FpKWUxzvGq7KM7bc6ov1hkXjTgaFYe`. Manifest `1Gl1quPVMBo5ELLFKBIAuQEOkHqqQRKZf`, SHA256 `80765c6ba9187d4c5c0f639889a72c04ec9cbfa14fd55e1d28f49585afd31a6b`, was downloaded and hash-verified again; all3data objects are available with their original sizes. Reuse the completed restore evidence; do not export or restore production again merely to repeat it. This is the November16 recovery checkpoint, not a claim that later receipts were added to that immutable backup. A rollback must preserve all post-checkpoint records in the existing namespace/database; never replace them with the older backup.

Bindings remain the existing SQLite `DASHBOARD_JOBS` namespace `fc70a55e49c84d28bacc562a8d5cfb62`, KV `644df6a469e84dba90c8f7dac410f895`, assets and unchanged secret bindings. Compatibility2026-11-06/nodejs_compat;350Worker subrequests,220job guard,4source concurrency. Capture every2minutes; grading every30minutes; existing daily archive unchanged. No namespace, migration, plan, credential or paid-service changes.

Automatic builds remain paused using branch include `__cw08_manual_release_only__`. CW08 retains deployment `39ea465b-ca3f-47f8-9bd2-50eb2f1ad174` /version `46e95f99-98f2-4abe-a2b2-0ff24b4f8e4b`; do not deploy, reconfigure or access its research tables.

## Approved activation procedure (only after approval)

1. Recheck pinned package/archive fingerprint, source ancestry, existing bindings/schedules, backup/rollback availability, record inventories and paused builds. Stop on a critical mismatch. Refresh live provider/eligibility evidence; distinguish an off-day/missing supported model from an application failure and never invent rows.
2. Use the existing authenticated Cloudflare manual environment, without requesting/copying tokens. Temporarily pin only its manual build/deploy commands to this package commit. Keep the branch exclusion unchanged. Fetch missing Git history before the ancestry check, install pinned dependencies, and run `node scripts/prepare-r1-corrected-release.mjs --prepare-only` in `frontend`. **No application compilation.**
3. Run the same preparation check again immediately before `node scripts/deploy-cloudflare.mjs --tag r1-corrected --message 'Approved corrected R1; source e65304c; fingerprint 832d9ab3'`. Deploy prebuilt bytes to the existing dashboard Worker only. Restore original manual commands after the attempt; leave automatic builds paused.

## Mandatory actual production acceptance

- Actual desktop/mobile-size browser: NBA7markets/EV/explanations/featured/history and stable summary; NFL17tabs/quarterbacks/available forecasts; NHL supported markets and truthful model/evidence holds. Check API/DOM counts, loading, hydration/console errors, saved started-game predictions and original timestamps. Recorded or mocked browser data cannot satisfy this gate.
- Cold usable page<=15s and representative warm API p95<=5s; inspect Worker HTTP/resource logs, bounded requests, provider cooldowns and absence of recurring stalls. If current legitimate data cannot establish a required acceptance case, leave it open.
- Observe the complete38-market capture rotation (about38minutes) and all3sports' grading rotation (up to90minutes). Verify per-sport progress/checkpoints, terminal states, actual usage<=220/<350, no retry starvation, first-receipt/duplicate prevention and genuine official-final evidence. Do not declare success after only an enqueue or a single cycle; never fabricate a grade to complete acceptance.
- Compare protected records at the pre-upload cutoff and new receipts separately. Confirm CW08 version/schedule/storage health remains unchanged and automatic builds remain paused.

## Immediate fallback and completion

Any critical availability, eligibility, compatibility, resource, starvation or integrity failure requires immediately selecting existing version `a48c431a-5c3e-4491-8529-38cb20dfa898` at100% through the authenticated Cloudflare integration. Its real entry is `namespace-fallback.js`; it holds capture/grading alarms while preserving the same SQLite/KV, secrets and every new receipt/grade. No production database restore/deletion or fallback recompilation. Record the new rollback deployment ID and verify browser/API/records/CW08.

Only after every actual production gate passes, commit evidence and move checklist rows whose full original acceptance requirements are met. R1/CW11/V62 remain open now. No deployment has occurred and no row is moved to100% completed during preparation.
