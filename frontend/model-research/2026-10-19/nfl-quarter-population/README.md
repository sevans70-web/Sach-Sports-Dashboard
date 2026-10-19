# Native NFL Q1 workload candidates

Three separate Q1 yardage distribution candidates are fitted: passing, rushing and receiving. They use actual first-quarter attempts/carries/targets and yards, rather than a fraction of full-game totals. They remain experimental and are not registered for GI or betting recommendations.

The collector discovered 624 completed regular-season games across 2024, 2025 and the available 2026 period. All 54 discovery and 624 summary requests succeeded (public source cache is reused). The source contains 13,454 player-game-market observations with reconciled quarter stats; it is not a complete census of all quarter appearances. Missing or ambiguous tape is excluded.

The parser requires a beginning-of-Q1 tape marker and a period transition. Parsed full-game player yards AND attempts/carries/receptions must match official totals. Targets are counted independently, including incomplete intended passes; their full-game per-player count must match official targets before quarter target workload is accepted. Receptions are not substituted for targets. Nullified plays, sacks and conversions remain excluded. Exact team/player alias ambiguity fails closed. Quarter zero workload/results are retained where the player had reported full-game participation in that market.

The source retains historical full-game volume in a separate `roleWorkload` field. Q1 passing uses that field ONLY for already completed prior-game role filtering (ten or more full-game attempts), never the target game's full-game attempts or as quarter volume. A quarterback with a two-attempt relief appearance cannot be treated as an established starter. Current pregame role confirmation is still missing.

| Q1 market | Fitting rows | Calibration rows | Later-period forecasts | Model MAE | Comparison MAE |
|---|---:|---:|---:|---:|---:|
| Passing yards | 192 | 138 | 4 | 16.906 | 15.833 |
| Rushing yards | 496 | 371 | 27 | 6.084 | 6.142 |
| Receiving yards | 1551 | 997 | 152 | 9.048 | 10.337 |

Zero-opportunity quarters from confirmed full-game participants train the workload model; only rate fitting excludes zero denominators. The rate-model fitting counts are 192 passing, 361 rushing and 960 receiving. Dropping all zero-volume quarters from workload fitting would bias expected quarter activity upward.

These point-error results and low coverage do not justify promotion. In particular, four passing forecasts cannot establish accuracy. The candidates still lack pregame personnel/weather/game-script context, independently untouched evaluation, exact quarter prices and prospective monitoring. The comparator is descriptive research, not a validated prediction.

A saved-record Q1 inspection on the live dashboard found zero qualifying preserved main quotes: 67 rows failed frozen-quote verification and nine were withdrawn. No baseline or milestone was recertified as a book line. The configured historical-price probes separately returned 403; the supplemental live feed returned 429. Those source/access limitations remain unresolved.

From `frontend`, replay the exact fitted artifacts and report:

```sh
MODEL_VERIFY=1 MODEL_OBSERVATIONS_DIR=model-research/2026-10-19/nfl-quarter-population node scripts/evaluate-probability-models.mjs model-research/2026-10-19/nfl-quarter-population
```

Recollect into a different directory:

```sh
MODEL_QUARTERS=1 MODEL_SOURCE_CACHE=/tmp/sach-football-population-cache node scripts/collect-football-population.mjs /tmp/sach-new-quarter-population
```

No historical records, backup configuration, retention or Railway volume settings are modified.
