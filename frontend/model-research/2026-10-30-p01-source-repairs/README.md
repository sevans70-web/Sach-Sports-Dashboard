# P01 source coverage repairs — October 30

P01 remains open. These repairs restore the ability to collect and evaluate legitimate pregame forecasts; they do not demonstrate improved forecast accuracy or promote a candidate.

The bounded live source audit found 8 NHL feed fixtures / 4,319 raw props, including 858 shots-on-goal props. Those raw counts are not counts of fresh, executable or official-fixture-matched quotes. Three current games use full provider names and advertised puck-drop times seven minutes after the official schedule; the official scoreboard uses team common names. NHL now uses same-season official standings aliases, accent normalization, unique two-team fixture resolution and an explicitly NHL-only 15-minute schedule tolerance. It retains original provider matchup/time alongside canonical official identity. Unmatched, stale and ambiguous quotes remain excluded. Standings follow the Toronto calendar date.

The CBB feed has 3 fixtures / 57 raw props. The official November 1 Notre Dame–Villanova fixture is explicitly neutral. Provider order is Villanova @ Notre Dame; official order is Notre Dame @ Villanova. Official full/short school names and abbreviations are retained. Reversed source order is accepted only when the official schedule explicitly says neutralSite:true, with both exact school identities, time and a unique fixture still required. Official home/away identity remains the model input. Provider order/time remain separately traceable. Nonneutral and unknown-venue reversals stay excluded.

College basketball now refreshes complete official current-season fixture censuses using the same bounded, cached pipeline as NBA: regular season only, 48-hour result lag, 21-day recent window, reconciled two-team totals and up to 64 fixture reads. Caches are isolated by sport. Missing/failed evidence withholds affected forecasts; no previous-season replacement is invented. The current three-appearance requirement still applies. This refresh is infrastructure readiness, not a claim that sufficient 2026–27 history already exists.

Evidence files contain bounded live feed summaries and clearly identified official identity excerpts, with original-response hashes. They are not untouched accuracy datasets or complete raw provider archives. Existing frozen NBA/NFL/CFB cohorts, model coefficients and historical forecasts/grades/prices are unchanged.

Validation: 587 tests pass and production build passes. Regression coverage includes aliases, accent handling, wrong teams/date, duplicate fixtures, explicit time bounds, neutral-only reversal, actual scoreboard field integration, college league/season routing, totals reconciliation and the 48-hour lag. Final production verification and observed quote counts are recorded in the Completion Tracker after release.

## Remaining quote ingestion follow-up

The subsequent bounded CBB field audit confirms fresh FanDuel paired main prices, including Braeden Shrewsberry (ND) at13.5 (-118/-110). School suffixes were still part of the name lookup. They are now separated from names, retained as provider evidence and checked against the matched current team; conflicting tags are rejected. DraftKings examples are one-sided milestones and remain excluded from OVER/UNDER price validation. The integration test now exercises a tagged player through the actual CBB ranking builder.

A live CFB diagnostic returned the healthy 13,316-prop primary feed in4.88seconds; its passing quote parser reproduced76 accepted source rows at the response timestamp. The route's4-second primary-feed budget could discard that response and enter slower fallbacks. The primary budget is now8seconds within the unchanged27-second route deadline. This changes data loading only, not fitted forecasts, selections or accuracy claims.

The first deployed NHL check returned14 verified shots quotes and15 fitted forecasts in15 rows. Its exact pregame board and compressed/raw SHA256 receipts are retained separately. This is source-coverage evidence, not a paired prediction-improvement cohort. An attempted six-market NHL capture returned a timeout; no archive-success claim is made from that request.
