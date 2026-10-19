# Void and availability notes

Admin account/password controls are at the top, collapsed by default. Every void entry includes an explanation beside its result and in expanded details. Availability is displayed separately, with provider source and retrieval time when available.

Historical flags establish some void reasons without guessing: removed from the board before start; captured after start; no recorded line. Other old records did not preserve their original void reason and are explicitly marked as unknown. New NHL grading writes the reason when it voids an unscoreable entry. No prior statuses or records are rewritten by explanatory enrichment.

The October 18 Week audit found 145 withdrawn NFL records, 96 late NHL captures, 40 NHL records without a recorded cause, 13 CFB records without a recorded cause, and two late WNBA captures. NBA and CBB returned no void entries in that scope. These are records, not necessarily unique players.

Admin reads the exact fixture's official report for each saved player ID. An explicit DNP, reported injury status, or confirmed basketball bench appearance can add an availability note. Missing final rows are described as missing evidence, never proof of injury/DNP. Current injury reports do not establish the historical cause of a void. Some providers, notably NHL boxscores, do not supply injury reasons; those cannot be reconstructed reliably here.

The shared live-stat endpoints expose the same official availability notes to all six active dashboards. Notes can reach a card without any player statistic/participation row. Pregame cards check availability before the old two-hour window, with a five-minute interval farther from start and one minute near start. Bench status is reported separately and does not automatically change a saved grade. Voided research cards cannot display a hit/miss check derived from an observed total.

Historical data, backup configuration, retention, Railway storage, and model eligibility are unchanged. GI and validated models are not part of this repair.

Validation before release: 134 regression tests, production build, and the production-route admin integration test passed. The integration test checks a saved late-capture void explanation and the account section's position before the result inspector.
