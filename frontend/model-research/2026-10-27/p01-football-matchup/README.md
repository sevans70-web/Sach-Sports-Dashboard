# P01: football matchup candidate

This is completed research work, **not a completed P01 accuracy repair**. The candidate is not connected to the production forecast engine. No live coefficient, original selection, result, probability, quote or history file was replaced.

The candidate adds six prior-only context features to the ten existing player features: mean reported team outcome, mean reported workload and aggregate efficiency, for both the player's offense and the opponent's allowed production. It uses the last five bilateral same-season fixtures, requires three, and excludes results less than 48 hours old. Reported positive-workload player totals are not official net team statistics or a proof of full box-score coverage. Missing or conflicting fixture context causes abstention. Relief players contribute to reported team totals while the existing starting-QB role filter remains in place for player history.

The direct ridge target, penalty 20, feature definitions, chronological 65/35 train/calibration split, 48-hour embargo and minimum sample counts were fixed before this candidate run. There was no parameter search. Models, source hashes and the full protocol are preserved here. Outcome data were already inspected in earlier work: these are development comparisons, not new untouched tests. Existing source/availability limitations still apply.

## First comparison: same targets and exact saved quotes

All model comparisons below use the same eligible targets; all four fitted groups are reported. Lower Brier error is better. These comparisons cover 1,134 point/distribution forecasts and 74 exact settled quoted forecasts.

| NFL market | Paired targets | Exact quotes | Current Brier | Candidate Brier | No-vig book Brier |
| --- | ---: | ---: | ---: | ---: | ---: |
| Passing yards | 68 | 18 | 0.23606 | 0.23120 | 0.25555 |
| Receiving yards | 433 | 22 | 0.35898 | 0.31375 | 0.25356 |
| Receptions | 433 | 17 | 0.25498 | 0.26897 | 0.24419 |
| Rushing yards | 200 | 17 | 0.39634 | 0.30787 | 0.25049 |

Receiving distribution error improves on the current candidate (paired fixture-cluster CRPS difference interval 0.13177 to 0.66258). Rushing Brier improves against the current candidate (interval 0.03390 to 0.17464), but its probability error remains worse than the book benchmark. Receptions Brier worsens. Passing MAE and CRPS do not improve. The reports retain all OVER/UNDER selection counts, hits, prices and returns; several side samples have fewer than ten independent fixtures and therefore no uncertainty interval.

## Separate original-saved-forecast replay

`../p01-matchup-saved-replay/` replays the already audited 22 original passing forecasts across 13 fixtures. None of these game/player targets overlaps the first comparison's saved passing-quote targets. Candidate coefficients and residuals were frozen before this replay; the replay does not refit or select favorable rows. All 13 exact completed official summaries were fetched successfully and are retained compressed. All 22 exact players/fixtures reconciled, with no unresolved results.

Original saved probability Brier is **0.29817**; candidate Brier is **0.27771**. The paired fixture-cluster improvement interval is **-0.01190 to 0.05567**, which crosses zero. Original directions win 8/22 (OVER 4/10; UNDER 4/12). Candidate majority-probability directions win 9/22 (OVER 4/9; UNDER 5/13). Candidate directions are diagnostics, not newly issued picks. The replay has no original two-sided price comparison and makes no EV, book-edge or ROI claim. Prior outcome inspection means it is still not an untouched holdout.

This is insufficient to promote the candidate. P01 remains unchecked. NFL failed-price-validation guards remain active. CFB's helper support is not a CFB evaluation; no new accuracy claim is made for CFB, NBA, NHL, CBB, Soccer, WNBA or MLB. Existing hidden-sport settings are preserved.

## Reproduce

Run from `frontend`, using **new** output directories. Scripts refuse to overwrite their source or an existing output directory.

```sh
node scripts/evaluate-football-matchup.mjs model-research/2026-10-19/nfl-saved-quotes /tmp/new-matchup-study
MODEL_OFFICIAL_RECEIPTS=model-research/2026-10-27/p01-matchup-saved-replay/official-responses.json.gz node scripts/audit-matchup-saved-passing.mjs model-research/2026-10-19/nfl-saved-quotes model-research/2026-10-27/p01-football-matchup model-research/2026-10-27/p01-saved-passing-audit /tmp/new-matchup-replay
```

The second command uses the frozen official receipts without another network request. Omitting `MODEL_OFFICIAL_RECEIPTS` fetches current official summaries and records their retrieval time, retaining the revised-data limitation. The scripts have no production write operation.

The next promotion decision needs an improved candidate that survives an independently frozen evaluation with adequate exact-price, fixture and side coverage, and calibration/return evidence. Repeatedly tuning this already inspected cohort cannot supply that evidence.
