# R1 — Stability and Existing-Ranking Recovery

**Development/rehearsal authorized. Upload not authorized. Rehearsal is blocked pending the complete backup/restore gate.** The completion tracker remains the source of truth; CW11/V62 remain open. No completed row is reopened or moved.

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

## Before any approval request

Use `node scripts/prepare-r1-release.mjs --prepare-only` or `--dry-run`; neither supports upload. Tests must use the extracted archive, not a subsequently rebuilt directory. See the audit README for exact commands and the distinction between synthetic faults, authentic recorded input and current production reads.

Required gate still open: locate the latest complete history AND pregame backup manifests, verify every part's bytes/checksum, restore into an isolated sink and compare full inventory/counts/checksums. Current daily archive success logs have `restored:null`, and do not establish this gate. Do not substitute old legacy archive segments, an empty sink, a successful job log or a unit fixture for the complete backup.

Confirm current bindings, fallback, fixed-cutoff inventories, fresh dashboard-bound OWL access, paused automatic-build filter and unchanged CW08 before requesting approval. Keep earlier withdrawn candidates quarantined.

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
