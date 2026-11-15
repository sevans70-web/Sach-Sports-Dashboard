# Dashboard capture subrequest repair — awaiting approval

Scope: existing `sach-sports-cloudflare-test`, `cloudflare-compatibility-test`, application `frontend`. Verified implementation: bb2601b and a949453. Continues b577018; retains b2e9357 and 5982902. No dashboard upload, deployment, schedule change, secret change, research mutation, plan upgrade, R2 or Cloudflare Queues provisioning was performed.

## Confirmed cause

The existing two-minute cron awaited two rotating market builds and then recent official-FINAL replay in **one** invocation with a 350-subrequest allowance. Serial calls do not reset that allowance. NFL quarter enrichment can read two seasons for up to 75 players (150 player logs), then up to 64 distinct official game summaries. Ranking, cache and database calls add to this total. Its five-second foreground `Promise.race` does not cancel the underlying refresh, which could keep fetching during the following market/replay. Grouping two market names was not a reliable bound on network work.

Production telemetry preserved in the November 14 blocked-release audit confirms the 21:05:11 Toronto NFL Q1 passing/rushing failure, and earlier mixed NFL/NHL Shots on Goal failures. This is a per-invocation limit, not a quota shared by all foreground dashboard users. Previously missed pregame evidence cannot be reconstructed after the event.

## Implemented

- The cron now **only enqueues** its existing rotating markets and replay scope. The grading cron separately enqueues its existing sport. Frequencies, market rotation and supported sports are unchanged.
- One new dashboard-only SQLite Durable Object namespace contains nine independent logical lanes: capture, grading and replay for each of NBA/NFL/NHL. Each alarm handles one serial, persisted phase with a fresh invocation allowance. SQL leases fence overlapping alarms; deterministic tick IDs and pending-job coalescing prevent duplicate scheduling. Due-job fairness lets another market proceed during a retry.
- Each phase accounts for HTTP requests, manual redirect hops, KV operations and provider-coordination RPCs. It stops at a conservative **220 accounted subrequests**, reserving capacity to persist a final-request 429, and aborts unfinished work after 25 seconds. This retains the configured 350 limit and leaves 130 requests of platform headroom. Accounting is application instrumentation; production telemetry must confirm the margin after activation.
- A bounded operational cache stores only public official historical inputs, with 15-minute expiry, compressed-size limits and a 32 MiB/512-entry bound per lane. It allows an over-budget history build to make progress across eviction/restart. Authenticated odds/database reads, official grading responses and NHL gamecenter boxscores are not cached here. Historical ESPN summaries are reusable only during capture, not grading.
- Provider-origin cooldowns persist in separate coordinator objects in the same dashboard namespace. Retry-After is honored across dashboard background lanes; no provider limit is bypassed. Foreground fetch behavior remains outside job accounting/cooldowns.
- Capture builds bypass the shared foreground ranking response/pending cache. Provider transport pending reads are also scoped per job, so foreground requests cannot borrow a job-owned read that is subsequently cancelled; completed valid public response caches remain reusable. Quarter capture awaits its source refresh or defers the phase, rather than reserving a timeout fallback as the first pick. No coefficients, probability calculations, line/side rules or selection thresholds changed.
- Capture reserves exact, verified original quote/selection bytes and timestamps in SQLite before external writes, deduplicates exact market/game/player identities, and processes **all returned eligible rows**, without the old capture-only 75-row truncation. It writes originals and selections separately in chunks of 30, using insert-ignore and readback. No existing row is updated or deleted. Retries preserve reservations and existing first receipts after acknowledgement loss.
- A new delayed insert is rejected within 30 seconds of game time or later; already-stored pregame originals remain intact. Reservation time is never substituted for the database's actual receipt time. Expired/incomplete work is disclosed in the persistent phase ledger, not backfilled into legitimate pregame picks.
- Original grading uses stable 50-pick pages with a fixed creation cutoff, one official game per phase and 30-grade write/readback chunks. It no longer permanently stops at the first 250 picks/1,000 grades/two games. Missing/non-final participants never become invented zeroes. Unavailable games are recorded and later games still proceed; subsequent grading cycles retry unsettled records. Original grades remain insert-only; corrections stay separate.
- Recent replay verifies and checkpoints 150-document keyset pages, including sources larger than the former 900-document ceiling. It checks one official game per phase and preserves the existing separate correction store. Daily archive/backup code and its separate cron remain unchanged.
- Persistent phase events record failures, request-category usage, retries and completion independently of current job state. Status reads are bounded; completed job reservations and historical phase evidence are not evicted with the input cache.

