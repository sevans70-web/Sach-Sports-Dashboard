# Grading audit — October 18, 2026

The screenshot sample was compared with saved calls and ESPN final boxscores. A saved UNDER is a hit below the frozen line and a miss above it. Huntley: 165 against UNDER 161.5 is a miss. Rodgers: 253 against OVER 226.5 is a hit. Braelon Allen: 78 against UNDER 65.5 is a miss. Roschon Johnson: 51 against UNDER 22.5 is a miss. These samples agree with the official feed.

The initial NFL audit examined 185 full-game final records. Of these, 116 already had hit/miss/push grades with comparable official statistics. No reversed grades were found in that comparable subset. Ten records lacked exact player/stat evidence; the remainder were not already settled comparable calls. This is not a claim that every saved result is correct.

Two stale official totals were found for Tyler Shough, game 401873000: QB rushing yards 31 → 32, and passing plus rushing yards 175 → 176. Neither changes its saved outcome.

The Week checks returned NBA 98 settled records, CFB 61 and WNBA 76 with no correction findings. NHL returned 58 settled records under the previous 100-record response cap; one stale actual was found: Sergei Murashov saves 13 → 14 in game 2026020134, still a miss against OVER 26. CBB had no Week records to audit. These checks exclude first-scorer and quarter sequences, and do not certify unsupported/missing evidence.

## Repair

All six active sports now recheck settled full-game records against completed official fixtures and exact player IDs. Changed actuals/outcomes append `gradeRevisions` containing the previous actual, outcome, grading timestamp, updated values and source. Persistence accepts extensions of this audit trail while preserving the original saved line, side and forecast. Capture refreshes cannot reverse a correction. The private result inspector displays recorded revisions.

NFL pending full-game settlement now uses the shared official-stat adapter. It no longer uses substring player matching, day-only gamelog fallbacks, or treats a missing component of combined yards as zero. Missing evidence remains unresolved.

NBA, WNBA, CBB and NHL performance responses no longer truncate history to 100 entries before computing guarded totals.

## Reproduce

Run `node scripts/audit-live-grades.mjs [origin] [output.json]`, followed by `node scripts/compare-grade-audit.mjs input.json [comparison.json]` for the detailed NFL snapshot comparison. Run `node scripts/audit-sport-grades.mjs [origin] [sport] [period] [output.json]` for a full-game correction check for any active sport. Scripts read the normal performance APIs (which may perform their normal settlement/reconciliation) and official feeds; scripts never submit replacement grades.

Validation: 129 regression tests, a production build, and the production-route admin authentication integration test passed before release.

## Still unfinished

Quarter and first-scorer markets require a separate complete play-by-play audit. They are deliberately excluded from full-game reconciliation. Missing provider/player evidence must not be interpreted as a verified zero. The model registry remains empty; historical research hit rates are not evidence of a validated forecasting model. GI and actual validated picks remain unfinished. Supabase production Auth URL configuration remains blocked by a saved browser permission; deploying this grading repair does not correct that provider setting.
