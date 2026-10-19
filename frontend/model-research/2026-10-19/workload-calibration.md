# Workload-conditioned probability calibration

This is an implemented and executed research candidate, **not live GI or betting picks**. No validated-model registry entry is added. Existing fitted artifacts, historical records, bookmaker quotes, backups, retention and storage settings are unchanged.

## Repair and fixed evaluation policy

The earlier engine pools signed forecast errors across very different expected workloads. The separate `local-workload-distribution-candidate-v1` selects the nearest half of calibration observations by **predicted** workload, requiring at least 200 total calibration rows and at least 100 selected errors. Selection never uses the target's actual workload, outcome, line or prices. Ties use stable calibration order. Sparse groups abstain rather than borrowing pooled errors. Workload and efficiency fits remain identical to the pooled candidate wherever both fit.

This half-neighborhood policy was fixed before running these comparisons. It is not tuned per market or selected from a grid on these results. It remains a development experiment on already inspected outcomes, not an untouched holdout. Forecast point estimates are unchanged; only uncertainty/probabilities change. Workload alone is not current-role, availability, matchup or rotation evidence.

## Real-data results

`workload-calibration-nfl/` uses the frozen NFL saved-quote dataset and its 89 selected exact pregame quotes. The stricter calibration requirement excludes passing. Receiving, receptions and rushing retain 56 eligible quoted forecasts in total. Lower Brier error is better:

| Market | Exact quotes | Pooled error | Workload-conditioned error | Bookmaker benchmark |
|---|---:|---:|---:|---:|
| Receiving yards | 22 | 0.3590 | 0.3180 | 0.2536 |
| Receptions | 17 | 0.2550 | 0.2454 | 0.2442 |
| Rushing yards | 17 | 0.3963 | 0.3198 | 0.2505 |

Receiving and rushing improve versus the pooled candidate in the 1,000-replicate fixture-cluster diagnostic intervals. Both still trail the bookmaker benchmark; the samples cover only 10–11 fixtures. Receptions has no clear improvement interval. These comparisons do not validate betting profitability or a GI scale.

On all eligible later-season outcomes in that dataset, 80% interval coverage changes from 68.6% to 71.8% for receiving, 82.9% to 83.4% for receptions and 75.5% to 78.5% for rushing. Receiving remains under-covered. Point-forecast errors do not change.

`workload-calibration-six-sport/` replays the unchanged 48,848-observation six-sport source. Ten market models have enough calibration rows: six NBA and four NHL skater markets. All other groups abstain. NBA points distribution error changes only slightly (CRPS 3.6060 to 3.5965), with a fixture-cluster difference interval crossing zero. NBA threes improve diagnostically; blocks/rebounds and some hockey markets worsen. There are no qualifying archived quotes in this source, so it cannot establish NBA/NHL betting accuracy or ROI. No claim is made that all six sports have fitted, validated models.

Both output bundles contain serializable artifacts, source/quote digests and complete reports, including paired comparisons against pooled calibration and the historical distribution. Original source selection/vintage bias, reused development outcomes and unavailable frozen pregame context remain limitations. Cluster intervals do not correct those biases.

## Reproduce from frontend

```sh
MODEL_CALIBRATION=workload MODEL_VERIFY=1 MODEL_OBSERVATIONS_DIR=model-research/2026-10-19/nfl-saved-quotes node scripts/evaluate-probability-models.mjs model-research/2026-10-19/workload-calibration-nfl model-research/2026-10-19/nfl-saved-quotes/selected-quotes.json
MODEL_CALIBRATION=workload MODEL_VERIFY=1 node scripts/evaluate-probability-models.mjs model-research/2026-10-19/workload-calibration-six-sport
```

The original pooled evaluation remains the default and replays byte-identical fitted artifacts. Experimental evaluation requires an explicit output directory and refuses to overwrite a different model bundle.

## Release blockers

GI scores and actual picks remain unfinished. Required next inputs include timestamped pregame role/availability/teammate snapshots, football matchup/weather/script, basketball expected minutes/usage/rotation, and hockey line/goalie context. Broader exact-price validation and genuinely new evaluation outcomes are needed. NFL Q1 and NBA first-basket quote coverage and scorer models remain separate blockers. This experiment does not make those missing inputs available.
