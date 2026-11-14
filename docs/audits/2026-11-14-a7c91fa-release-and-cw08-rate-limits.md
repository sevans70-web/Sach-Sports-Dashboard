# Controlled dashboard release and CW08 rate-limit repair — November 14, 2026

## Dashboard release: failed browser gate, rolled back

The existing authenticated Cloudflare integration manually built the exact
approved source a7c91fac806cff156610d161a270ab3b43647ac5 on
cloudflare-compatibility-test. The local production build, configuration review,
prebuilt dry run and remote build passed. Existing dashboard bindings,
compatibility settings and limits were preserved. The prior CW06 version was
verified available before upload; the research Worker was excluded.

- Manual job: d14ea0db-2330-492b-94a1-fc474fb21a36.
- Attempted dashboard deployment: aacb2553-c2cc-4a8d-9967-c23d41735e31.
- Attempted version: 4248b257-444b-46b0-9a6b-0bc37c8615d8.
- Deployed at 1:16 PM EST; rolled back at 1:21 PM EST.
- Rollback deployment: 49e8c749-aa41-4ed1-b68d-4936a0a0835b.
- Restored version: 46f9dc62-01e2-407f-b1c3-845d10e613d9 (the approved CW06 code).

Live API checks matched NBA/NFL/NHL schedule counts to the exact displayed
current-slate fixtures: 14/14/19 games. Observed market subtotals reconciled, but
coverage was partial, and this was not a complete certification of all displayed
card counts. NBA points and PR returned available EV. NHL Today and Tomorrow
rankings returned HTTP 200. All 576 checked historical originals and all four
original featured player/price selections remained unchanged.

Browser verification then failed on NBA with React hydration error #418. The
approved rollback was performed before attempting further production fixes.
The failure was independently reproduced on the withdrawn version's preview
URL; the restored production version had no browser errors and rendered NBA EV,
First Basket, NFL quarter rankings and NHL rankings. Automatic builds stayed
paused throughout. **The recurring-count repair is not currently released.**

### Actual cause and corrected candidate

The new summary hook restored a warmed browser/session cache in its useState
initializer. The server rendered an empty initial summary, but the client's
initial tree contained the cached summary. Home-to-NBA navigation exposed the
mismatch. The hook now starts with the same empty state on server and client,
then restores the cache in useEffect after hydration. The retained snapshot's
original observation time is preserved for expiry rather than refreshed by
reading it from storage.

The regression test exercises initial server/client parity and post-effect
cache restoration for NBA, NFL and NHL. A real local browser navigated Home to
NBA using retained real API-response fixtures, populated the session cache and
rendered five EV metrics with no page errors. Those were controlled local checks,
not a claim that corrected code has been deployed. The corrected production
build and dry run also passed. A replacement source commit needs approval and
repeat live verification before this dashboard release can be accepted.

## CW08: request-handling repairs prepared, not activated

The original live Worker ignored Retry-After. Roster reads were repeated for
every cycle; four season histories were refetched when a later season failed,
because only completed histories were cached. Roster/history catches logged a
429 and advanced the cursor, bypassing the generic workflow retry. There was
no durable per-provider cooldown or common pacing across source requests.
The prior observed cycle recorded 15 roster and 24 history-source failures,
with 39 source_http_429 rejections.

The prepared research-only changes:

- Persist per-provider pacing and cooldown metadata in the existing SQLite DO.
  Every outbound request, including allowed official redirect hops, shares a
  minimum two-second interval per provider. No alternate IP/account/provider
  route is used to evade a limit.
- Respect valid numeric/date Retry-After in full. Missing/malformed headers use
  exponential cooldown starting at one minute, capped at 15 minutes. The cap
  never shortens a longer provider-specified wait.
- Propagate deferred source errors out of roster/history/grading catches. Keep
  the same active phase/cursor and schedule recovery at or after the cooldown;
  no request is sent prematurely, including after DO eviction.
- Add a bounded operational source_cache table: maximum 512 entries and 32 MiB
  of compressed serialized cache bodies. Cache valid public roster, standings
  and player-history payloads for at most 15 minutes, and schedules for at most
  60 seconds. Invalid or empty-roster payloads are not persisted in the cache.
- Preserve each actual retrieval timestamp. Reuse partial successful history
  reads after a later season is rate limited. Never label cached data as newly
  fetched and never cache authenticated odds, pregame fixture reads or finals.
- Expose provider cooldowns and source-deferral counts for operational review.

No frozen model, baseline, feature/probability function, validation protocol,
first-receipt identity rule, existing receipt, grade or evidence object changes.
Quote freshness, pregame safety buffer, finality/participant checks and absence
of invented missing results remain enforced. Production buildShadow checks the
frozen Git bytes before producing the separate research bundle.

### Validation

The workerd/SQLite integration imports and verifies all 339 original receipts,
then exercises real 429s in roster and partial history collection. It verifies
cursor retention, no early outbound retry, persisted cooldown/cache across
restart, reuse of three successful seasons after a fourth-season 429, immutable
first receipts, upload/grade acknowledgement-loss recovery, duplicate prevention,
official-final/participant grading, and the frozen enrollment cutoff. The
original four successful season reads plus one failed attempt result in five
history requests, not a complete repeated four-season download.

Local transport tests cover long Retry-After values, HTTP dates, exponential
fallback, provider isolation, redirect pacing, lease expiry, cache expiry,
original retrieval times and exclusion of odds/fixtures/finals/malformed data.
The test game time now stays relative to the test clock, preventing the old
fixed 18:30 fixture from expiring during test runs; production timing rules are
unchanged.

The full suite passes 744/744, strict TypeScript has zero diagnostics, and the
six focused transport/hydration/workflow checks pass. The standalone research
bundle and corrected dashboard production build/dry run pass. Final counts and
hashes are retained in the companion verification JSON.

### Approval and live status

The live research Worker is still version
08e854d6-fcdb-404a-9820-c156d1485d98 with its unchanged 15-minute cron. It was
not paused, redeployed, reimported or modified during this work. At the recorded
check it held 660 receipts, zero pending uploads/storage errors and 52 completed
cycles. Its latest completed cycle reported healthy HTTP collection, while
missing-history/identity rejections remained explicit. That temporary recovery
occurred on the original code, not because the prepared fix is active.

Activating the repair requires approval for a separate research Worker update.
The concrete scope is in
`frontend/shadow/cw08/rate-limit-deployment-plan.json`: replace only research
code, add the bounded operational cache table to the existing DO, and preserve
its namespace, KV, secret bindings, schedule and receipts. No plan upgrade,
resource creation, credential copying/rotation or model promotion is proposed.
Upstream availability and future official game results still limit completion
of CW08; transport mitigation does not establish calibration or release approval.


### Final operational update

A later read-only status check showed **660 receipts and 53 completed cycles**,
with zero pending uploads or storage errors. The newest cycle was again
**degraded**: 18 roster failures, 21 history-source failures, and 39 HTTP 429
rejections. The preceding healthy cycle was not a permanent recovery. The live
Worker is unchanged; no rate-limit repair has been activated. The proposed
request-policy cache also rejects malformed and empty-roster payloads from
cache persistence, and lease checks fence writes to provider gate metadata.
The final production research bundle is 151874 bytes with SHA256
c6a71a74051e42a9f6642944b6f9e247be3c4b3f74c96cd84319fb0dbb4959e4.
The corrected dashboard and research deployment are separately awaiting approval.
