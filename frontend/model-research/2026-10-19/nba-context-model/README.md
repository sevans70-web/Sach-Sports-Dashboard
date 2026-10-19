# NBA minutes, usage and opponent model

`basketball-context-distribution-candidate-v1` replaces the old player-average-only feature set with separately fitted expected minutes and per-minute production. It is executed on real official fixtures. GI and public picks are **not enabled** by this candidate.

## Population and source validation

The collector read 424 single-date scoreboards spanning October–April in the 2025 and 2026 NBA season windows, then 2,469 completed regular-season fixture summaries. No source request failed. Completed summary identities, season/type and result age are checked. All player market totals, attempts, free throws and turnovers reconcile to independently reported team totals. Explicit DNP rows become reported zero outcomes; absent/malformed statistics remain missing. Minute totals and individual duration are checked.

There are 372,468 player-market observations across six markets. 111 discovered fixtures lack sufficient reconcilable source information and contribute no observations. A second parse of all cached sources with strict all-market reconciliation reproduced the exact observation digest:

`a76340c94c6378fca654d448d89a6d239b7254da25d20dc762a41cff125948b1`

The compressed complete source manifest is committed under `../nba-context-population/`. The larger immutable observations, full manifest and model artifacts are preserved together in `NBA-Model-Evidence-2026-10-19.tar.gz`. No original dashboard history or backup configuration is changed.

## Forecast inputs and calibration

Twenty-four prior-only features cover recent/long minutes, variability, starter history, estimated usage, attempts/free throws/turnovers per minute, recent/long production rates, whole-team pace, opponent per-possession allowance, home status, rest and the season boundary. Usage and possessions use a fixed boxscore convention with 0.44 free-throw weighting, not official measured possessions. Actual target minutes, usage, starter flag, team totals and outcome are excluded. Team/opponent histories come from whole fixtures, not the current ranking board.

Results carry a conservative 48-hour availability lag. Same-player/same-team history may carry from the preceding season within 366 days, allowing season-opening evaluation. Transfers without a same-team history and uncertain recent roles abstain. Current injury effects and a confirmed new role are not reconstructed from final outcomes.

The earlier chronological fitting/calibration split is retained. Workload fitting includes 1,285 eligible zero-minute training outcomes; efficiency fitting excludes division by zero. Each market has 13,453 fitting rows, 7,645 calibration rows and 23,461 later-season forecasts, including 2,142 zero-minute targets. Uncertainty uses a fixed maximum 401 uniformly spaced chronological calibration rows and the nearest half by predicted workload. The historical comparison uses the same calibration sample. No fitting/calibration policy was selected by searching these later outcomes.

## Executed results

| Market | Model MAE | Historical comparison MAE | 80% interval coverage |
|---|---:|---:|---:|
| Points | 4.8501 | 4.9151 | 82.5% |
| Rebounds | 1.9952 | 2.0112 | 89.2% |
| Assists | 1.3937 | 1.4090 | 89.5% |
| Threes | 0.9223 | 0.9116 | 91.1% |
| Steals | 0.7199 | 0.7304 | 96.4% |
| Blocks | 0.5163 | 0.5017 | 92.6% |

Expected-minute MAE is approximately 5.72 minutes. Distribution CRPS improves against the calibrated historical comparison in all six markets, with fixture-cluster diagnostic intervals above zero across 1,185 target fixtures. Some point errors worsen and most intervals are too conservative. These facts do not establish an actionable betting edge.

This development evaluation uses current revised official sources, not frozen historical pregame vintages. Summary-listed athletes and missing boxes affect population coverage. Some later-season results were already inspected in earlier work; this is not a prospective untouched holdout. There are zero independently verified historical NBA exact-price samples in this dataset, so quoted probability calibration and ROI cannot be validated.

## GI and pick engine

`lib/opportunity-strength.ts` implements an experimental GI mapping distinct from outcome probability and evidence confidence. Exact-quote decisions produce actual unit returns; a fixture-weighted monotone fit learns expected return against forecast value. Positive calibrated return is ranked against the calibration opportunities on a 0–100 scale. That is a candidate opportunity-strength definition, not a win probability or an agreed fixed-weight heuristic. Its behavior still needs independent exact-price evaluation before release.

The decision calculation joins forecast workload, forecast distribution, the exact bookmaker threshold/prices, expected return, the GI mapping and the existing fixed experimental probability/value thresholds. Missing GI calibration, identity/period/timing failures and nonpositive calibrated value produce explicit abstentions. It does not authorize its own model or enter the public validated registry.

The real saved-NFL training attempt has only 74 eligible exact-price decisions across 11 fixtures, below the engine's declared minimum of 200 decisions and 30 fixtures. It produces no GI artifact. NBA has no eligible historical exact-price sample. See `../gi-opportunity-model/opportunity-strength-evaluation.json`. Historical quote access for the configured provider key returned HTTP 403; resolving access is required for broader price validation. Passing that validation and completing current context are separate release requirements.

## Reproduce from frontend

Extract the preserved evidence archive into `model-research/2026-10-19/`, then:

```sh
MODEL_VERIFY=1 MODEL_CALIBRATION=workload MODEL_FEATURE_POLICY=basketball_context MODEL_OBSERVATIONS_DIR=model-research/2026-10-19/nba-context-population node scripts/evaluate-probability-models.mjs model-research/2026-10-19/nba-context-model
node scripts/evaluate-opportunity-strength.mjs /tmp/sach-gi-replay
```

The second report records its actual evaluation time; numeric sample/rejection counts and fit refusal are reproducible. The original pooled-model replay remains unchanged. NFL, CFB, WNBA, CBB, NHL, quarter, scorer and combined-market forecast rebuilding/validation are not claimed by this NBA bundle.
