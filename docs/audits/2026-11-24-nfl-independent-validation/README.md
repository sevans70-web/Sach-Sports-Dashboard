# NFL probability evidence and independent stability release — November 24, 2026

**Decision:** retain all four NFL probability holds. Existing data is sufficient to explain the holds; stop repeating unavailable-data/provider investigations. **GO to prepare a stability release independently of NFL model approval, subject to the existing release gates; NO deployment or model promotion in this task.** No artifact was built/frozen/uploaded.

Continues `31911ba` and preserves `a9b3059`. Reuses the73 recovery checks,36 pricing checks and verified20,904-record backup. There is no provider purchase, credential change, new source collection, production query/write, backup export/import or CW08 modification.

## Exact failed criteria and observed causes

These are **statistical evidence holds**, not four failing unit tests or missing-price exceptions. Runtime `gi-status.json` preserves the recorded failures. Current model objects match the fixed evaluated NFL population artifacts.

| Market | Original failure evidence | Interpretation |
|---|---|---|
| Passing yards |22 saved probabilities /13 fixtures, Brier0.29817 versus constant0.25;8/22hits. Mean selected-side confidence63.4%, actual hit rate36.4%. Both OVER and UNDER were overconfident. | The later saved-forecast audit failed the elementary probability benchmark. An earlier16-forecast sample scored0.20383 versus book0.24894, but choosing only that favorable result would be invalid. |
| Rushing yards |32 later forecasts /11fixtures, model Brier0.31014 versus no-vig book0.25104. | Fixed workload×rate forecasts with the existing empirical residual calibration mispriced the evaluated player/line outcomes. Diagnostic mean point projection exceeded actual by6.27yards; probability-favored confidence65.4% versus43.8% accuracy. |
| Receiving yards |31 later forecasts /11fixtures, model Brier0.31105 versus book0.25067. | Poor conditional calibration/discrimination: favored confidence60.5% versus41.9% accuracy; mean point overprediction6.57yards. Its mean OVER probability50.2% was already close to balanced, demonstrating that forcing direction counts would not repair accuracy. |
| Receptions |31 later forecasts /11fixtures, model Brier0.26616 versus book0.24161. | Count uncertainty and conditional calibration did not beat the benchmark; mean point overprediction0.627receptions. Small samples limit certainty; this is not a demonstrated reliable probability advantage. |

The fixed model estimates workload and rate from lagged player/team/season history, then adds prior calibrated residuals. The evidence shows probability error under that policy; it does **not** identify an injury/weather/provider issue as a proven single causal feature. Separate workload/rate/uncertainty experiments would need a prespecified fitting/evaluation protocol. No such experiment, retraining, threshold change or probability rebalancing is performed here.

The original evaluations are retained under `frontend/model-research/2026-10-20/rookie-nfl` and `2026-10-27/p01-saved-passing-audit`. Lower Brier is better. The passing audit's0.25 comparator is **constant0.5**, not bookmaker odds. The three other recorded failures use no-vig book probabilities on the identical decisions. A point estimate worse than the benchmark supports withholding; it does not by itself establish population-wide statistical significance.

There is no complete preregistered market-specific promotion protocol in the repository. The existing **200 decisions /30fixtures** minimum belongs to the **GI return-map calibration**, not a sufficient probability-validation rule. Its271rows/31fixtures are pooled and do not clear these market holds. GI is not confidence. The validated-model registry remains empty.

## Existing records reviewed — more evidence was available

The native receipt table alone is inadequate:1,211NFL originals and149NFL selected-pick payloads omit the full probability vector/input receipt;35NFL grades cover TD/sacks/quarters, not these four held markets. **Do not conclude that all application history lacks probabilities:** richer protected history snapshots exist.

Read-only review of1,328NFL history documents in the existing verified backup found:

- 11,333candidate nested rows;6,019normalized probability rows;2,685quote-matched timely rows.
- 1,365rows whose document source receipt predates kickoff. Deduplicate by market/game/player using earliest qualifying receipt, before reading outcomes: **619 decisions across40games**.
- All619have verified original input-receipt hashes, correct player/game/market/book/line/both-price binding, full-game main contracts, matching snapshot digest and the unchanged workload model. All619probability vectors also reproduce exactly from their frozen feature vectors and the unchanged model coefficients/residuals. Repeated later snapshots do not count as extra independent trials. No conflicting equal-first-receipt variants were observed.
- The snapshot digest matches the current frozen runtime manifest. This is independent of fitting/calibration dates, but remains an archive-selected diagnostic, **not a preregistered untouched prospective test or whole sportsbook population**.

The backup contains43 normalized official-final games. Reusing the already authorized November24 raw official-final fixture adds37games/replaces15versions; overlapping numeric outcomes showed **zero disagreements**. No new provider call was made. IDs, final status and player statistic matching are required; missing participation is never zero.

This yields **469 scored decisions /32 independent games**, all with quotes fresh within15minutes at their preserved document receipt. Original inputs are not recomputed from outcomes. Model probability errors remain worse than the bookmaker comparison in all four market samples:

| Market | Enrolled | Scored | Independent games | Model Brier | Book Brier |95% paired book-minus-model interval |
|---|---:|---:|---:|---:|---:|---|
| Passing yards |69|56|30|0.25251|0.24818|[-0.03860,+0.02729] |
| Rushing yards |132|96|31|0.29069|0.25269|[-0.08121,+0.00564] |
| Receiving yards |221|167|30|0.28641|0.25029|[-0.06129,-0.01401] |
| Receptions |197|150|27|0.25731|0.24763|[-0.03604,+0.01638] |

