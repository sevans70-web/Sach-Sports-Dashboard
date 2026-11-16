# R1 — Stability and Existing-Ranking Recovery

**Latest outcome: approved release failed actual production NBA ranking acceptance and was rolled back. R1 is blocked, not complete.** Candidate deployment `f2f5c908-4d8a-420a-918d-6a0e02e0b2b9`; active compatible fallback deployment `a43f9bf6-bdb6-4e45-a5b0-7d1b2881cfcb`. See `docs/audits/2026-11-16-r1-live-rollback/README.md`. The pre-deployment plan below is retained as historical evidence; do not treat its earlier approval-readiness statements as permission to retry. The completion tracker remains the source of truth; CW11/V62 remain open. No completed row is reopened or moved.

## Frozen identity and included fixes

Source `2bf33d6f9bfc0a57aaa42b7346ebcce65422680a`; application repairs through `600bd5d22811ddf17be9684b0cab2a86ed22d7ed`. There are no application changes between these commits. New preparation/rehearsal tools do not modify this frozen application.

- Bundle/config/assets fingerprint: `d7714dc0cac2f05950a0eed9b7bd7a9aebd82893465c25635f4dbe8907f4f71b`, 424 files.
- Archive SHA-256: `f6bf43437e726879c89cf1ef274d061d0e0736d2e918e8cd1410b92c426f9b54` (13,200,854 bytes).
- Worker: `sach-sports-cloudflare-test`; compatibility `2026-11-06`, `nodejs_compat`, 350 subrequests.
- Existing SQLite namespace `fc70a55e49c84d28bacc562a8d5cfb62`; KV `644df6a469e84dba90c8f7dac410f895`. No migrations, namespaces, credential changes or paid services.

1. NBA official-source manual redirects with explicit rejection, eight-second/caller abort, live-scoreboard cache exclusion and malformed-scoreboard rejection. Preserve PR memory bounds and signed/zero EV across seven markets.
2. Existing quote-backed NFL visibility across 17 tabs. Missing/unvalidated EV or forecasts cannot erase supported rankings; never invent a supported Q1/first-touchdown forecast.
3. NHL current-season history, exact player/fixture matching, bounded loading/refresh and retained started-game evidence. Existing Goals/Assists/Blocks validation safeguards remain unchanged.
4. Independent capture/grading/replay SQLite lanes; four concurrent sources, reservations, 220-request job guard, durable checkpoints/cooldowns, cancellation/draining, bounded stalled retries and insert-only lost-ACK recovery.

No frozen research model, protocol, historical pick, selection or grade is rewritten. No nflverse production adoption, provider switch, additional subscription or dashboard redesign.

## Verified current backup

The existing folder `1q0FpKWUxzvGq7KM7bc6ov1hkXjTgaFYe` remains the destination and is owned by `sachsportsplatform@gmail.com`. Explicitly authorized current export and authenticated Drive readback/isolated restore passed for all20,466records:11615history,6109originals,1473picks,1269grades. Full source counts and ordered row fingerprints remained unchanged through November16 11:07:38AM Toronto. All11615history payload SHA256 checksums also match; duplicate insertion is rejected.

The immutable completion manifest is `1Gl1quPVMBo5ELLFKBIAuQEOkHqqQRKZf`, SHA256 `80765c6ba9187d4c5c0f639889a72c04ec9cbfa14fd55e1d28f49585afd31a6b`. Three data objects hold132unique internal parts; no previous backup, production row, credential, sharing grant or CW08 table was changed/accessed. See `docs/audits/2026-11-16-r1-current-recovery-complete/README.md`. This supersedes the earlier missing-access/current-coverage blocker; it does not claim production dashboard acceptance.

## Before any approval request

Use `node scripts/prepare-r1-release.mjs --prepare-only` or `--dry-run`; neither supports upload. Tests must use the extracted archive, not a subsequently rebuilt directory. See the audit README for exact commands and the distinction between synthetic faults, authentic recorded input and current production reads.

The complete current-backup/restore gate is passed by the real four-table Drive round trip above. The earlier832-regression/19-compiled-check rehearsal remains tied to this exact frozen artifact;22focused backup/artifact checks pass after the offline verifier's source-order correction. No application/model rebuild or code change was introduced into the candidate.

Separate deployment approval is still required. Immediately before an approved upload, recheck artifact/config identity, existing bindings/schedules, compatible fallback availability, source inventories/new receipts, dashboard-bound provider access and paused builds. Authentication evidence is timestamped and is not a perpetual availability guarantee. Stop on any failed critical preflight; keep earlier withdrawn candidates quarantined.

## Controlled acceptance after separate approval

1. Recheck exact artifact and compatible fallback, then upload only these bytes with the existing bindings. No build-trigger changes or application recompilation during activation.
2. Actual production Chromium browser with TLS verification, desktop and mobile-size viewport: NBA7, NFL17, NHL6; API/DOM equality for legitimately eligible cards and picks; schedules, saved started-game rows, featured choices, history, signed/zero EV and truthful unavailable reasons. Recorded replay does not satisfy this step.
3. Cold usable page <=15 seconds; representative warm API p95 <=5 seconds; no hydration errors, recurring stalls, memory/CPU failures or hard subrequest exhaustion. Measure real routes and log timestamps rather than subtracting replay times.
4. Observe all 38 capture markets through a full approximately 38-minute rotation, and NBA/NHL/NFL grading through up to 90 minutes. Inspect independent cursors, source checkpoints, final-grade readbacks, attempts and actual per-phase usage <=220/<350. A genuine missing market/final must remain explicitly open; never manufacture a pick or outcome to pass.
5. Compare protected history/original/pick/grade inventories at a fixed cutoff and new receipts separately; zero duplicate identities or overwritten evidence. Verify CW08's unchanged deployment/schedule and ongoing storage health.

## Immediate rollback

Current deployment `4e8f8721-6e0a-4836-b877-9446a0f360d0` serves compatible fallback version `a48c431a-5c3e-4491-8529-38cb20dfa898`. Read-only Cloudflare API confirms it remains available. Its verified archive fingerprint is `86cb44524b36382a75fb7c2cf10d5909237c4292c0ede5d847b117b83d93289f`.

On any critical availability, compatibility, integrity, resource or starvation failure, select that existing version at 100% through the authenticated Cloudflare integration. Change Worker traffic/code only; preserve the same SQLite namespace, KV, secrets and all newly captured evidence. Fallback's real entry is `namespace-fallback.js`: it holds capture/grading triggers and alarms while retaining recoverable state. Never substitute its underlying `index.js` in a rollback rehearsal. Recheck real browser/API/history and CW08; retain failure evidence, do not automatically retry a different candidate.

The local candidate -> fallback -> candidate rehearsal uses the same persisted SQLite/KV state and authentic recorded NFL input; it proves local compatibility and receipt recovery, not production traffic switching. A hold-alarm delivery is not artificially fired against a historical clock; production fallback remains unchanged.

## Completion

Request deployment approval only after every preapproval gate passes. R1 is complete only after approved production browser/resource and scheduled acceptance, backup/restore/fallback verification and preserved evidence. Parent checklist items close only when all their original acceptance requirements pass; no blanket closure of CW07/CW08/CW10/CW11/CW14.
