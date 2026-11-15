# NFL denied-source and NBA PR memory repair — November 15, 2026

This is a candidate repair, not a deployment or a completed live acceptance gate. Continue from 82c443b on cloudflare-compatibility-test. Both previously withdrawn candidate archives remain quarantined.

## Confirmed production evidence

Cloudflare spans from the withdrawn deployment identify HTTP 403 on these public, unauthenticated ESPN endpoints:

- `https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/4429096/gamelog` (and other athlete IDs; the application adds `season=2026`).
- `https://site.web.api.espn.com/apis/search/v2` (application parameters include `sport=football`, player query and limit).

See nfl-403-observability.json. These requests do not use the sportsbook or database credentials. Anonymous requests from the development environment returned 200 (public-probes.json); that does not prove access from Cloudflare. The confirmed cause is rejection of the public web endpoints from the Worker. ESPN's internal restriction/rejection rationale is not disclosed by the captured traces. Expired private credentials are not involved in these public reads. No access-control workaround or unapproved alternate feed is introduced.

The NBA PR browser request's trace `fcf16e0e3a667881a3241d5b5065eee3` recorded outcome **exceededMemory**, wall time about 38,975 ms and **Worker exceeded memory limit**. Its 503 originated from the Cloudflare runtime, rather than a caught model exception. The same trace contains denied basketball gamelog requests. See nba-memory-observability.json. A killed isolate cannot execute the route's catch/fallback.

## Implemented changes

- Optional NFL history/search denial no longer globally aborts a capture phase. The existing dashboard Durable Object stores a one-hour endpoint-family denial circuit, honoring a longer Retry-After. Already queued requests recheck it before HTTP. Recreated jobs reuse the circuit; it is not counted as a successful history checkpoint. Successful cached source evidence remains reusable with its original observation time. Storage failures fail closed.
- Apply the same narrowly scoped history-only policy to confirmed NBA gamelog denials. Schedule, credentials, database-write, 429 and other transient failure handling is not softened. Source families are sport-specific; NBA and NFL foreground source admission queues are separate. Existing six capture/grading sport lanes and resumable phases are retained.
- Public official history transport uses an honest application user agent, bounded concurrency, timeouts and a byte-bounded success cache. A denied endpoint is never retried on an alternate host. There is no proxy, credential copying or provider-limit bypass.
- Denied/missing current NFL history explicitly withholds the affected fresh forecast, confidence and EV. Valid sportsbook rankings remain browsable, including the 17 recovered NFL tabs. Frozen originals are preserved. New quote-only receipts record the unavailable-forecast reason; they do not create a betting selection.
- Serialize heavy NBA rankings and forecast construction with bounded admission queues. The request deadline aborts scoped source work; a timed-out caller does not release its memory slot until underlying work settles. The old unowned 45-second build race is removed. Background refresh uses the same admission gate.
- Precompute the existing exact NBA combination histories at build time using the existing function and frozen models. Clear the previous decoded partition before decoding the next. No model coefficients, probability calibration, sportsbook contracts or selection rules are changed. PR decoded inputs fall from 15,728,174 to 8,070,655 bytes; PRA from 23,590,158 to 8,197,751. These are decoded input sizes, not total isolate heap measurements.
- Bound disposable basketball refresh and source caches by bytes and entries. Retain the official summary fields consumed by model observation parsing, rather than unrelated articles, videos and play-by-play. Complete two-team feature census remains intact.
- NBA transient HTTP retry is capped at one, honors short Retry-After and does not retry authorization denials or prematurely retry long cooldowns. Existing successful client boards remain visible on refresh failure. Retained responses now explicitly identify their observation time and potentially stale prices; unavailable responses include diagnostic reason and Retry-After. Historical saved-board fallback and calendar boundaries remain protected.

## Verification and its limits

Full-suite totals and release identity are recorded in verification.json and the separate frozen release manifest. The repository tests include actual workerd/SQLite recovery with a 350-subrequest ceiling, 100 cold denied NFL histories limited to four HTTP attempts, a real Durable Object restart, quote-only immutable storage, zero fabricated picks and independent NHL progress. Existing interrupted-capture, grading, duplicates, provider cooldown and foreground-concurrency checks pass.

The workerd NBA test runs seven concurrent cold market forecast requests with the shipped historical snapshot, offline and with no live writes. It tests default workerd memory behaviour; it is not a measurement of production peak heap. Seven-market probability/EV parity checks use the actual frozen model and history. The prebuilt PR history is compared exactly with the previous component sum. Signed positive, negative and zero EV rendering remains covered.

Compiled-browser replay uses recorded real November 15 API data with a frozen decision clock, not current production results. All 17 NFL tabs pass; quarterback categories show 16 recorded players. NBA replay counts: Points 23, Rebounds 23, Assists 22, Threes 25, PRA 17, PA 17, PR 20. A forced PR 503 retains all 20 cards and visibly labels stale data. NHL replay counts: Shots 25, Points 25, Assists 0 (existing validation hold visibly explained), Saves 7 eligible. No browser page errors. These counts are evidence of eligibility handling, not required production quotas. Browser results and source observations are stored separately.

Read-only Cloudflare checks confirm the dashboard remains on fallback deployment 6e6fab80-41c8-433c-bcf9-79a2e4dd5aee / version a48c431a-5c3e-4491-8529-38cb20dfa898. The version is available for rollback. Automatic build inclusion remains `__cw08_manual_release_only__`; no build trigger, schedule, secret, binding or production record was changed. CW08 remains on its existing */15 schedule, healthy with 889 receipts, 658 grades and no pending uploads at the recorded check. Its research bundle remains exactly 151,874 bytes, SHA-256 c6a71a74051e42a9f6642944b6f9e247be3c4b3f74c96cd84319fb0dbb4959e4.

## Remaining requirements

A new explicit approval is required before uploading the separate frozen dashboard candidate. Production cold-source, browser, latency/memory and scheduled-job gates must then pass; any critical failure requires the verified compatible fallback. Do not mark the repair 100% complete before those live gates.

Public ESPN access is not guaranteed by this repair. During rejection, fresh forecasts requiring the missing history remain unavailable; quote-only capture is not a model prediction. Obtaining authorized reliable historical access remains a data-availability requirement, not a justification for invented probabilities. CW08's frozen model, protocol, receipts and separate Worker must remain untouched.
