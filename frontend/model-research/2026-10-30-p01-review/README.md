# P01 — October 30 review and larger prospective tests

P01 remains open: reliable OVER/UNDER improvement has not been demonstrated. Active scope is NBA, NFL, NHL, CBB and CFB; Soccer/MLB/WNBA remain deferred. All runtime coefficients, original picks, historical grades/prices and original frozen cohorts are unchanged.

## Completed prospective scoring

| Frozen test | Official result coverage | Baseline directions | Candidate directions | Probability error (Brier; lower is better) |
| --- | --- | --- | --- | --- |
| NBA points, frozen October29 | 16 resolved of17,3 final games;1 player lacks explicit final stat | 11/16 | 11/16 | 0.214094 →0.211220; book0.247452 |
| NFL matchup, frozen October28 | 21/21 resolved,1 final game | 8/21 | 9/21 | Passing0.306040 →0.337218; rushing0.526174 →0.703946; receiving0.254792 →0.252367; receptions0.263740 →0.263881 |

NBA candidate directions are15 OVER (10hits) and1 UNDER (1hit); baseline7 OVER (6hits) and9 UNDER (5hits). Candidate confidence averages78.1% versus68.75% realized accuracy. Its>=80% subset has6/8hits against91.0% mean confidence. A single successful UNDER cannot establish an UNDER repair. NFL's21 correlated forecasts are one independent game. Neither candidate is promoted. Exact two-sided prices, selection-side returns, confidence summaries and missing-stat accounting are retained in the scored reports. Research selection counts differ from all majority-probability directions.

The official response archives have checksums and replay without network access. NFL research scoring now requires the exact official kickoff and both teams as well as the final fixture ID; explicit DNP, unknown final stats and pending games remain separate. All directional calls, fixed-threshold selections and confidence summaries are reported; reporting improvements are not prediction improvements.

## Larger tests frozen before outcomes

| Sport | Targets | Independent games | Candidate / benchmark |
| --- | ---: | ---: | --- |
| NBA points | 21 paired | 8 | Same fixed participation candidate and runtime baseline |
| NFL passing/rushing/receiving/receptions | 165 paired | 12 | Same fixed opponent-context candidate and runtime baseline |
| CFB passing/rushing | 28 | 18 | Already archived October24 candidate versus exact no-vig book probability; no missing CFB runtime baseline is invented |

All214 future targets retain exact lines, both prices, timestamps and input receipts. All400 model forecasts (42NBA+330NFL+28CFB), prices and source/model hashes reproduce. NBA and CFB retain full ranking and official pregame responses; NFL's existing capture format retains quote values, response hashes and official fixture metadata. CFB uses its pre-existing fixed archive with incomplete weekly coverage; no refit or production enablement occurred. Rejected rows retain reasons. No side balancing, outcome filtering or coefficient tuning was applied.

Initial scores: NBA21pending, NFL165pending, CFB28pending; zero final-result requests. NBA games start October30 evening Toronto; CFB/NFL times are recorded exactly in summary.json. No automatic follow-up has been scheduled. Later scoring requires an explicit run after official finals. These samples may still fail or remain insufficient; a freeze is not a completion certificate.

Cohorts are losslessly gzip-compressed; original decompressed bytes and SHA256 receipts remain exact. The CFB verifier compares JSON-persisted distributions canonically because JSON represents negative zero as zero; no prices, projections or probability calculations change.

## Other active scope gaps

The bounded live audit records the exact production responses, not a claim about every market:

* NHL shots:15 rows and15 fitted projections,0 verified prices. No exact-priced direction evaluation can be certified from this response.
* CBB points:23 rows,0 verified prices and0 available fitted projections; player/team history is unavailable. Coverage and prior inputs need repair before a usable prospective model comparison.
* CFB passing:25 verified prices, no production-fitted CFB model. The separate archived candidate is now under future exact-price testing; receiving/combination/scorer/quarter coverage is not certified.

NBA's original unresolved player stat stays unresolved. Better confidence error alone, a tie in hit rate, or one extra correct NFL call cannot close the five-sport accuracy item. A successful candidate still needs adequate independent games and both-side coverage, calibration and return evidence, followed by deployment and live verification.

## Reproduce from frontend

```
node scripts/verify-p01-nba-participation.mjs model-research/2026-10-30-p01-nba-points-prospective
node scripts/verify-p01-football.mjs model-research/2026-10-30-p01-nfl-prospective
node scripts/verify-p01-cfb.mjs model-research/2026-10-30-p01-cfb-prospective
# Reproduce completed scores from immutable official archives into NEW directories:
node scripts/score-p01-nba-participation.mjs model-research/2026-10-29-p01-nba-points-prospective /tmp/NEW-nba-score model-research/2026-10-30-p01-nba-points-scored
node scripts/score-p01-prospective.mjs model-research/2026-10-28-p01-prospective-verified /tmp/NEW-nfl-score model-research/2026-10-30-p01-nfl-scored
# Later, after exact official finals, score each new cohort into a NEW directory:
node scripts/score-p01-nba-participation.mjs model-research/2026-10-30-p01-nba-points-prospective /tmp/NEW-nba-future
node scripts/score-p01-prospective.mjs model-research/2026-10-30-p01-nfl-prospective /tmp/NEW-nfl-future
node scripts/score-p01-cfb.mjs model-research/2026-10-30-p01-cfb-prospective /tmp/NEW-cfb-future
```

Checks:574 tests pass; production build passes. Regression coverage rejects corrupted official archives, changed payloads, wrong fixture/kickoff/teams, false missing-to-zero grades and participation conflicts. An offline CFB end-to-end test replays actual frozen model inputs against explicitly synthetic test-only final payloads, rejects wrong kickoff and performs no network access. Historical forecasts/grades are never written by these tools. Runtime snapshot SHA256 remainsb45c4ce8bafb7395c4742c7a58572f1cf51dc137455df9fb16453a3c0fb88080.
