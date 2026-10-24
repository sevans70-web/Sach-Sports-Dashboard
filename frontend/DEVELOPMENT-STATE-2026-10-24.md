# Verified continuation baseline

Production is `sevans70-web/Sach-Sports-Dashboard`, branch `nextjs-migration`, Railway project `d4cb7865-6111-4d95-a66c-5323cbe19ad5`, service `680f3e3e-687b-422f-95cb-211d65ea167c`, environment `d503c6dc-0d49-41c4-96f2-cec25d3ea3e7`. Root `/frontend`, Railpack, build `sh scripts/build-with-backup.sh`, start `sh .next/standalone/launch-backup-safe.sh`, health `/api/health`.

## Storage and backup

Two 20,000 MB volumes exist: `9a8a2242-225a-4733-be41-4391a383aacf` mounted at `/data`, and unattached `acf94ac7-447e-4655-89a7-efcd244db39c`. Neither was modified. Packaging emits BACKUP_PACKAGE_OK; startup emits BACKUP_START then Google OAuth refresh HTTP 400 and BACKUP_EXIT_CODE=1. No recoverable completed backup was verified. PR #2 removed automatic history deletion from the startup backup script and deployed successfully. Do not delete or resize volumes. Restore Google backup OAuth authorization through the existing secure configuration; never request secrets in chat.

## Shared layout

PR #3 deployed Top Plays below the timestamp, swipeable game cards without the three-game truncation, and Rankings before Performance. MLB remains hidden publicly and receives the shared layout; Soccer's layout/discovery remains unchanged. Featured candidates currently come from the summary's default market, not every market. The model registry is empty, so qualified featured selections are correctly absent. First Basket currently exposes book-implied chances; there is no approved independent first-basket model.

## Jeremiah Fears

Player ID `5144091`. Prior complaint: current-season game missing from Last 5, plus concern about saved 24.3 projection / OVER 11.5. NBA history hardcoded 2025/2026, omitting ESPN 2027 season. PR #4 fixed rollover and pregame filtering. Live endpoint confirmed game `401909839`, October 22 UTC (October 21 ET), Indiana, 8 points. It also exposed preseason contamination; follow-up filters explicitly to Regular Season. NBA/CBB use ending-year seasons, WNBA calendar years. Filter before Last 20, deduplicate event IDs, reject missing/nonnumeric components rather than use zero. Original predictions remain unchanged.

The runtime snapshot's latest Jeremiah observations are April 13, 2026. NBA does not perform the NFL/NHL live observation refresh in `attachFittedResearchForecasts`. The chart repair therefore does not repair or independently validate his forecast inputs. Current-season role/usage ingestion and independent price calibration remain required.

## Bounded live history checks

Week responses read October 24 around 00:54 ET. NBA: 211 records/211 unique keys; research hits 110, misses 95, pushes 6. NFL QB scope: 107 records/107 unique keys; 52 hits, 48 misses, 7 void. WNBA: 76 records/76 unique keys; 44 hits, 31 misses, 1 push. CFB/NHL/CBB default Week responses were connected and empty. Empty responses are not proof that older history is absent or correct. These are API consistency checks, not independent official-stat grading audits. Validated totals remain zero because the approved model registry is empty.

## Remaining work

- Verify a recoverable Drive backup after OAuth repair, including remote checksums and a restore test.
- Audit all original lines, timestamps, rankings, participation and official grades across NBA/NFL/CFB/NHL/CBB/WNBA/MLB. Current live checks cover only the scopes above.
- Repair NBA current-season forecast inputs before treating Jeremiah's saved estimate as reliable; preserve original outputs and append correction evidence.
- Independently validate model probabilities and GI; do not populate the approved registry to remove No Pick states.
- Aggregate qualified Top Plays across all supported markets after validation, and build supported first-basket modelling.
- Complete enhanced game projections/intelligence, card consistency, live progress and per-sport checks.
- Verify hidden-sport admin records against real owner authentication and volume coverage. The local integration uses a mock Auth server; signed-out production redirects were verified, real owner sign-in was not performed.
- No paid services, OWL upgrades, destructive storage actions or public MLB/Soccer reactivation were performed.
