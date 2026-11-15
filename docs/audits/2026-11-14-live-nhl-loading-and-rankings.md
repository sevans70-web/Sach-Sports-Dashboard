# Live NHL slow loading and disappearing rankings — November 14, 2026

Repairs are implemented, tested and pushed in `b2e9357` on `cloudflare-compatibility-test`. **No dashboard or research Worker deployment occurred.** Production remains dashboard deployment `dcad8c9c-ca52-4578-887c-1a6f4a0659b0`, version `bdd010c7-ab1d-41a1-83fb-bcabab45b86f`. Automatic builds remain paused.

## What actually happened live

A real Chromium visit to the production NHL dashboard reproduced **three Shots on Goal ranking cards**. The API returned 25 candidate rows: 17 had `pregame_only` blockers after their games started; only three surviving rows had complete saved selections/EV. Most of those 25 were newly selected statistical-baseline leaders, not the full saved pregame board.

Read-only Cloudflare telemetry showed repeated ranking cancellations, including the frontend's 45-second request deadline; an explicit Goals API request received no body within 65 seconds. One filtered two-hour event sample contained 122 ranking request events: 78 canceled, 44 HTTP200, maximum recorded wall time 64,909ms. The sample includes our diagnostic traffic; it is not a representative latency percentile. HTML and schedule responses were often fast, while ranking and optional featured hydration requests stalled. This reproduced intermittent application-data loading, not a claim that every page request is slow.

The code held stale ranking refreshes in module-global pending promises while launching background work without attaching it to the Worker lifetime. An abandoned/stuck promise could then be joined by later callers without its own deadline. Official history refreshes also applied an eight-second timeout separately to every four-player batch, allowing a cold wider pool to wait many times that limit. Only priced upcoming players need that work. Tests reproduce and verify recovery from unresolved builds; exact live JavaScript await-stack traces were not available, so post-deployment timing still needs verification.

A **separate** confirmed defect is the production dashboard capture cron's shared subrequest budget. All 160 sampled subrequest-limit error logs grouped to four `*/2 * * * *` invocations, not foreground NHL HTTP requests. Capture reports specifically show NFL Q1 receiving followed by NHL Shots failing at 22:56 UTC (`Too many subrequests`) and 23:34 UTC (`rankings_http_503`). That can leave fewer original pregame receipts to recover later. The scheduler and its shared 350-subrequest budget were not changed in this repair; no NFL cadence or source behavior was weakened to give NHL more requests. This remaining execution-budget problem must not be described as fixed.

## Verified official and sportsbook coverage

An authenticated **read-only** Cloudflare manual job `504b8098-652e-46ac-82e9-d987c693b389` ran the committed `nhl-readonly-probe.mjs`. Its command installed dependencies and executed GET-only diagnostics; it contained no Worker upload/deploy command, no model execution, no database writes and no secret output. Normal dashboard build commands were restored immediately after job creation; paused branch filters were retained throughout.

At **8:34 PM Toronto time November 14**:

- Official NHL score feed: HTTP200, **14 November 14 games**.
- Every one of the slate's **28 team roster requests**: HTTP200, nonempty official rosters.
- Primary sportsbook feed: HTTP200. Normalized fresh quotes matched against today's official fixtures/current rosters: **SOG114, Points141, Goals220, Assists132, Blocks10, Saves15**. These are quote counts, not qualifying picks or necessarily unique players.
- The primary normalized SOG universe was119 quotes;114 matched current rosters and today's fixtures. Thus the three-card display was not explained by only three book offers.
- No dashboard `provider unavailable` events were returned in the inspected recent telemetry window. The probe's official reads were paced at least two seconds apart and showed no429. This does not rule out earlier/transient upstream failures; CW08 research rate limits were not assumed to be dashboard rate limits.

The dashboard's existing current-plus-next schedule scope is distinct from the official single-date14-game slate. This repair does not alter schedule selection, relabel scopes or fabricate extra games.

## Saved-pick loss and repair

Read-only production database queries found November14 immutable model-selection receipts: **SOG11, Points6, Assists15, Saves11; Goals0, Blocks0**. Quote-only originals also existed (SOG39, Points34, Goals119, Assists53, Blocks5, Saves18); they do not establish valid missing model probabilities.

Previously, any started fixture caused the new baseline pool to be cut to25 before evidence recovery. Recovery then queried only those player IDs. Genuine saved selections outside that newly generated pool could never return, even though they were still intact in immutable storage.

The repair reads exact started-game/market receipts **before** applying public limits, verifies original checksum, fixture/player/market, pregame timestamps and price evidence, and restores the saved projection/selection/probabilities unchanged. It does not fit a new started-game forecast or convert a live quote into a historical prediction. Unknown or unverifiable originals remain unavailable. Complete evidence-backed cards are selected before the existing25-card display cap; there is no minimum count or side quota.

