# NFL confidence and EV validation — November 24, 2026

**Result: confirmed pipeline defects repaired; four legitimate probability-validation holds remain. No release prepared or deployed.** Continued from `af5f712` while preserving evidence commit `1268655`. Reused the73 passing recovery checks, source recordings and completed20,904-record backup; no repeated provider investigation, import, export, current-odds audit or full-suite run.

## What actually failed

1. **Fresh research comparisons inherited an older receipt time.** `attachFittedResearchForecasts` stamped a fresh selection or NBA comparison, but not an NFL comparison without a qualifying selection. With an existing first-board/forecast receipt, `modelComparisonEv` correctly rejected the later decision as occurring after capture. This erased otherwise legitimate signed EV/confidence on refresh. New, timely NFL comparisons now receive their own forecast receipt; the first-board receipt stays unchanged. Failed-validation, stale, started/frozen, unsupported and model-only rows are not restamped. No selection is inferred or created.
2. **Successful recovery retained an obsolete failure flag.** Input recovery replaced observations and produced a projection, but retained `officialHistoryUnavailable`/its old reason from the incoming row. The fresh source success now clears only these obsolete flags. A source failure or an unrefreshed/frozen row does not get cleared. Minimum-history and workload-role exclusions have specific explanations.
3. **Price generation ignored contradictory declared quote metadata.** Pricing constructed its own period from the model market rather than rejecting an explicitly different `quotePeriod`/`quoteMarket` in an incoming NFL row. Although the frontend already rejected contradictory rows, model/API diagnostics could still claim a valid comparison. These contradictions now prevent price/probability binding at generation and display, while leaving a legitimate independent point projection separate. Exact quote/player/game/book/line/prices/decision binding remains mandatory.
4. **Display paths disagreed about why EV was absent.** NFL now has one structured price-evidence view used for its displayed EV and confidence: failed probability validation, missing model/role evidence, missing probabilities, wrong quote identity/period, stale quote, missing binding, bad normalization, bad timing or directionless projection. Missing quarter probability fields remain a hold without removing a legitimate independently modeled quarter direction. No full-game data is substituted for unsupported quarters/event markets.

The refresh also explicitly preserves frozen/started original NFL forecast objects and their receipts, including model-unavailable fallback paths. No saved record is rewritten by these view/calculation safeguards.

## Four holds are genuine, not source failures

Current passing/rushing/receiving/reception model artifacts are byte-identical to the fixed evaluated population models. `gi-status.json`, snapshot, supplemental TD model, NHL count policy, NBA supporting-history implementation and Prediction Dashboard cache are unchanged; [checksums](validation-status.json).

| Market | Existing failure evidence | Required action |
|---|---|---|
| Passing yards | Later audit of22 actual saved forecasts /13 fixtures: Brier0.29817 vs constant0.25;8hits. Earlier16-forecast retrospective sample had looked better. | Do not erase the later failure or choose only the favorable sample. Independent subsequent probability/price evaluation remains necessary. |
| Rushing yards |32forecasts /11fixtures; model Brier0.31014 vs book0.25104 | Preserve hold; independent calibration/price evidence required. |
| Receiving yards |31forecasts /11fixtures; model Brier0.31105 vs book0.25067 | Preserve hold; independent calibration/price evidence required. |
| Receptions |31forecasts /11fixtures; model Brier0.26616 vs book0.24161 | Preserve hold; independent calibration/price evidence required. |
| Passing TDs | Supplemental held-out point/distribution evaluation exists; no recorded failed exact-price status. | Existing research probabilities/EV can be shown with correct quotes/receipts; no prospective betting approval or profitability claim. |

The passing audit retains original saved probabilities and independent official finals, but not a complete contemporaneous model-input manifest. The price studies are retrospective/development-inspected, not untouched prospective evaluation. No model is retrained or threshold changed against these outcomes. Model-data recovery does not validate probabilities, and a passing arithmetic test does not clear a statistical failure.

## Authentic quotes, complete population and compiled comparison

The tests reuse the recorded November24 official sources and all96 quote rows for the November26 slate. **This is a retrospective implementation replay at original board/quote times, not current sportsbook availability, a new historical forecast, or a live/prospective pass.** The scenario supplies the real earlier source capture time as an inherited board/forecast receipt. Original quote IDs, player/game IDs, prices, lines, provider times, order and ranks are preserved. No production records are accessed or modified by the replay.

