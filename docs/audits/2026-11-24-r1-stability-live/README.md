# R1 stability — one upload succeeded; live acceptance failed; rolled back

**R1 remains blocked. No second attempt, model promotion or completion claim.**

- Authorized artifact `R1-STABILITY-2026-11-24-e35c9d7-84829ff137af`, pinned package `1e75ca85ddaa8bbf4d59f9868458b7b40e24f457`.
- Build `a8f71e45-9dc7-4044-8cf5-0e86bbb21022` completed successfully using the documented depth2 fetch, detached checkout and frozen restore. No dashboard recompilation or artifact edits.
- Deployment **`36457d68-1761-4458-a505-9c5146c4e0fd`**, version `2c1c328b-3c01-4d06-b718-9a3d7070f9c1`.
- Activated November24 **20:07:47Toronto** (`2026-11-25T01:07:47.906505Z`). Critical failure caused rollback at **20:09:28Toronto** (`01:09:28.833866Z`).
- Rollback deployment **`898ed02c-a21d-4d1f-85fd-59a416de8df8`**, approved compatible version **`a48c431a-5c3e-4491-8529-38cb20dfa898`**, verified100% traffic.

## Preflight and protected history — passed

Fresh read-only production census is exactly the verified recovery baseline:11,615history documents/6,368original receipts/1,616saved picks/1,305grades = **20,904records**. All four canonical ordered row-hash inventories match the backup before and after the attempt. The initial history comparison used the wrong sorting order; repeating with the original `sport,game_date,stream` ordering matches exactly. This was an audit-query difference, not data mutation. No full rows or new backups were exported; no historical import/restore/deletion occurred.

Existing recovery-manifest availability and local complete-manifest/delta SHA256 verified; prior remote readback/isolated restore reused. Frozen archive/bundle431files and812source inputs match; approved checksums verified both locally and inside the authenticated manual build. Startup47ms; same bindings/namespace/KV/350limit/schedules/secrets. No tokens copied/exposed.

Only the two authorized manual-trigger commands were temporarily changed. Both original commands were restored as soon as terminal build success was observed and verified by readback, before acceptance continued. Automatic filter remains only `__cw08_manual_release_only__`, never the working branch. [Final control readback](final-controls.json).

## Critical actual browser failure

Actual desktop Chromium, real clocks, TLS checks enabled, no replay/mocks/response substitution. NBA Points rendered **zero ranking cards** and the explicit text:

> The original pregame ranking board is unavailable. No current predictions can be verified from this response.

The actual HTTP200 [payload](candidate-nba-points-unavailable.json) has `boardFrozen:true`, `boardDay:2026-11-24`, `boardUnavailable:true`, `boardCapturedAt:null`, `rows:[]`, `verifiedQuoteCount:0`, `modelSelectionCount:0`, `source:"No pregame board was recorded"`. API200 is not a usable ranking pass. The desktop audit stopped at Points, so the other six NBA markets, current EV/featured/supporting-history depth, and complete candidate NFL/NHL mobile/desktop acceptance are **not passed**. No page/hydration exceptions occurred in that limited candidate session.

**This rollback was not caused by NFL/NHL model-validation holds.** All legitimate P01/count-model/unsupported-market holds were retained and did not independently trigger it. The actual ranking/evidence-availability requirement failed.

**Important distinction:** after rollback, the approved fallback also returns this same currently unavailable NBA Points board, confirmed in actual desktop and mobile sessions. We did **not** observe25working current fallback Points rankings in this attempt. Therefore this evidence does not establish a candidate-only NBA regression, nor another probability/EV failure. It establishes a current-slate/original-pregame-evidence availability blocker. Missing original pregame forecasts cannot be retroactively manufactured after games begin.

Cloudflare also logged one actual403 on the official NBA `statistics/byathlete` discovery endpoint during a PA capture phase. The precise endpoint and timestamp are in [runtime messages](runtime-messages.json). That is evidence of a denied discovery request; it does not, by itself, prove why the saved-board lookup is empty or that all official history paths fail. No provider retry, alternate identity, subscription change, credential rotation or bypass was attempted.

## Statistics — useful partial pass, not complete acceptance