Durable Object lanes were chosen over a new Queues product: they provide persisted cursors, scheduling, serialization and independent invocation budgets within the existing Worker infrastructure. Running capture and grading sequentially in the old cron would retain the defect. A new Worker, new cron or larger request limit is unnecessary.

## Verification

See the paired JSON audit and deployment plan for exact final checks, source revision and artifact digests. Tests cover over-budget continuation, cold restart, persisted 429 cooldowns, lease fencing, duplicate ticks, lost write acknowledgements, expired evidence, complete eligible NHL Shots/Points/Assists/Saves capture, pagination beyond 250 picks and 900 replay documents, and concurrent foreground/background cache isolation.

Synthetic runtime coverage uses 81 distinct eligible players plus invalid/duplicate input per NHL market; all 324 distinct selections are stored once. Those fixtures prove completeness/idempotence, **not** real production ranking counts. No synthetic fixture is sent to production.

A read-only local replay of the actual production bundle, recorded November 14 official schedule and original saved receipts restores started NHL selections through the real API and the new alarm handler. Its most recent SOG count is 11 as the recorded game starts cross the real clock; there are zero new eligible pregame captures in that replay. Source responses are replayed fixtures, not a live paid-feed validation. Local test controls are not part of the deployable bundle.

The CW08 research bundle remains exactly 151874 bytes, SHA-256 `c6a71a74051e42a9f6642944b6f9e247be3c4b3f74c96cd84319fb0dbb4959e4`. Its frozen model/protocol, Worker, namespaces, secrets and schedule are unchanged. A time-dependent CW08 test harness was corrected to allow the existing seeded games to be graded before asserting the first collection 429; no research runtime code changed.

## Controlled release and rollback

Cloudflare documents that rollback **cannot cross a Durable Object class lifecycle change**. Direct rollback from the new namespace to existing version `bdd010c7-ab1d-41a1-83fb-bcabab45b86f` would therefore be unsafe to promise, although that version remains retrievable before migration.

`scripts/prepare-dashboard-fallback.mjs` prepares a local compatible safety baseline from deployed dashboard source `f93184a2a421f75018c0262c7b820b5ce9d95b76`, retaining its foreground interface and adding only the new background infrastructure/context isolation. Its queue class, schema and bindings match the candidate. Both artifacts compile and pass prebuilt dry-run; neither has been uploaded. The final suite passes 764/764 tests with zero TypeScript diagnostics. Artifact digests cover generated configuration, runtime code and assets; build-path-dependent source maps are excluded.

After explicit approval:

1. Recheck target identity, paused builds, artifact hashes, unchanged secrets/KV/schedules and CW08 health. Stop on any unexpected difference.
2. Deploy the compatible safety baseline as a standalone infrastructure step. Verify its dashboard/API behavior, namespace and one scheduled cycle; record the new compatible version ID. Do not proceed if this gate fails.
3. Deploy the NHL candidate only after the compatible rollback version exists. Verify real browser hydration/navigation, schedules/counts, NHL markets and retained selections, all seven NBA EV markets, featured picks/history, and NBA/NFL regressions. Observe scheduled capture and grading/replay evidence with actual subrequest telemetry.
4. If candidate verification fails, restore the recorded compatible safety baseline version. Retain the namespace and all saved evidence. Never delete state to force a rollback. If the initial baseline fails, stop candidate rollout and restore the known dashboard source with the namespace export retained; this is a forward restoration rather than an impossible pre-migration version rollback.

Approval is the remaining activation requirement. Live collection/count/performance and rollback-version checks after migration cannot honestly be marked passed before deployment. The current live cron retains its old vulnerability until the approved infrastructure step is activated. Historical gaps remain gaps; this repair does not fabricate past evidence.
