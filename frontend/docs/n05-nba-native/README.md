# N05: connect native NBA quarter data

Sach clarified on2026-10-29 that N05 covers NBA and NFL only. CFB is excluded from N05 acceptance and remaining-work criteria; its earlier research and history are preserved.

## Root cause and change

The merged OWL NBA endpoint omits quarter markets, while the already included FanDuel native endpoint supplies them. The native source had only been inspected by diagnostics. `source-discovery.json` preserves the successful source check with open player Q1 main lines and milestone examples, exact runner prices, event identity and freshness metadata; no credentials are present.

The existing native source cache (also used by first basket) now supplies Q1 points, rebounds, assists and made threes to the existing NBA ranking path. This adds no plan, subscription, provider or credential. Points main lines require exactly one active OVER/UNDER pair, the same named player and the exact same threshold. N+ milestones keep their original integer target and one-sided price. Main pairs take stable preference over milestones; otherwise use the lowest offered N+ target. Never invent an UNDER price or convert N+ to a different O/U line. Q1 PRA remains unavailable unless actually supplied.

Each row requires a fresh source receipt, an open market, active runners, a unique future official NBA fixture within the existing15-minute advertised/court-tip tolerance and unique current-roster player identity. Wrong periods, full-game/team markets, ambiguous names, stale feeds, missing pairs and mismatched lines are rejected. Injuries still pass through the existing official availability filter. Public quarter cards can show verified quotes without a fitted model; no new forecast, probability, EV or recommendation is manufactured. Historical quote-only boards remain separate from model selections.

NBA quarter history now reads up to8 prior exact completed official fixtures and the existing reconciled quarter scorer. It never reuses full-game player totals. Official live-player rows also carry separate nullable Q1 stats; incomplete/unreconciled Q1 stays unknown and clears stale quarter progress. Shared milestone labels use correct statistic units and exact-target history counts N+ as reached. The actual first-quarter values can appear after the quarter completes; a partial quarter is not labelled final.

NFL live lookup confirmed15 genuine quarter quotes across passing(2),rushing(3),receiving(10), with Caesars main pairs and BetMGM one-sided milestones distinguished. NFL historical and quote receipts, all model coefficients, original forecasts, grades, frozen cohorts and hidden sports are preserved.

## Validation

Native parser regressions cover exact pair prices, identity/fixture binding, stale/suspended/wrong-period feeds, missing/mismatched pairs, each supported milestone, stable deduplication, exact-target history and public quote-only cards. Full suite458tests and production build pass before release. Independent official-quarter parser regressions remain in the suite. Production row counts and browser verification belong in the completion tracker after exact deployment READY; no prospective accuracy claim follows from displaying quotes.
