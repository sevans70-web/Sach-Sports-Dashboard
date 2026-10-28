# P01 NBA accuracy work — October 28, 2026

P01 is still unchecked. This work diagnoses the existing probability model, develops a separate calibration candidate, and freezes a future comparison. No live model, saved forecast, quote, historical result, hidden-sport setting or recommendation has been changed.

## Original forecast audit

The source returned 2,104 NBA archive records, 863 with saved probabilities. Selection used provenance and timing only: every supported numeric main-market probability for a fixture older than four hours, with exact saved side/line/quote identity and pregame timestamps. It did not select wins, losses, confidence levels or a preferred side. Earliest available original decision per market/fixture/player is retained. This is retrospective evidence, not a fresh holdout.

687 original decisions qualified. Exact official completed fixture IDs, fixture times and player statistics resolved 679 decisions across 50 fixtures; eight remain unresolved and were not converted to zero. The originals hit 366/679 (53.9%), versus average stated conditional confidence of 70.9%. Conditional Brier was 0.282104, worse than a constant 0.5 probability (0.25 Brier). That constant is not a no-vig sportsbook benchmark; this source lacks two-sided original odds. No betting-return claim is made.

The report includes every market and both original selection sides. Official response bytes, original normalized source, selection protocol, source hashes and all decisions are retained. Selection is limited to the archived probability cohort and does not represent all players. Model versions and original feature vectors are not available in this normalized source, so coefficient/input replay of those old forecasts is not claimed.

## Calibration development — not a promoted model

A fixed monotone per-market logistic calibration was trained on the earliest 30 fixtures and diagnosed on the latest 20, with all markets from a fixture kept together. Parameters and sample minimum were fixed in the development protocol. Earlier results had already been inspected; the chronological diagnostic is not an untouched validation claim.

On 323 paired diagnostic decisions, Brier decreased from 0.286438 to 0.253997. The fixture-cluster diagnostic improvement interval was 0.005962 to 0.053640. However, the candidate remains slightly worse than the constant 0.5 benchmark, steals became worse, and direction hits fell from 171/323 to 170/323. The OVER subset stayed 37/61; the UNDER subset fell 134/262 to 133/262. Better confidence calibration is not improved direction accuracy. The candidate is NOT promoted.

For the prospective study only, the fixed calibration was then fitted to all 679 known resolved records. Those coefficients were frozen before retrieving the future cohort. No fitting or tuning occurs in capture or scoring.

## Prospective NBA cohort

177 paired original/recalibrated probabilities were frozen before tipoff for 11 exact official upcoming fixtures on the October 28 Toronto slate: points 56, assists 34, rebounds 31, threes 29, blocks 17, steals 10. This is 11 independent games, not 177 independent games. Capture uses every eligible returned original forecast, without side, confidence, result or future-performance filtering. It retains the original saved probability, side, line, quote ID and timestamps separately from the new research candidate.

The official pregame fixture payloads and normalized archive source are retained. Cohort SHA256: a9e2c79b5bfac2f3747d6ff3483fbe6841e04b5ed3bd7e6285d3afbc773dede3. Candidate SHA256: fe951920f4bc272390a3fbbfa43928ecd077f63643032c2c5edd53f3b18d04b7. Every captured candidate probability reproduces exactly from its saved original probability and fixed candidate. Tampered cohort bytes are rejected before scoring or outcome requests.

The initial score report contains 177 pending, zero settled, null Brier values, complete:false, and zero outcome requests. The scorer waits for exact official finals, retains missing statistics as unresolved, excludes pushes from binary Brier, reports both original selection sides and candidate directions, and clusters paired intervals by fixture. It cannot promote a model or write production data. No automatic follow-up is installed.

After official finals, run from frontend into a NEW output directory:

    node scripts/score-p01-nba-calibration.mjs model-research/2026-10-28/p01-nba-prospective /tmp/p01-nba-after-finals

Offline replay:

    node scripts/verify-p01-nba-study.mjs model-research/2026-10-28

## Remaining P01 requirements

NBA prospective results are not available at capture time. The separate frozen NFL opponent-context cohort still awaits Carolina at Green Bay, October 29 at 8:15 PM Toronto. One NFL fixture cannot establish reliable accuracy. There is no new accuracy certification for CFB, NHL, CBB, Soccer, WNBA or MLB. Neither this retrospective audit nor a small prospective cohort justifies claiming all-eight-sport OVER/UNDER accuracy is fixed. P01 remains Needs verification until evidence supports an actual improvement; P03 odds/EV validation is separate.
