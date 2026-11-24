# R1 actual production acceptance — rolled back, not complete

The user authorized one upload of `R1-2026-11-23-eb7bcf7-db22520f39e6` at 9:18 PM Toronto on November 23. The exact artifact was uploaded once. **A confirmed repeated-load performance failure triggered the approved compatible fallback. R1, CW09, CW11 and V62 remain open. No items were moved to Completed.**

## Deployment and rollback

| Event | Actual result |
| --- | --- |
| Frozen package | `3fb7882`, source `eb7bcf7`; bundle `db22520f39e641c29b93e26664b957836a2ec3ff334541b396d3a229bebc0cd2` |
| Archive SHA256, rechecked after rollback | `3dba5cdc277e920367bc0585d30fe980a703b69b51bf8f5a6ac517ec0a445c7e` |
| Production deployment | `f446e3b5-204f-4604-b3c5-151d5d877b16` at **9:33:12 PM Toronto** |
| Candidate version | `d5abc7e2-f119-4cad-9245-58e19ab9ad1a` |
| Rollback deployment | `d86b1e4d-6b43-4b47-b44e-4fbdd5330b08` at **9:43:33 PM Toronto** |
| Restored active version, 100% | `a48c431a-5c3e-4491-8529-38cb20dfa898` |
| Executable upload / startup reported by Cloudflare | 7,580.78 KiB compressed / 38 ms |

Existing bindings, namespace, schedules and credentials were preserved. The manual environment initially stopped **before upload** because its shallow checkout lacked source commit `eb7bcf7`. Fetching the exact pinned package commit with depth two supplied its immediate parent; the unchanged ancestry and digest checks then passed. The second manual build restored the frozen output and performed the sole production upload. There was no dashboard rebuild or artifact overlay. Temporary manual commands were restored; the automatic-build branch filter remains only `__cw08_manual_release_only__`.

## Critical failure and exact boundary

Actual NBA Prediction Dashboard Month became visible in **47.194 seconds after an earlier successful Month API read**. Initial Month/Season API reads took **52.932 / 60.144 seconds**. NFL Month/Season took 42.064 / 34.256 seconds; NHL took 36.245 / 30.997 seconds. The repeated NBA UI load fails the agreed cold-usable-page <=15s / representative warm-API p95 <=5s targets. It was not classified as a passing warm view because the figures eventually appeared.

This is a statistics loading/aggregation path, **not another demonstrated NBA odds/history-access failure or a proven memory-exhaustion crash**. The shipping `performanceView()` Cloudflare branch directly calls `readSavedPerformance()` on every request and bypasses the local cached-view path. Long periods combine bounded cloud/protected reads and recent-first Drive archive work. Live readback remained explicitly partial; the successful local rehearsal used an unavailable Drive contract and therefore did not exercise this live archive fan-out. Real archive response time was a material gap in that evidence. No frozen safeguards were relaxed.

Runtime telemetry sampled successful requests, including history requests consuming about 8.4s CPU and 56.8s wall time. No Worker exception, exceeded-memory or exceeded-CPU outcome / HTTP 5xx was returned by the bounded critical-outcome queries during acceptance. This does **not** prove production peak heap usage. The loading gate failed independently of a runtime crash.

**Next smallest repair:** cache the derived professional-sport performance views using existing infrastructure, coalesce concurrent main/featured reads, and move bounded archive completion away from every interactive refresh. Invalidate/update from genuine new saved/graded evidence; keep partial coverage/freshness explicit. Preserve the original tables, hashes and grade semantics. Verify this against the real archive workload, both cold and repeated loads, before another artifact or deployment request. No such repair or second upload was attempted in this release task.

## Actual browser and calculation results before rollback

These were actual production Chromium sessions, with TLS verification enabled, real clocks and real sources. Desktop/mobile viewport tests did not use recorded response substitution. The resumed filesystem sandbox could not use Chromium's existing trust database; an approved unsandboxed browser invocation using the **existing** trust store worked. No TLS-ignore flags, new certificates, credential copies or provider bypasses were used.

| NBA November24 pregame market | Desktop cards | Mobile cards |
| --- | ---: | ---: |
| Points | 12 | 12 |
| Rebounds | 12 | 12 |
| Assists | 11 | 11 |
| Threes | 10 | 10 |
| PRA | 11 | 11 |
| PR | 12 | 12 |
| PA | 11 | 11 |

All **79 displayed cards** were checked, including lower rankings. **76 available EVs** independently match original probabilities, player/game/quote identity, full-game market, line and side price: **49 positive / 27 negative**. Three cards accurately explain unavailable EV because projection equals line and no direction is displayed. There were no exact-zero EVs in this live sample; existing zero-EV regression evidence was reused, not relabeled as a live example. Existing fitted/research validation flags were retained; no model/calibration/probability/EV formula changed.