Against the retained actual production responses and official fixture snapshot, replay produced:

| Market | Eligible cards before | After exact original recovery |
| --- | ---: | ---: |
| Shots on Goal | 3 | 8 |
| Points | 4 | 5 |
| Assists | 11 | 14 |
| Goalie Saves | 4 | 11 |
| Blocks | 0 | 0 |

These are **local replay results using real records**, not deployed live counts. The comparison preserves the timestamp of each original response. SQL-returned timestamps/numerics were represented in their REST-equivalent types for the replay; original stored payloads/checksums were not changed. At the retained SOG snapshot, eight of the eleven saved picks belonged to already-started games; the remaining three were future fixtures, not missing started-game originals. Five eligible saved players outside the original25 were recovered. A Chromium run of the candidate UI with the recorded real evidence rendered all eight cards, with no page/hydration errors. It did not generate replacement forecasts or write to production.

## Other implemented safeguards

- NHL ranking refreshes now attach to the Next/Worker `after()` lifetime. NHL build waits expire after25seconds, and abandoned pending entries are replaced rather than joined indefinitely. Successful bounded stale reuse still ends at tipoff/calendar boundaries. NBA/NFL response policies remain unchanged.
- Upcoming exact-priced NHL cards share **one eight-second** history-refresh budget with concurrency four. Frozen/unpriced players do not create unnecessary refresh fan-out. Failed/unstarted refresh evidence is explicit and withheld, not silently treated as current. `offlineOnly` correctly avoids this NHL network step.
- Official NHL player game-log bodies cache for15minutes. NHL waits on old provider promises are bounded, and late old reads cannot replace a newer cached result. Live boxscores retain their existing short freshness policy. Authenticated odds are not cached by the public transport.
- Optional NHL first-goal hydration can use at most1.5seconds of foreground time before continuing under the request lifetime, so already-saved featured selections need not wait for it. Featured qualification/original-selection rules are unchanged.
- Saved-evidence read failures return an explicit unavailable response rather than publishing a falsely empty replacement board. Valid started-game originals can survive a partial current-roster outage; unverified upcoming players remain withheld. Model/coverage reasons are visible in NHL rankings, and quote diagnostics are recomputed after restoration.

Goals' existing calibration safeguard remains active. Blocked Shots has no fitted runtime model in the inspected release. Neither was supplied invented EV/probabilities, a forced OVER or a new unvalidated model. The existing prior-season baseline census is unchanged; this work is not new model/population certification.

## Validation and isolation

**752/752 regression tests passed**, zero failed/skipped; **zero TypeScript diagnostics**. Final production compile and prebuilt deployment dry run passed, with **no upload**. Added tests cover lost saved players beyond top25, immutable fields, wrong/corrupt fixtures, cumulative history deadlines, no unpriced/frozen history requests, concurrency, stale refresh ownership and recovery from unresolved pending work. Existing NBA signed/zero EV, NFL, schedules, featured picks and historical-record suites passed.

CW08's research deployment remains **39ea465b-ca3f-47f8-9bd2-50eb2f1ad174**, version **46e95f99-98f2-4abe-a2b2-0ff24b4f8e4b**. The rebuilt research Worker is byte-for-byte identical: **151,874 bytes**, SHA-256 `c6a71a74051e42a9f6642944b6f9e247be3c4b3f74c96cd84319fb0dbb4959e4`. Its frozen model/protocol, source files, KV/DO/cron, credentials and receipts were not modified. Read-only status showed707 receipts,94 official-final grades,80 completed cycles, zero pending uploads and no storage error. Its ongoing automation was left running.

## Remaining requirements

1. Obtain dashboard deployment approval, then perform controlled live checks and rollback if those checks fail. No live performance-improvement or repair-completion claim is made before that deployment.
2. Repair the shared dashboard capture invocation budget without dropping other sports' capture coverage or increasing Cloudflare limits as a substitute for bounded work.
3. Continue the separate frozen CW08 study; it remains the gate for any goals/assists model change. Blocks still needs an independently fitted/validated model before predictions/EV can be supplied.
4. Historical pregame forecasts/prices never captured cannot be reconstructed from later odds or final results. All existing originals remain preserved.

The adjacent JSON includes exact source measurements, market probes and verification summaries. Local screenshots, sanitized telemetry summaries, actual response/receipt fixtures, read-only probe output, replay and build/test logs are retained under `/workspace/work/nhl-live-repair/`. No credential values or requester/IP logs were committed.
