# NBA/NFL Q1 history candidate v1 — N05 remains open

This is real quarter-specific model research, independent of the live model registry. There is no live forecast promotion, no replacement of historical predictions and no GI/confidence/EV certification. Production remains bfb9c0df. Scope is NBA and NFL only.

The model uses the last ten certifiable same-player/same-team Q1 observations, with at least five required and a conservative 48-hour availability lag. Prior Q1 outcomes, variability, zero frequency and role history form the features. NBA role is prior-game starter history; NFL role is prior-quarter workload. Target-game actuals, realized workload and starter status are never inputs. Prior full-game passing attempts are only a backup/starter guard. NFL negative yards remain possible. NBA unknown participation is never silently made a zero.

Fixed ridge penalty 20. First 65% of prior-season timestamps fit coefficients; later 35% calibrate residual distributions, with a 48-hour boundary embargo. NBA history window 366 days; NFL 730 days. Prior-season sources are current official revisions, not historical pregame vintages. The first evaluation on season 2026 is retrospective and already inspected.

The newer temporal check froze candidate SHA256 `db107e27b772a814b2fa4162cfe3a06f20b478517cc0629d52cd7b1519f9a1b9` before collecting every discovered completed regular-season fixture dated October 20–26 UTC: 47 NBA and 13 NFL summaries, zero request errors. No target overlaps the original source archive. Results and all source responses are retained. It is a temporal external check, not a prospective historical-price study; historical injury/lineup vintages remain unavailable. Reconciled NFL tape and NBA quarter participation coverage are incomplete, and both source-label and prior-history exclusions must be considered.

| Market | New-check forecasts | Model MAE | Prior-Q1 mean MAE | Error reduction |
| --- | ---: | ---: | ---: | ---: |
| NBA points | 601 | 2.248 | 2.368 | 5.07% |
| NBA rebounds | 601 | 0.961 | 0.999 | 3.82% |
| NBA assists | 601 | 0.739 | 0.799 | 7.49% |
| NBA threes | 601 | 0.463 | 0.493 | 5.95% |
| NFL passing | 11 | 33.577 | 36.764 | 8.67% |
| NFL receiving | 134 | 8.772 | 8.772 | 0.001% |
| NFL rushing | 53 | 5.062 | 5.749 | 11.96% |

NBA distribution error improves in all four markets. NFL receiving distribution error worsens; passing covers only eight fixtures. Do not promote these as universally successful betting models. A better point forecast does not establish exact-line direction accuracy, calibrated confidence or profitable betting. The earlier retrospective results are all reported too, including failed assists/threes/receiving comparisons.

At 5:02 PM Toronto on October 29, 68 forecasts were frozen before all three future fixtures: NBA 56 and NFL 12. Nineteen quotes abstained for insufficient same-team prior Q1 history. Exact ranking responses, original quotes/prices/timestamps, pregame context, numeric projections, feature vectors, individual prior-game observations, both outcome probabilities and model artifacts are preserved in `prospective-cohort.tar.gz`. N+ equality is reached, never a push; complementary UNDER probability is not an offered UNDER price. This cohort was frozen before the new temporal-check results were calculated; it includes all seven candidate groups without success-based filtering. Initial score: 68 pending, zero settled, zero final-result requests. All 68 numeric projections and probability pairs independently reproduce exactly. Integrity hashes are checked before scoring.

463 tests and production build pass. Runtime SHA256 remains `b45c4ce8bafb7395c4742c7a58572f1cf51dc137455df9fb16453a3c0fb88080`. All source archives, old forecasts and frozen P01 cohorts are unchanged. N05 cannot be called complete while live Sach direction/projection cells are still missing.

Replay from `frontend` (each output directory must be new):

```sh
node scripts/evaluate-q1-history.mjs /path/to/nba-event-census/event-observations.json model-research/2026-10-19/nfl-quarter-population/opportunity-observations.json.gz /tmp/q1-new-evaluation
node scripts/score-q1-external-check.mjs /path/to/nba-event-census/event-observations.json model-research/2026-10-19/nfl-quarter-population/opportunity-observations.json.gz /path/to/external-check /tmp/q1-new-external-score
mkdir /tmp/q1-frozen-original
tar -xzf model-research/2026-10-29-q1-history-v1/prospective-cohort.tar.gz -C /tmp/q1-frozen-original
node scripts/score-q1-frozen.mjs /tmp/q1-frozen-original /tmp/q1-new-prospective-score
```

The recovered original NBA census is the existing `Sach-NBA-Event-Census-2026-10-24.tar.gz`, archive SHA256 `42b46118269c4f1c72205b4aef084a04c926a4bc5ca217e0e74f75d110fb4ac4`. The external protocol, official source manifest, compressed observations and per-forecast scores are included here. External sources are unmodified gzip official JSON responses in their tar archive.