The first Today-only NBA harness correctly encountered zero cards but incorrectly assumed that every selected date must have cards. Today had `boardFrozen:true`, `boardUnavailable:true`, and `source:"No pregame board was recorded"`; missing pregame selections after tipoff were not recreated. A second harness exposed late Today responses overwriting Tomorrow data in **its own** market-only response map. Keying the verification by the requested slate fixed that harness, with no Worker changes. The final desktop/mobile results above use the actual November24 pregame slate and correct response identity. Neither harness problem is reported as a newly repaired application defect.

The actual next-slate Points response recovered history for all13 requested players from permitted official team schedules/summaries while athlete-discovery access remained denied; no schedule failure/source-budget exhaustion was reported. One role hold left12 rankings. Its source evidence included real current FINALs and retained seed observations. This is real provider recovery evidence, not a new import. Supporting recent-form UI showed unavailable results during the exploratory expansion; a complete supporting-history acceptance pass was **not** certified.

All17 NFL tabs rendered desktop/mobile with no hydration/page errors, but **zero eligible current cards** were returned. The passing response reported12 parsed provider quotes and zero verified matched ranking rows. Populated QB/projection/featured acceptance was **not passed** merely because empty tabs rendered. Fresh eligible NFL population remains a separate acceptance requirement; no forecasts or odds were invented. Existing optional supplemental authorization401 remains explicit.

NHL desktop/mobile counts: **Shots9 / Points9 / Assists0 / Goals0 / Blocks0 / Saves2**. Data/started-game/model holds were retained. These counts are a time-specific live observation, not a guaranteed minimum or a certification of full six-market eligible population.

All15 sport/period API combinations returned200 and their returned wins/losses/pushes/pending/hit rates and original-direction breakdowns independently reconcile. Month totals were **NBA6626 / NFL1330 / NHL1150**; Season **6416 /1797 /1639**, with partial archive coverage disclosed. Today/Yesterday/Week legitimately had no saved current captures; older history was not fabricated into these dates. The desktop Prediction Dashboard showed historical results, real source timestamps, original-side/daily details and result filtering. A real automatic refresh completed and retained records, with no clock changes. Slow/partial results prevent full statistics acceptance. Mobile statistics/complete archive reconciliation and complete featured/supporting-history acceptance remain unfinished.

## Jobs and protected records

The critical rollback stopped the90-minute acceptance window early; it was not extended to process writes after failure.

- **10 of38 current capture markets reached done:**9NFL and1NHL. NFL source phases checkpointed5source bodies; max22of220operations. NHL Shots checkpointed24source bodies, used100of220operations, and inserted5original receipts plus5saved picks. These are legitimate scheduled additions, not increased ranking counts.
- Two retained old NBA jobs advanced to done with0eligible rows, at most20operations; they are **not counted** as current-slate market completion. Durable NBA storage remained101versions/101pointers/zero calendars,764248bytes. Full current operational initialization was not verified.
- Every observed lane stayed at max4active sources /12reserved. Observed phases had no subrequest-limit failure or retry starvation. This is limited live progress evidence, **not certification of the unobserved rotations**.
- **0of3 grading rotations occurred before rollback. None of the old204ungraded picks were processed**;5new NHL picks remain additional pending records. Their genuine official-final grading must wait for restored accepted processing. Never invent results or mutate originals.
- All **20,468 pre-existing records have identical canonical full-row inventories** after rollback:11,615history,6,111originals,1,473picks,1,269grades. Additions were checked separately:5originals+5picks,0grades. Current total **20,478**. Existing20,468backup remains available; it was not overwritten/exported/restored, and this task does not claim that the10new rows are included in that earlier snapshot.

Read-only lane receipts show0rows_written for the inspection queries. No job/reset/schema/backup-restore procedure was used to erase the failed attempt. The compatible fallback's actual cron logged `[dashboard-release-hold]`, preserving pending jobs, new evidence and the namespace. Post-rollback actual desktop/mobile NBA/NFL/NHL shells and schedule APIs returned200 without page errors.

CW08 remains deployment `39ea465b-ca3f-47f8-9bd2-50eb2f1ad174`, version `46e95f99-98f2-4abe-a2b2-0ff24b4f8e4b`,15-minute schedule unchanged. Recent observed alarms/requests were successful. No research tables, code, credentials or configuration were accessed for mutation. Automatic dashboard builds remain paused.

## Completion decision

**NO-GO for R1 completion or reuse of this artifact as an accepted release.** No new deployment approval is requested. Keep CW09/CW11/V62 open with the confirmed statistics performance blocker, incomplete38-market/3-grade rotation and unverified population/supporting-history/featured acceptance. Preserve the successful live NBA recovery/EV evidence for the next task instead of repeating the source investigation or350-card audit. Existing892-test and36-focused rehearsal evidence is retained; no broad test suite was rerun for this evidence-only release report.

See `result.json`, actual browser/statistics proofs, independent EV calculation, job receipts, controls, and post-rollback inventory hashes. Raw historical row payloads and private restore files remain outside Git.
