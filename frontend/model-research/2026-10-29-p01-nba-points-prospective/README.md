# P01: points-only participation candidate — future-game freeze

Frozen 2026-10-29T14:10:01.573Z before all three official fixtures. The fixed participation-conditioned candidate and unchanged runtime baseline are compared on identical exact points lines and both prices. Seventeen paired targets; eight excluded for missing or uncertain prior role. No side, confidence, score or result filtering. Raw ranking response and official pregame summaries are embedded in cohort.json. Exact vectors, distribution values, model artifacts and input receipts are retained.

This is an independently frozen future-game test of the previously developed points model, not proof of improvement. Only three fixtures are represented. All 17 are initially pending. Candidate shifts toward OVER; no balance target or live promotion was applied. Other-market candidate models are archived for provenance but only points is evaluated. Both reconstructed forecasts are research forecasts, not a claim of the exact originally displayed live picks.

Run from frontend:

```
node scripts/verify-p01-nba-participation.mjs model-research/2026-10-29-p01-nba-points-prospective
node scripts/score-p01-nba-participation.mjs model-research/2026-10-29-p01-nba-points-prospective /tmp/NEW-unique-output
```

Scoring first verifies the frozen sources and replays all 34 forecasts and price comparisons. Exact official fixture time and final status are required. Explicit DNP is void; absent players or missing stats are unresolved, never converted to zero. Positive-minute zero stats remain valid. Reports distinguish all direction calls from the fixed confidence/EV research threshold selections, both sides, mean confidence, conditional Brier, price benchmark, returns, pushes and fixture-cluster intervals. Original historical grades are never written.

Validation: all 34 forecasts, vectors and prices reproduced; source/model hashes verified; tampered cohort rejected before scoring; 426 existing tests and production build pass. Initial NBA scoring: 17 pending, 0 resolved. Separate NFL status check: 21 pending, 0 resolved; no official result requests because fixture remains upcoming at scoring time. No automatic follow-up scheduled. P01 remains unchecked. Production coefficients and runtime snapshot unchanged.
