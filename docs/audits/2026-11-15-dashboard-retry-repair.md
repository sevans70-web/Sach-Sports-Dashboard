# Dashboard capture retry-starvation repair — awaiting deployment approval

Code: `f4f5d2dd62cdfd0c495f16a8566661277d9c3d81` on `cloudflare-compatibility-test`.
No Worker was uploaded or deployed during this repair. Existing history, queued reservations, production models, sportsbook rules and CW08 were not changed.

## Confirmed cause

The NFL rankings route starts up to 150 player enrichments concurrently. The previous budget wrapper charged provider-gate RPCs before admitting HTTP requests and had no connection/body concurrency bound. In a cold 180-input reproduction, each of three attempts consumed 180 provider RPCs plus 40 HTTP requests, hit the 220-request guard and aborted all in-flight bodies. Each attempt saved **zero** sources. Retrying restarted identical work. Increasing the guard would merely move the failure toward Cloudflare's 350-subrequest limit.

## Implemented repair

- Admit at most **four** background fetches, including response-body consumption. Reserve three subrequests **before** the provider RPC: its check, HTTP and a possible durable 429 cooldown update. Every redirect is separately metered. The phase guard stays 220; Worker configuration stays 350.
- A capacity pause rejects queued work but lets admitted bodies complete and checkpoint in existing SQLite. Retry only remaining inputs, coalesce duplicate public requests, and reuse completed inputs after object eviction. Identity searches briefly cache genuine source responses; historical public-source caching remains bounded. Authenticated odds/private responses are never cached as historical inputs.
- Keep request slots through body completion or cancellation. Apply per-request 10-second and phase 25-second deadlines. Abort unfinished HTTP/body reads and fence late continuations, including provider RPC completions, from launching new HTTP or writing checkpoints. No new cancellation RPC interface was assumed; provider RPC handlers perform only bounded synchronous SQLite operations.
- Preserve real 404/410 statuses briefly; do not turn 429, transient errors or invalid JSON into empty player histories. Persist provider cooldowns with reserved capacity and respect Retry-After.
- Record cumulative input checkpoints, bytes, cursor/phase progress, stalled attempts and retry time. Budget pauses with saved inputs retry after one second. Three attempts without progress flag `needsAttention` and back off at least 15 minutes. Provider failures cannot be guaranteed to make progress; they now remain explicit and isolated.
- Retain separate `capture`, `grade` and `replay` Durable Objects for each sport, persistent cursors, immutable reservations and insert-ignore/readback writes. No namespace or schema migration is needed. Existing rankings/model population limits and qualification rules remain unchanged.

## Verification

**781/781 regression tests passed**, no skips; TypeScript has **zero diagnostics**. Production compilation and frozen-artifact deployment dry run passed.

- Pure cold-source reproduction: 108 inputs checkpoint on attempt one, all 180 on attempt two (previously zero on every attempt).
- Actual workerd/SQLite test: 107 of 180 checkpoint before pause; after disposing/recreating the runtime, all 180 complete without refetching saved inputs. Peak source concurrency four, reservations at most 12, phase accounting never above 220. Foreground traffic succeeds while the cold NFL batch is in flight. NBA and NHL complete while NFL is deferred; another NFL market and independent grading can proceed during an upstream failure.
- Cancellation tests: body timeout, phase deadline, late provider RPC, queued cancellation, streaming database response, duplicate input coalescing, redirects, 429 at a three-request budget edge and persistent cooldown recovery.
- Immutable capture: all 81 eligible synthetic selections in each of Shots, Points, Assists and Saves stored once (324 total); duplicates/unverified rows rejected. Lost acknowledgements/restarts preserve original checksums. Grading covers 271 picks without changing 1,001 unrelated grades.
- Compiled production bundle replay of recorded November 14 official schedule and saved records, with missing fresh feed coverage and concurrent capture: retained **11 Shots, 5 Points, 14 Assists, 11 Saves**, local responses **26–214 ms**. These are recorded-data replay results, not current live counts or production latency. All replayed games had started, so background capture correctly reserved **zero new pregame selections**. No real database writes were allowed.
- The workerd test configuration uses 350 subrequests and asserts application accounting and admission limits. Local emulation does **not** certify live Cloudflare quota enforcement; scheduled production telemetry remains a release gate.

Machine-readable results and log hashes: [validation](2026-11-15-dashboard-retry-validation.json), [check output](2026-11-15-dashboard-retry-checks.txt). Infrastructure checks: [snapshot](2026-11-15-dashboard-retry-infrastructure.json).

## Production protection and release plan

Current dashboard deployment remains `1eae6b6f-78f4-4ad6-8f25-f43e6053465a`. Compatible fallback version `a48c431a-5c3e-4491-8529-38cb20dfa898` is available and its exact archived output passes verification. It deliberately holds dashboard capture/grading/replay while retaining namespace `fc70a55e49c84d28bacc562a8d5cfb62`, pending state and evidence. Restoring it after a failed candidate must retain the same namespace/KV and all newly saved records. The withdrawn candidate `a5375cd8-b10b-497f-8355-08e48357cbad` remains blocked; the older pre-namespace version is not the rollback target.

Dashboard automatic builds remain paused by the existing branch filter. CW08's separate research deployment remains `39ea465b-ca3f-47f8-9bd2-50eb2f1ad174`, its 15-minute schedule unchanged. The read-only status check showed 884 receipts, 658 grades, 133 completed cycles, no pending uploads/storage error. Its locally compiled 151,874-byte bundle matches the unchanged approved SHA256. No frozen research parameters were tuned.

The replacement prebuilt candidate and checksums are frozen in [manifest](../../frontend/releases/dashboard-retry-2026-11-15/manifest.json). Bundle digest: `47a06ce00cc11f54577557071c365f49feb6fb2ffa21405faf44daf831f7d99f`. The preparation command supports only preparation/dry-run and rejects upload. No new resources, paid services, bindings, secrets or schedule changes are proposed.

[Controlled release plan](2026-11-15-dashboard-retry-release-plan.json): recheck commit/digest, fallback, bindings, paused builds and original evidence fingerprints; obtain fresh user approval; manually upload this exact artifact; observe real scheduled NFL/NBA/NHL checkpoint progress and concurrent browser/API behavior. Check current NHL market coverage, all seven NBA EV markets, schedules/counts, featured picks, history and unchanged CW08. Roll back immediately to the compatible held version if a critical gate fails, preserving all evidence.

**Ready for an approved controlled deployment; not a completed production repair.** Live scheduled recovery, browser verification and production counts/performance remain unverified until that deployment is approved and passes its gates.
