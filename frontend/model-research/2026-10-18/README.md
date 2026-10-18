# Opportunity point model: retrospective research, 18 October 2026

This is an executed model comparison, not a validated betting engine. GI and picks remain disabled. It does not establish probability calibration or betting profitability.

## Dataset and reproducibility

The collector requested two seasons of official ESPN/NHL player game logs for 224 players selected from the current six active sports ranking boards. All 448 history requests completed without transport errors; successful requests can still contain no usable records. The normalized dataset contains 48,848 player-game-market observations, not 48,848 distinct games. Missing values are skipped, not imputed as zero. The compressed observations and a source URL/retrieval-time manifest are committed here, with SHA-256 checksums.

Run from the repository root:

```sh
node frontend/scripts/replay-opportunity-backtest.mjs
node --test frontend/tests/opportunity-backtest.test.mjs
```

To recollect into a DIFFERENT directory, preserving this snapshot:

```sh
MODEL_SOURCE_CACHE=/tmp/sach-model-cache node frontend/scripts/collect-opportunity-backtest.mjs /tmp/sach-new-model-research
```

## Method fixed before this comparison

Fit one ridge regression per sport/market on the preceding season, then score the later season. ESPN season labels are 2025 training / 2026 test (basketball 2026 means the 2025–26 season); NHL is 2024–25 training / 2025–26 test, regular season only. These are retrospective seasons, not a claim that every test season is currently active. Training dates must precede every test date. Standardization is fitted on training data only; the penalty is fixed at 20. At least 100 eligible training examples are required.

Features use only earlier same-player, same-team, same-season appearances with a 48-hour availability lag: recent attempts/carries/targets, minutes or ice time; recent per-opportunity rates; recent outcomes; workload variation; and rest. No target-game workload or outcome enters features or eligibility. Three earlier appearances are required. Prior sudden workload collapse or large change causes abstention. A future relief appearance with low workload remains in test outcomes. This is a limited role safeguard, not verification of a current starting role.

The comparator is a recency-weighted average of up to ten earlier same-team/season outcomes on the exact same eligible targets. It is stricter than the old mixed-season baseline. Negative improvement means the candidate was worse. MAE is average absolute error in the market's stat units. Coverage and abstention counts for every market are in the JSON report.

## Selected results

| Market | Eligible test appearances | Candidate MAE | Baseline MAE | Error reduction |
|---|---:|---:|---:|---:|
| nfl passing_yards | 35 | 67.842 | 68.866 | +1.49% |
| nfl rushing_yards | 80 | 18.899 | 17.680 | -6.89% |
| nfl receiving_yards | 87 | 25.819 | 27.107 | +4.75% |
| cfb rushing_yards | 62 | 23.231 | 25.624 | +9.34% |
| nba points | 1768 | 5.074 | 5.093 | +0.37% |
| wnba points | 863 | 4.489 | 4.446 | -0.99% |
| cbb points | 641 | 5.159 | 5.125 | -0.67% |
| nhl shots_on_goal | 746 | 1.439 | 1.517 | +5.12% |
| nhl goalie_saves | 292 | 6.188 | 6.309 | +1.93% |

These mixed results do not justify promotion. Small football samples and comparison across many markets further limit conclusions. Do not tune against this test set and then reuse its performance as fresh validation; future revisions need a separate untouched period or nested temporal evaluation.

## Missing coverage and next model requirements

* CFB passing has only 31 eligible training examples and produces no fitted forecasts. CFB receiving/receptions are absent because these official game logs do not provide targets; they must not be replaced with catches as workload.
* These logs lack archived pregame injuries, depth charts, available teammates, weather forecasts, matchup/game script, basketball rotations, hockey lines and starting-goalie availability. Opponent IDs are preserved but opponent effects are not fitted. Current source revisions and a current-board selected population introduce vintage and selection/survivorship bias.
* NHL saves use observed shots against minus goals against, preserving relief appearances; skater and goalie markets are kept separate. A saves result does not establish starter availability.
* No genuine quarter model, first-basket model, historical exact bookmaker price/line evaluation, confidence interval, calibration study or prospective shadow validation is complete.
* Production ranking and historical performance behavior is unchanged. This candidate is deliberately absent from the validated-model registry. Historical betting records, Drive backups, retention and Railway storage are untouched.
