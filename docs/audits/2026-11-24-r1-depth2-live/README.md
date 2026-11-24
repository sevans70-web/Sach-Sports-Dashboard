# R1 live acceptance — uploaded, then rolled back

**R1 is not complete.** The exact approved artifact was uploaded once. Live verification confirmed the statistics loading improvement, but NBA supporting history and fresh NFL model forecasts did not meet mandatory acceptance. The compatible fallback was activated when those failures were confirmed. No second upload or model change was attempted.

## Release and safety

| Event | Evidence |
|---|---|
| Artifact / pinned package | `R1-2026-11-23-b8d05e3-c8428f1ae381` / `d6b249decdb4b19049efb20c42c9ec0b70d604dc` |
| Manual build | `b7b20f61-a27e-4bac-b439-b97146005e8f`, successful |
| Candidate deployment | `9831ba89-9c17-48e8-a6b7-4eed4e44e7bc` at **10:24:44 AM Toronto, November24** |
| Candidate version | `ca4880bf-58b0-4dd3-a613-0c4736320d73` |
| Original commands restored | **10:25:27 AM Toronto**, immediately after observed completion; separate readback matches both originals |
| Rollback deployment | `72ab06fe-229a-4ece-a5d8-96eb1da50f6e` at **10:39:20 AM Toronto** |
| Active compatible fallback | `a48c431a-5c3e-4491-8529-38cb20dfa898`,100% |

The exact authorized depth-two fetch supplied the missing source commit. Original ancestry and archive/bundle checks passed twice in Cloudflare. Bundle digest remains `c8428f1ae3815140ff3ca117bceca7c13cf230ac7a22721590e5e13761067597`; archive SHA256 remains `1d6f37445e1fcee881908e713c64d85a24f46a58c7ccf34decfeec26d2600e62`. Prebuilt upload7,586.51KiB gzip; startup84ms. No dashboard compilation, guard removal, credential transfer, new infrastructure or paid service.

Automatic-build include remained only `__cw08_manual_release_only__` throughout. Existing bindings, schedules, credentials and model formulas were unchanged. After rollback, actual alarm/cron logs show `[dashboard-release-hold]`. Desktop/mobile fallback NBA/NFL/NHL pages and schedule APIs return200 with no page errors. CW08 remains deployment39ea465b/version46e95f99 and its15-minute schedule; successful existing-version alarms were observed without accessing research tables.

## Confirmed live improvement

These are **actual production Chromium and Cloudflare observations**, with TLS checks enabled, real clocks and no response replay.

- First statistics HTTP request after cold initialization: **1.675s** server wall time, HTTP200. Browser shell0.655s. This is a cold API timing, not a claimed end-to-end cold Month measurement.
- After the page became interactive, NBA Month/Yesterday/Today/Week/Season controls rendered in **0.147–0.379s**, including repeated Month0.245s. Original production repeated Month failure was47.194s; environments/measurement types are disclosed rather than presented as an identical benchmark.
- All **15 sport/period API checks** reconciled returned W/L/push/void/pending/hit-rate and direction totals; max observed3.559s. Archive coverage was explicitly **partial**, so this is not certification of every historical archive record.
- Actual automatic refresh succeeded; the checked timestamp advanced. Professional-sport main/featured statistics used the combined request. Native capture/grade invalidation revisions advanced independently. The full post-grade UI reconciliation was not completed before rollback.
- Whole active-window telemetry:1,866`ok` outcomes and12`canceled` outcomes during navigation; no exception/exceeded-memory/exceeded-request-limit outcome groups. Maximum observed CPU5,130ms, wall22,963ms across request/alarm work. This is a short release-window observation, not a heap measurement or90-minute soak.

An initial audit clicked Month before hydration and saw **no Month request**. Its timeout is retained as an invalid audit attempt, not a production latency failure. Repeating after the initial statistics render produced the timings above; the threshold was not relaxed.

## Actual ranking and featured coverage

| Market | Observed cards / qualification |
|---|---|
| NBA Points, Rebounds, Assists, Threes, PRA, PR, PA | **25 each** in warmed actual mobile sessions; projections/EV labels visible. Desktop initial Assists5 recovered to25 in later API/mobile observations. Positive and negative EV values were observed; prior formula/zero-value evidence was reused without manufacturing a live zero. |
| NFL Today, all17tabs |0cards; **November24 has no NFL games**. This is a date scope, not proof of a blocked OWL props feed. |
| NFL Thursday November26 |Passing6; passingTD6; interceptions5; QB rush6; pass+rush6; anytimeTD75; firstTD74; receiving37; receptions37; rushing10; rush+receiving10; sacks4; tackles0; tackles+assists0; Q1pass/receive/rush0. **These are quote cards, not qualified independent forecasts.** |
| NHL current Shots / Points |8 /8 |
| NHL Assists / Goals |0displayed predictions; validation holds remain explicit. Their underlying quote/watch rows must not be counted as betting predictions. |
| NHL Blocks / Saves |0; incomplete/absent verified current market inputs are explained. Saves feed had0parsed current quotes. No forced counts. |

