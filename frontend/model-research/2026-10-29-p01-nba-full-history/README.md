# P01 full historical population — additional candidate development

Recovered NBA-Model-Evidence-2026-10-19.tar.gz from its existing persistent file. Archive SHA2560186bd9424db69ed93862b686e585936e05a3f80bfb14cf97ef330a195f02375. Full observation gzip SHA256b4593fb5a9bb910365d40281e62db26cfc03407970774a0c6d707602b90112c4 and uncompressed SHA256a76340c94c6378fca654d448d89a6d239b7254da25d20dc762a41cff125948b1 match the immutable source manifest. The archive contains372468 observations across6 NBA stats/2469fixtures, including62078points observations. The original model artifacts reproduce the runtime baseline exactly. Source bytes remain in the existing archive rather than duplicating the large source into the app repository.

Full-data participation-conditioned points fit uses12168training rows and6804calibration rows, compared with285/1303 in the prior subset candidate. Exact194 saved points lines: saved originals96correct;runtime reconstructed94;full candidate96. Candidate Brier0.28860 vs runtime0.29980,still worse than constant0.5 benchmark0.25. No direction improvement versus saved originals. Not promoted.

A second fixed next-season refit (sibling study) trains only seasons2025/2026 and evaluates2027:26385positive-minute training rows/13962calibration rows. No Oct2026target outcomes enter fitted coefficients or residual calibration;lagged earlier results may supply pregame features with48h availability lag. Same194saved-line results:candidate95hits,original96,runtime94. Not promoted. Research evaluator gained an explicit evaluationSeason option;default remains unchanged.429tests and clean production build pass;test verifies future target changes cannot alter fitted artifacts. Separate fitting run reproduces every next-season coefficient and residual exactly.

A fixed empirical comparator uses each player's most recent30positive-minute games within365days,minimum10,and48h result lag. Conditional exact-line OVER frequency has Beta(2,2) smoothing;no side flipping or balancing quota. Both original played/nonplayed role history and the existing baseline eligible-input gate remain.194eligible forecasts include13ties at0.5,so compare181common actual calls:empirical97correct,savedoriginal90,runtime88. Empirical UNDER29/66(43.9%) andOVER68/115(59.1%). Mean UNDER confidence65.9%;>=80%UNDER3/9. Pooled194probability Brier0.27291 vs runtime0.29980;paired probability improvement interval0.00216..0.05024 but still worse than constant0.5. Paired direction improvement interval -1.71..+12.06pp crosses0. Not promoted. Every empirical probability/input and call reproduces in a second replay.

All outcomes were already inspected before these experiments. These are retrospective development attempts, not untouched validation or proof that larger samples repair bias. Raw development MAE/CRPS populations differ between all-target baseline and played-only candidate, so their differences are not paired improvements. All exact-line comparisons explicitly use common eligible saved targets. No missing-stat/DNP-to-winning-UNDER conversion. No exact two-sided sportsbook price/ROI certification, no all-sport completion.

Full-history-summary.json is the compact comparison. Source lookup,protocols,models,reports,input rows,source fingerprints and output hashes are retained. Existing194line sample remains194;the larger stat archive does not create synthetic sportsbook quotes. No production model/forecast/history/price/hidden-sport settings changed. Frozen future17NBA and21NFL studies remain intact. P01 stays unchecked.

Reproduction from frontend after extracting the existing archive:

```
node scripts/evaluate-p01-nba-full-history.mjs /tmp/NEW-full-study /path/to/nba-context-population/opportunity-observations.json.gz
# copy immutable accuracy-audit.json.gz into the new study
node scripts/replay-p01-nba-full-history.mjs /tmp/NEW-full-study /path/to/nba-context-population/opportunity-observations.json.gz
node scripts/evaluate-p01-nba-empirical-history.mjs /tmp/NEW-full-study /path/to/nba-context-population/opportunity-observations.json.gz
```

The next-season replay currently uses its committed fixed candidate at the sibling study path. Both scripts use the existing61official final archive payloads. Source observations never receive historical forecast writeback.
