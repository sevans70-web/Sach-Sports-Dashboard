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

## CFB parser follow-up

The deeper final-archive check exposed that the initial coverage counts were largely reconciled zeros: NCAA play text has `Shotgun`, `No Huddle-Shotgun` and `#jersey` prefixes, unlike the NFL examples. The follow-up parser removes those structural prefixes while preserving team and unique player identity; it also accounts for NCAA sacks as rushing attempts/yards only when the official header identifies college football. The full-game yardage AND workload reconciliation remains mandatory. Unknowns are retained.

`official-parser-followup.json` preserves the new replay separately from the initial report. NFL and NBA counts are unchanged; CFB known observations increase to64 passing,63 rushing,65 receiving. This now includes actual nonzero passer/rusher/receiver values. A fixed official regression checks Bear Bachmeier's three Q1 completions (15+11+27=53 yards) against his257 full-game yards, his13 Q1 rushing yards versus37 full-game, and rejects truncated tape. A separate NCAA/NFL test prevents applying the college sack rule to NFL.

`production-after.jsonl` verifies the first release's11 quarter endpoints: all HTTP200/success; NFL2/3/10 verified quote rows; CFB3 supported empty yardage endpoints, NBA5 supported empty endpoints; no model projection/probability fabricated.

The primary CFB diagnostic at approximately19:36UTC showed66 events/10,958 props, including989`touchdowns_1q` offers but no quarter-yardage categories. TD scorer offers are separate contracts and are not substituted into yardage tabs. NBA primary coverage at19:27UTC showed3,198 props, only full-game categories, and0 matched/priced Q1 markets. These are current feed limitations, not proof that all quarter products are unavailable permanently. CFB Q1 touchdown integration and its official scorer settlement are not certified by this release. N05 remains open.

## Scope correction from Sach

N05 acceptance is NBA and NFL only. CFB is excluded. The later native FanDuel source discovery also corrects the earlier broad NBA-source-gap conclusion: NBA quarter prices exist in the included native source, and require the adapter documented in `../n05-nba-native/README.md`. Original coverage snapshots above remain historical observations of the merged endpoint, not a claim that all OWL sources lack quarter prices.