NFL’s existing primary OWL feed returned current quotes (e.g.11passing /82receiving offers); existing supplemental401 remained explicit. Thursday passing and receiving coverage reports **zero fitted projections / zero independently supported EV**, with `recent_official_history_unavailable`. For example JaredGoff line280.5 appears as **NO PICK**, null projection and unavailable independent probability. No new source investigation, credential rotation or substitute forecast was attempted.

Desktop verified the future NFL date. Today’s all17tabs were also checked on mobile. A future-mobile recorder compared six correctly rendered Nov26cards against a late prefetched **Nov24** API response; it keyed only by market. That comparison is invalid and is **not** a verified all17future-mobile pass or a confirmed application mismatch. Future audit capture must key by sport/market/day. No release decision was based on this audit error.

Featured endpoints returned two NBA, two upcoming NFL and four NHL populated categories with different players. This verifies availability/identity separation, not independent model accuracy or complete qualification of every category. NFL FirstTD choices remain book-based. Summaries/schedules for all three sports returned200; observed full schedule-window counts12NBA/15NFL/15NHL matched those API lists. These are window counts, not the number of today’s quoted fixtures.

## Mandatory functional failure: NBA supporting history

Actual top and bottom Points cards were expanded, with requests allowed to finish:

- Player4065648 history endpoint: HTTP200,`success:true`,`supported:true`, **points:[]**.
- Player4066354 history endpoint: the same empty result.
- Both say **“No verified game-by-game history was returned.”** The UI displays **0 of10games with recorded stats**, while projections/EV remain present.

No fake chart values or historical statistics were inserted. These observations prove the required display-history recovery is incomplete; they do **not** establish a new provider root cause. The ranking input versus history-display path needs a targeted comparison using the already validated stored evidence. Repeating earlier provider investigations or another production release is not the next step.

Fresh independent NFL forecasts/EV also remain unavailable despite quote visibility. These mandatory gaps caused withdrawal. Other legitimate NHL validation/quote holds remain open and must not be “fixed” by enabling the frozen CW08 model or fabricating picks.

## Capture, grading and protected records

Rollback ended the planned90-minute acceptance window early, as required by the functional failure. **16/38 capture markets** completed:10NBA and6NHL. No NFL native capture run was observed before rollback. **1/3 grading rotations** completed (NHL); NBA/NFL rotations are not certified. Native phases checkpointed and advanced; max measured206/220operations and4source concurrency. No observed retry starvation or350-limit error in this shortened window. Original jobs/cursors/evidence were retained, not reset.

| Dataset | Before | After | Original-row inventory unchanged |
|---|---:|---:|---|
| History documents |11615|11615|yes|
| Original receipts |6116|6368|yes|
| Saved picks |1478|1616|yes|
| Grades |1269|1305|yes|
| **Total** |**20478**|**20904**|**all20478old full-row hashes match**|

Legitimate additions: **252original quotes +138saved picks +36official-final grades =426records**. Every new receipt/pick predates game start; no future quote timestamps. All36new grades match original pick checksum, side and line, and cite official-final boxscore evidence. Originals/old grades were not overwritten.

**31 of the original204pending predictions** were graded:16hits/15misses. Five additional grades settle the previous attempt’s newly captured NHL picks (3hits/2misses). **173 of the original204remain:**56NBA,114NFL,3NHL. Their remaining gradability is not inferred from this shortened window; no unavailable result was invented.

The previously verified20,478-record recovery chain remains available and was reused. The new426records remain safely in production; **this task did not export them into that backup** or claim the backup now contains20,904. Any later release preflight must account for their recovery point through the existing incremental mechanism, without a repeat full export.

## Decision and smallest next work

**NO-GO for R1 completion; no further deployment approved in this task.** CW09/CW11/V62 remain open and no whole repair row moves to Completed. The proven Git-fetch correction and live statistics improvement are retained as evidence, not claims of an accepted release.

Before another candidate: repair/verify the NBA history-display route against the same legitimate inputs supporting current projections; establish which complete authorized NFL historical inputs can support forecasts while retaining explicit unsupported Q1/event holds. Reuse the provider and model investigations already completed. Then complete current initialization, all38capture/all3grading rotations, remaining authentic grading, full archive/freshness reconciliation and actual desktop/mobile acceptance under a separately approved release.

See machine-readable proofs and actual screenshots. Raw protected rows, full API history datasets and private restore files remain outside Git. No full suite, historical import, provider-access experiment or backup export was repeated.
