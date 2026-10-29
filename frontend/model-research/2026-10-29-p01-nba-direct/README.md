# P01 NBA direct-stat candidate — October 29, 2026

Research only. No live model or historical selection changes.

Fixed before evaluation: direct stat-total ridge regression versus separate minutes-times-rate regression, identical pregame context, 48-hour result lag, chronological development split and workload-conditioned residual distributions. Input is the retained 75,882-row NBA runtime census, not the larger original training census. The later season was already inspected, so no untouched validation claim.

All six markets had 3,193 development targets each. Direct-stat mean absolute error improved points (5.6414 to 5.5347), rebounds (2.2691 to 2.1950), steals (0.7364 to 0.7276), blocks (0.5052 to 0.4914); worsened assists (1.5806 to 1.5913) and threes (0.9960 to 0.9968). Distribution CRPS improved in five markets; assists worsened.

Separate retrospective saved-line diagnostic: 668 paired rows from the earlier 679 settled original audit; 11 lack eligible reconstructable inputs. Reconstructed existing model 361/668 correct; direct candidate 339/668. This baseline uses the original runtime coefficients and currently archived lagged inputs, not exact original feature receipts. Candidate training uses the retained subset, so this comparison does not isolate architecture effects. Target final boxes supply fixture/player team/home identity only. No target actual, minutes, usage or starter status enters the feature vector. No two-sided-price or ROI evidence.

Candidate rejected for direction promotion. Smaller point errors are not sufficient evidence for choosing a side at sportsbook lines. Neither this candidate nor prior probability recalibration repairs P01. Future candidates must be evaluated against exact lines and independently frozen future outcomes. The frozen NFL cohort remains upcoming October 29 at 8:15 PM Toronto. No synthetic results or guessed zeros.

Reproduce from frontend:
node scripts/evaluate-p01-nba-direct.mjs /tmp/NEW-study
node scripts/replay-p01-nba-direct.mjs /tmp/NEW-study

Original frozen protocols, receipts, cohorts, runtime snapshot and historical forecasts remain unchanged.
