# Workload probability engine, 19 October 2026

This release implements a serializable probability engine and executes it on real official results. It does **not** enable GI or betting recommendations. No model is promoted to the live registry.

## Implemented

`lib/probability-forecast.ts` fits separate workload and per-opportunity efficiency ridge models. Their product forms the point forecast; a later calibration period supplies an empirical distribution of signed forecast errors. Count outcomes are rounded, physical nonnegative markets are floored at zero, and negative football yardage remains possible. Over, Under and push probabilities are separate; American-price expected return correctly refunds pushes. A fixed experimental selection policy requires at least 55% conditional win probability and 3% expected return. It never creates a public pick or GI score.

Fitting uses the first 65% of distinct eligible prior-season timestamps, calibration the remaining 35%, with a 48-hour embargo between them. Each needs at least 100 examples. Later-season outcomes never enter fitted coefficients or calibration residuals. Every target uses only prior same-player/team/season appearances with a conservative 48-hour result availability lag. Passing samples exclude fewer-than-ten-attempt appearances, and a latest known backup appearance causes abstention; low workload in the target outcome remains in evaluation. This repairs a Nelson-like two-attempt zero depressing a starter forecast, while leaving actual current-role confirmation unfinished.

Forecast artifacts retain fitted coefficients, train-only normalization, chronological boundaries, calibration residuals and source digests. An artifact cannot forecast before calibration results were available. The initial reports below cover full-game markets. The subsequent `nfl-quarter-population` bundle adds three native-quarter candidates from independently reconciled quarter workload/results; there is no division by four. Scorer markets abstain.

Exact-quote evaluation requires the same sport/player/fixture/market/period, a named book, selected main line, both labelled prices, quote ID and timestamped pregame capture. Features are rebuilt at that archived decision time. Unknown/stale/after-start prices cannot enter Brier score, market comparison, calibration bins or ROI. Duplicate observations or multiple selected quotes for one target fail rather than choosing the profitable quote afterward.

Reports include point MAE, workload MAE, CRPS (a distribution score, lower is better), central 80% empirical interval coverage/width, and a comparison against a separately error-calibrated historical-average distribution. Paired CRPS differences have deterministic 1,000-replicate fixture-cluster bootstrap intervals; player rows in one game are never counted as independent games. Fewer than ten fixtures produce no interval. These intervals do not remove missing-context, selection or vintage bias.

## Executed datasets

The original selected-board dataset is unchanged: 48,848 observations, six active sports, 224 players. Its data hashes are verified before evaluation. There are 25 fitted distributions across 29 sport/market groups; four groups lack sufficient fitting/calibration data. Full results are in `probability-evaluation.json`; fitted artifacts are in `distribution-models.json.gz`.

The additional `nfl-population` dataset uses official completed game summaries, rather than today's player rankings or rosters. All 36 season/week discovery requests and 352 summary requests completed without errors. It contains 14,950 observations from regular-season games, including 272 games in the preceding season and 80 available games in the later season. Missing workload is excluded; receiving workload is targets, never catches. Two-attempt backup appearances remain in the source dataset. Frozen originals are not overwritten.

Historical roster responses were inspected but rejected as a population source: an explicitly labelled 2025 roster could contain zero athletes. Calendar-year scoreboards mix seasons, and `year=` is ignored by the tested scoreboard endpoint. The collector uses `dates=<season>&week=<week>&seasontype=2`, checks returned season/week, and checks every summary's exact fixture, season, regular-season type and completed status. The 48-hour publication lag remains a convention, not archived publication evidence.

| NFL market | Later-season forecasts | Model MAE | Comparison MAE | Central 80% interval coverage |
|---|---:|---:|---:|---:|
| Passing yards | 50 | 74.604 | 71.679 | 84.0% |
| Rushing yards | 149 | 20.031 | 19.197 | 74.5% |
| Receiving yards | 308 | 24.906 | 25.364 | 67.5% |
| Receptions | 308 | 1.657 | 1.794 | 82.1% |

Receiving and receptions improve diagnostic CRPS over the comparison (fixture-bootstrap difference intervals above zero), but receiving-yard intervals substantially under-cover. Passing point error is worse; rushing has no clear distribution improvement. This is a diagnostic comparison, not grounds for promoting any market. The later period overlaps previously inspected v1 outcomes and is explicitly **not a fresh untouched holdout**.

These original full-game comparisons have zero exact-quote samples, so their Brier scores and ROI remain null. The subsequent `nfl-saved-quotes` bundle independently verifies saved pregame quotes and official results, providing 74 eligible exact-price diagnostic forecasts. Receiving and rushing probabilities perform poorly against the bookmaker benchmark; these results do not justify promotion. Its fitted artifact is byte-identical to the earlier NFL artifact. See that bundle's README for methods, results and limitations. Live bounded archive probes returned 403 for both NBA and NFL; the supplemental live odds feed returned 429. No subscription or billing changes are made.

## Reproduce

From `frontend`:

```sh
MODEL_VERIFY=1 node scripts/evaluate-probability-models.mjs
MODEL_VERIFY=1 MODEL_OBSERVATIONS_DIR=model-research/2026-10-19/nfl-population node scripts/evaluate-probability-models.mjs model-research/2026-10-19/nfl-population
node scripts/replay-opportunity-backtest.mjs
```

To recollect without replacing this snapshot, provide a different output directory:

```sh
MODEL_SOURCE_CACHE=/tmp/sach-football-population-cache node scripts/collect-football-population.mjs /tmp/sach-new-football-population
```

## Still required

Archived pregame roles, availability, available teammates, weather/game script, basketball rotations/minutes context, hockey lines/goalies, scorer models, improved quarter coverage, broader exact-price validation, independent future evaluation and prospective monitoring remain incomplete. The empirical error distribution is pooled by market and does not establish calibration for an individual player or role. The six-sport sample is selected from current boards, and all public logs are current revisions. These candidates must not be presented as validated forecasts.

All historical wagering records, research archives, Google Drive backups, seven-day retention and Railway storage settings are unchanged. MLB and soccer remain hidden.
