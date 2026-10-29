# N05: authentic first-quarter markets

Scope: the tracker explicitly covers NFL, CFB and NBA. This extends the existing dashboard; no model coefficients, original forecasts, grades, frozen cohorts or hidden-sport settings are changed.

## Changes

- CFB now has Q1 passing, rushing and receiving yardage tabs and native API market keys. Both ranking endpoints use only authentic period-specific primary/supplement quotes, require an official fixture and roster identity, and retain their exact line and both prices. No full-game roster/leader fallback or quarter forecast is substituted.
- CFB Q1 player history reads completed exact official fixtures, derives quarter observations from play-by-play reconciled against official box-score counts and yards, and retains unknowns when incomplete. Live and performance paths use that same parser, never full-game yardage.
- Shared football, basketball and hockey quote receipts retain normalized market/period plus original provider category/period. Existing historical receipts are not backfilled. This preserves source identity when the shared quote parser normalizes categories.
- NBA Q1 result attribution uses the exact official player ID when supplied, takes the current official name, and abstains for missing IDs, DNP or ambiguous names. The prior removal of full-game/4 quarter estimates remains in effect.
- Updated the stale regression assertion that still expected NBA full-game/4 despite its removal in PR103.

## Evidence

`production-before.jsonl`: all three NFL markets return successful verified quarter rows (2 passing, 3 rushing, 10 receiving); NBA's five quarter markets have zero current verified quotes. CFB previously rejected the new Q1 keys with HTTP400. Counts are a timestamped coverage snapshot, not promises of permanent provider coverage.

`official-observation-audit.json`: read-only replay of 13 archived NFL finals, 3 newly retained CFB finals and 11 archived NBA finals. The report distinguishes reconciled values from unknowns and records source SHA256. NFL known counts: 79 passing,232 rushing,243 receiving; CFB61,38,23; NBA201 eligible player observations per supported quarter market. These counts include certified zeros and do not certify model accuracy or prove sportsbook quote availability. No saved predictions were regraded by this audit.

`cfb-official-finals.json.gz`: three official completed CFB summaries, source URLs and exact fixture IDs. The other archives remain at their original committed paths.

Reproduce with `node scripts/audit-n05-quarter-coverage.mjs /tmp/NEW-unique-report.json` from frontend. Output is exclusive-create, avoiding accidental replacement of evidence.

Quarter data missing from an active provider feed must remain unavailable. Completion requires confirming actual CFB/NBA Q1 quote coverage and quote-to-official-quarter results; test fixtures and historical observation availability alone do not establish that end-to-end path. No validated quarter model is claimed and P01 remains separate.