Whole-game resampling preserves player correlation. Receiving shows deterioration in this diagnostic interval; the other three intervals include zero and do not demonstrate a reliable advantage. These intervals do not account for archive-selection or missing-outcome bias. **Do not promote any model from this review.** All469lines are half-point and have zero model push mass.

[Inventory](backup-evidence-inventory.json), [scored audit](backup-probability-audit.json), [existing final-source reconciliation](existing-final-sources.json). Only aggregates, source hashes and public game IDs are committed; private player-level forecasts and backup row payloads are excluded.

### Precise outstanding historical evidence

150of619enrolled decisions remain unscored:

- **120 decisions:** official finals absent from the existing evidence for games `401873055`, `401873056`, `401873057`, `401873059`, `401873060`, `401873061`, `401873062`, `401873064`.
- **30 decisions:** exact player/market statistic or authoritative participation/DNP/void evidence is missing. Do not manufacture zeroes, wins, losses or grades.

These are already completed historical games; completing this diagnostic needs their legitimate evidence, **not waiting for new games**. The incompleteness is reported rather than hidden. It is not necessary to fetch them again merely to justify today's holds: the available data already fails to establish a probability advantage.

For a future successor/clearance decision, freeze the model or calibration policy and acceptance criteria **before** an independent evaluation period. Retain every enrolled eligible player or a prespecified outcome-independent sample, all exclusions, first durable pregame receipt, immutable probability vector, model/snapshot/input hashes, player/game/market/period, quote/prop/book IDs, exact line/both prices/update/capture/decision clocks, and matched official-final/participation evidence. Separate pushes and preserve failures/missing outcomes in coverage. Use per-market conditional probability calibration, the identical no-vig benchmark and fixture-clustered uncertainty; price EV with unconditional win/loss/push masses. Past inspected records may be diagnostic/development data, never rebranded untouched. A power/precision-based per-market sample and pass rule must be declared prospectively; no arbitrary sample size or relaxed rule is invented now.

Native receipts alone do not contain all these fields, but companion protected snapshots already demonstrate a legitimate recovery path. A future validation collection must verify that companion evidence is durably retained; do not infer it from a completed capture job. Do not alter the v1 native receipt format inside this stability release: its existing checksum reader and fallback must remain compatible. No receipt schema or capture runtime was changed here.

## Confirmed implementation defects corrected

1. **Push-excluded Brier used unconditional OVER probability** in `evaluate-rookie-models.mjs`. Correct scoring uses `P(OVER)/(P(OVER)+P(UNDER))` for nonpush outcomes. Pushes receive no binary score; impossible nonpush mass fails explicitly instead of improving a score by dropping the row. EV math and live model probabilities are unchanged.
2. **The published evaluator could not read its compressed archived manifest/quote files.** It now supports the actual `.json.gz` artifacts, verifies quote/source checksums, records the model artifact digest, and refuses to overwrite any existing output directory/evidence.
3. Add paired game-cluster Brier intervals and explicit scoring-policy metadata to the replay report. These are diagnostics, not automatic promotion gates.

The exact archived639quote input replays271calibration rows/31fixtures and110later decisions/11fixtures. **All110use half-point lines, so correcting push conditioning changes none of the four original Brier results.** This implementation defect does not explain away their failures. Historical reports/models remain byte-identical; new replay output is separate.

**Testing:**3new targeted checks pass,0fail; TypeScript exit0/0diagnostics. Test actual639quote replay, unchanged110probabilities/scores, integer-line push conditioning, malformed/impossible mass, source checksums and repeated-output rejection. The private-backup inventory/source-join/scoring pipeline was independently rerun through the committed reproduction scripts and produced exactly the same619/469audit. Previous73recovery and36pricing checks are reused. No full suite or dashboard build.

## Release recommendation

See [release-strategy.md](release-strategy.md). **NBA and Prediction Dashboard stability can be prepared independently of NFL/NHL probability approval**, with their holds and truthful unsupported-data explanations preserved. The single shared Worker and scheduler mean this is not an NBA-only module upload or exemption from cross-sport regression.

Keep R1/CW09/CW11/V62open until actual production acceptance. Retain archive/statistics reconciliation, initialization, all38capturemarkets/three grading rotations and last verified173olderpending grades. Reuse the20,904record backup; no new export/import. No completed tracker item is reopened or moved merely because diagnostic tests pass. No deployment, model promotion, CW08/credential/plan change, new service or automatic-build activation.

### Reproduce privately without production access

The committed `reproduce/` tools accept the already verified local SQLite restore and a **new private output directory outside the repository**. They open the database read-only/immutable, assert its20,904-record inventory, select only NFL history documents, reuse the existing public FINAL fixture, validate original input hashes and write aggregate reports. Private intermediate forecasts must not be committed or posted to Issue129.

```sh
python docs/audits/2026-11-24-nfl-independent-validation/reproduce/inventory-backup.py /path/to/verified-20904.sqlite /tmp/nfl-validation-new
node docs/audits/2026-11-24-nfl-independent-validation/reproduce/augment-finals.mjs /tmp/nfl-validation-new
node docs/audits/2026-11-24-nfl-independent-validation/reproduce/score-backup.mjs /tmp/nfl-validation-new
```

Both original and committed-tool reproductions produced identical aggregate results. The existing backup is neither modified nor exported again.
