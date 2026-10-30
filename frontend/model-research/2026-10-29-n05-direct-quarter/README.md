# N05 native quarter point forecasts

Scope: NBA and NFL Q1, separate from P01 probability/price validation. These outputs are fitted point expectations, not calibrated win probabilities or approved betting recommendations. The validated-model registry remains unchanged.

NBA labels reconcile the official team's Q1 and final scores and each player's full-game statistic against play-by-play. A full-game participant's zero Q1 action is retained only when that market reconciles. DNPs, ambiguous identity, incomplete tape and unreconciled statistics are excluded. NFL uses the existing independently reconciled quarter observations and historical full-game role volume.

The direct ridge fit uses previous same-team Q1 results and historical role, allowing the previous season with a 48-hour availability lag. No target result, actual target workload, bookmaker line or full-game/4 projection is a feature. `evaluation.json` includes all seven market comparisons and exclusions. Historical development RMSE improved over the weighted previous-quarter baseline in each market. NBA assists MAE was marginally worse and threes MAE worse; RMSE improvement is not a claim that every error measure improves. The 2026 evaluation was already used for development, not an untouched holdout. NFL passing covers 56 forecasts across 47 test fixtures; prospective and exact-price validation remain unresolved.

Rebuild the source candidate into a NEW directory from the original Library archive `libfile_bcaa72ea165c81919418eddb622e6d28`:

```
node scripts/develop-n05-quarter-models.mjs ORIGINAL_EXTRACTED_ARCHIVE NEW_CANDIDATE_DIRECTORY
node scripts/pack-n05-quarter-models.cjs NEW_CANDIDATE_DIRECTORY NEW_RUNTIME_DIRECTORY 2026-10-29T22:08:29.469Z
```

The candidate checksum is verified before packaging. Packaging does not edit live runtime files or the registry. With the original candidate artifact, it reproduces both committed runtime files byte-for-byte; snapshot SHA256 is `7265f41b180e27e34c4713e72a6f26e47e4a268df82dc9858e1ab8513e1ca11e`.

Main O/U directions retain the exact two-way quote. An N+ milestone retains its original target and single price; a saved numeric forecast may be displayed as reaching or below that target, never as an invented executable UNDER contract. Every displayed comparison requires matching original quote/player/fixture/target/timestamp evidence. Frozen forecasts are never recalculated after start. No probability or EV is filled from the point expectation.