Actual desktop browser shell2.132s. First timed Month change2.195s; subsequent Yesterday/Month/Today/Week/Season requests0.225/0.445/0.298/0.232/0.802s, covering all five periods. Selected-record outcome/direction counts and category totals reconcile against their actual response records. Month742selected records; Season767. Partial archive coverage remains disclosed. These are timed period transitions after the initial view, **not a fresh complete cold-load measurement**.

Automatic-refresh observation started before rollback and ended afterward; no successful refresh was observed. Its assertion failure is retained, but cannot be attributed exclusively to the withdrawn candidate after the Worker changed. Automatic refresh is **not verified**, not silently passed or declared conclusively broken by that confounded audit. Full source/archive/old-grade reconciliation is still open.

The candidate reported `performance_protected_history_unavailable` while retaining valid cached statistics; actual source freshness/complete protected aggregation remains an acceptance requirement. No missing predictions or grades were invented to fill statistics. [Browser statistics proof](statistics-browser-proof.json).

## Scheduled work and runtime — window stopped on the critical failure

Read-only decoded SQLite job evidence shows two actual candidate-window NBA capture jobs (`pts_asts`/`rebs_asts`) traversed their phases and ended `done`, with **eligible0/stored0/picksStored0**. Their terminal phase consumed2of220operations; PA ranking phase20of220/max4sources and a bounded discovery403denial. Completion alone is not evidence of source/forecast/capture coverage or initialization success. No protected table inventory changed.

No candidate-window NFL/NHL capture or grading completion is demonstrated by the recorded recent jobs. We stopped the90minute rotation on critical failure, as required; **38capturemarkets/three grading rotations, current operational initialization, archive reconciliation and173olderpending authentic grades remain unverified/open**. We did not keep a failed release live to manufacture a rotation pass, run another deployment or manually write operational/pick records.

First DO audit used `json_extract(data,...)` against gzip/base64 operational fields and correctly returned an audit-only malformedJSON error. Read-only plain-field query plus local decode obtained [job evidence](capture-grading-proof.json). That query mistake is not a Worker crash or production data corruption.

[Short-window resources](resources.json):84`ok`/one`canceled` sampled outcome entries, maxCPU3,589ms/maxwall15,926ms; no observed exception/exceeded-memory/exceeded-request-limit outcome group. This is approximately101seconds, not a full soak or direct heap measurement. No claim that resource acceptance or all background work passed.

## Fallback verification and additional observed limitation

After rollback, actual desktop/mobile page shells and schedule endpoints return200 for NBA/NFL/NHL. Observed active-scope schedules contain12/15/15games, respectively; these are **not asserted to be Today-only counts**. No browser page exceptions in these fallback checks. NBA Points remains genuinely unavailable in both views.

Additional fallback NHL read: desktop API initially returned200/eight source rows; mobile API then returned503 with the exact runtime error:

> This promise was created by a request that has since ended, so it can never settle. With the handle_cross_request_promise_resolution compatibility flag, a promise can only settle in the request that created it, and settling it after that request ends is dropped.

This is a confirmed **fallback** cross-request promise-lifetime problem, not evidence that the frozen NHL model or CW08 changed. Do not call the fallback fully healthy or its NHL rankings fully verified. No retry or compatibility-flag workaround was attempted. Screenshots explicitly show fallback, not candidate acceptance.

CW08's separate deployment39ea465b/version46e95f99 and15minutecron remain unchanged; no research tables queried or modified. Its configuration verification is not relabeled a new collector-cycle health audit.

## Decision and next step

**NO-GO for R1 completion or another upload of this candidate.** One authorized attempt is consumed; artifact is withdrawn by this result. Frozen package bytes are preserved as historical evidence. No deployment approval requested here.

Next work should isolate the **actual current-slate/original-board boundary and honest zero-eligible capture handling** using these exact payloads/job clocks, and reproduce the fallback NHL cross-request promise ownership error. Prove legitimate current pregame data can populate the upcoming slate before kickoff and that missing historical boards remain explicit; do not invent late historical calls, waive freshness or restart the earlier probability/provider investigations. Retain NBA history/EV/performance/NFL pipeline fixes and P01separation.

Before any newly approved release, require a fresh exact candidate demonstrating that production-observed path, then the outstanding actual acceptance listed above. TrackerR1/CW09/CW11/V62 remain open/blocked. No items moved to Completed because this attempt did not fully verify an outstanding repair.