The compiled **`af5f712` baseline** reproduces **4/5 eligible TD players with EV**. The corrected compiled Worker returns **5/5**, recovering the last row (Patrick Mahomes) while preserving his exact projection, probabilities, input receipt and `modelSelection:null`. The original first-board receipt is unchanged. His recorded example is OVER52.249% at line1.5/price-101, research EV+3.98095%; this is not a qualifying pick (the unchanged55% threshold is not met) and is not presented as current odds. The other four eligible TD rows retain their actual UNDER selections; no OVER/UNDER balancing occurs.

| Market | Original rows | Independent projections | Confidence/EV available | Legitimate holds |
|---|---:|---:|---:|---|
| Passing TDs |6|5|5|1 insufficient appearances |
| Passing yards |6|5|0|5 failed probability validation;1 insufficient appearances |
| Rushing yards |10|10|0|10 failed probability validation |
| Receiving yards |37|34|0|34 failed probability validation;3 history/role |
| Receptions |37|34|0|34 failed probability validation;3 history/role |

Totals: **5 priced research forecasts +83 probability-validation holds +8 history/role holds =96 rows**. Joe Milton III remains unavailable. No eligible price comparison is hidden solely for negative/zero EV or failure to qualify as a betting selection. The full list is tested, including the bottom row; [all six TD row results](passing-td-replay.json).

Independent EV verification uses `100 × (P(win) × American profit − P(loss))`, with push probability separate and normalized. Positive research returns come from authentic model/quote pairs; negative/zero boundary cases use explicitly synthetic **unit-test probabilities at the unchanged authentic prices**. Those unit inputs are never published as player forecasts and never waive validation. Altered identities, period, book, line, either price, receipt, stale quote, absent/invalid probabilities and unsupported markets all fail closed with reasons.

## Targeted checks and preserved work

**36 targeted checks pass, zero failures; TypeScript exit0 / zero diagnostics.** Six affected test files, including a compiled workerd comparison of old vs corrected code. No broad regression suite or production build. [Test log](targeted-tests.log).

- Compiled original-vs-corrected comparison; all96 rows; five eligible TD confidence/EV values; all83 failed-validation holds; all8 history/role holds.
- Exact quote and model/receipt equality for the recovered comparison; all frozen originals byte-equal; wrong period and expired quotes remain unpriced.
- Signed/zero EV, win/loss/push normalization, unsupported/Q1 holds; existing shared EV behavior across sports, NBA seven-market confidence checks and NHL comparison safeguards.
- Existing NBA recovery/supporting-history and Prediction Dashboard performance work retained unchanged. Previous capture/restart/resource evidence reused rather than rerun.

The initial six-team replay uses58 recorded GET responses from the existing fixture. An explicit16-minute stale-quote test expires the15-minute disposable input cache, causing a separate bounded58-response local refresh; neither phase makes a real provider request. Counts are not combined and misreported as one cold request. No production bindings/credentials are used.

## NHL and remaining requirements

Existing NHL evidence still supports keeping Goals/Assists count/price-validation safeguards in place. The frozen CW08 evaluation is unfinished and must not be tuned; this task does not change its model, protocol, Worker or records. Existing Saves quote absence and Blocks missing fitted model are separate from probability validation. Shots/Points/other supported-market behavior is preserved; no new live coverage claim.

**R1 remains open; no release is prepared or approved here.** The next probability-validation requirement is independent, time-separated authentic quote/outcome evidence with original pregame IDs, both prices, exact line/period, model/input receipt, decision/source times and official-final grading. Past development-inspected outcomes are not a fresh test; the November26 games have not completed. Any calibrated replacement needs a prespecified fitting/evaluation split and accuracy/price comparison before a hold can be removed. Current data retrieval and mathematical pricing correctness are established separately from calibration quality.

Retain actual production desktop/mobile acceptance, fresh prices, initialization, all38 capture markets, all three grading rotations, archive/statistics reconciliation and the last verified173 older pending grades where official evidence permits. The existing20,904-record verified recovery chain is reused unchanged, with no export/import. Automatic build inclusion was freshly read as only `__cw08_manual_release_only__`; original commands remain restored. No Cloudflare write/deployment, credential/plan/provider change, new service, CW08 modification, historical rewrite or Completed move.
