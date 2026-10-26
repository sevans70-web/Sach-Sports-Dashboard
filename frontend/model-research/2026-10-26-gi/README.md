# Market-specific GI calibration audit

The old rookie evaluator fitted 271 eligible calibration decisions across four
NFL markets together. The deployed passing-yards artifact inherited this pooled
fit. That count was incorrectly described as 271 passing-yard decisions.

Re-running the source-verified 639-quote corpus with separate market fits yields:

| Market | Earlier calibration rows | Earlier fixtures | Later forecasts |
|---|---:|---:|---:|
| Passing yards | 46 | 30 | 16 |
| Receiving yards | 75 | 30 | 31 |
| Receptions | 74 | 30 | 31 |
| Rushing yards | 76 | 31 | 32 |

Each market fails the existing 200-decision calibration minimum. No new numeric
GI artifact is approved. A fit from one market cannot score another market,
and runtime scoring now rejects artifacts without an authenticated group.

Reproduce from `frontend`:

    node scripts/evaluate-rookie-models.mjs model-research/2026-10-20/rookie-nfl /tmp/gi-market-audit

The evaluator verifies source checksums, preserves the original chronological
split, reads the checked-in compressed source files, and reports each market's
own sample size and calibration result. It does not rewrite source selections,
prices, historical outcomes, or production model artifacts.

A read-only October 26 database audit of saved featured/slate boards found these
upper bounds for newer distinct player/game candidates with available forecast
price comparisons and verified quotes: NFL passing 24/13 fixtures, receiving
68/12, receptions 66/12, rushing 36/13. NBA points 129/42, assists 134/43,
rebounds 130/44, threes 138/42, steals 115/38, blocks 96/37. Combination markets
had 50–53 candidates over 13–15 fixtures. WNBA markets had 7–11 over one fixture.
These are candidates, not authenticated settled calibration rows: timestamp,
identity, original odds, deduplication and official result checks remain required.
No usable candidates were returned for CFB, NHL, CBB, Soccer or MLB in this
specific board/forecast query; that does not establish those sports have no
historical records elsewhere.

Numeric GI remains unfinished. More eligible exact-price observations and a
later untouched evaluation set are needed. Lowering the minimum, pooling unrelated
markets or replacing calibrated return with a percentile of raw model edges would
not establish meaningful calibrated GI.
