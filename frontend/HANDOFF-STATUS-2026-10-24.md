# Sach Sports handoff status — October 24, 2026

This checklist distinguishes deployed work from changes prepared for review. Production at this update is commit `405f54cba3a0ebb52c9467919bba175bf747e9e2`; Railway deployment `d82d63fd-5ebe-4404-9347-b609c114591c` reached SUCCESS. PRs #2–12 have merged; native fixture/price metadata verification is the current follow-up. No destructive volume operations or new subscriptions were performed.

| Handoff requirement | Verified state | Remaining work |
| --- | --- | --- |
| 1. Continue existing project | Located repository, production branch, infrastructure, shared components, records and previous development notes. Existing application retained. | Ongoing reconciliation of all defects against live behavior. |
| 2. Backup/storage | Source deletion removed in PR #2. OAuth repaired; backup resumed October 24. Downloaded and parsed a 54,313-byte NHL backup file containing 65 records. | Backup job completion verified at 06:37 UTC: 1,118 files, 14,680,181,077 bytes, no errors, exit 0. Full source/remote checksum coverage, deterministic restore selection where duplicate filenames exist, and broader recovery verification remain. No volume cleanup is authorized. |
| 3. Shared structure | PR #3 deployed hero/timestamp, Top Plays, swipeable Games, Rankings, Performance. | PR #8 removed duplicate Snapshot blocks and restored three compact game cards plus roughly two Top Plays cards on phones. PR #9 moved full Prediction Performance to its own dashboard at the user’s request. Broader iPhone/iPad regression remains. |
| 4. Top Plays | Compact carousel deployed with four basketball categories and no-pick states. No fabricated odds or model probabilities. | PR #10 connects NBA/WNBA/CBB/NHL captures across markets; the live endpoint returned multiple markets and 79 verified quotes. PR #12 retains current-board fallback where aggregate captures are unavailable. Independently qualified models remain unapproved; no pick is invented. |
| 5. Games | Swipeable game cards retained without previous three-game truncation. | Enhanced validated winner/score/total projections, market comparison and full injury/matchup intelligence. |
| 6. Rankings | PR #6 retains the frozen overnight NBA slate while any game is live; Previous/Today/Tomorrow access separates daily boards. Previous API verified 25 frozen ranks. | Further overnight end-to-end checks, all-sport lineup/progress/status/card consistency and validated probability/GI. |
| 7. Player intelligence | Basketball Last 5/10/20 season rollover, pregame filtering, duplicate-game filtering and preseason exclusion deployed in PRs #4–5. | Complete explanations, matchup/minutes/role/injury evidence and mobile experience across sports. |
| 8. Historical validation | Bounded official-stat and saved-selection arithmetic checks below. Original calls/lines retained. | Full original line provenance, projections, snapshots, DNP/void/pending reconciliation, all dates and all sports. |
| 9. Sports | Shared non-Soccer layout covers NBA/NFL/CFB/NHL/CBB/WNBA; MLB remains hidden publicly. | Sport-specific and historical checks remain, including MLB reactivation readiness. Soccer excluded from redesign/validation. |
| 10. Performance | Today/Yesterday/Week/Month/Season and categories retained on a separate dashboard, linked near Last Updated and from navigation. Audited returned-record uniqueness in NBA/NFL/WNBA/NHL/CBB snapshots. | Complete count reconciliation including voids, pushes, pending, late recovery and hidden archives. |
| 11. Defects | Midnight NBA reset repaired. Jeremiah's missing new-season game repaired in chart. | PR #8 deployed NBA role-data refresh and basketball settlement season/final guards. PR #11 made NBA Q1/First Basket empty states explicitly say No Qualified Picks. Picks/GI, all progress/status and flicker defects are not certified complete. |
| 12. Sportsbook comparison | No new purchase, OWL upgrade or fabricated pricing. | Provider/Canadian regional/API/cost feasibility and comparison integrations remain future work. |
| 13. Admin | PR #5 includes hidden MLB/Soccer historical access, original raw fields and signed-out auth protection. | Real owner-session verification and complete hidden-volume coverage. |
| 14–16. Testing/deployment/reliability | PRs #2–12 deployed with terminal SUCCESS checks. Latest full suite: 261 tests passed; production build and TypeScript checks passed. Top Plays endpoint and Q1 tab tested live. | Overall handoff remains incomplete: qualified period/scorer models, full historical integrity coverage, enhanced intelligence and broad device/admin regression are not certified. |

## Independent audit results in this continuation

| Sport/period | Returned records | Official-stat + saved-call arithmetic verified | Still unverified | Grade discrepancies found |
| --- | ---: | ---: | ---: | ---: |
| NBA / Week | 211 | 211 | 0 | 0 |
| NFL / Week, QB + Offense + Q1 scopes | 450 | 248 | 50 settled records | 0 among verified |
| WNBA / Season | 154 | 152 | DNP/void/pending outside grade check | 0 among verified |
| NHL / Season | 295 | 177 | DNP/void/pending outside grade check | 0 among verified |
| CFB / Season | 73 | Not certified by stricter coverage audit | Initial check found no discrepancy across 60 settled records, but did not distinguish unavailable evidence | Not a full pass |
| CBB / Season | 0 | 0 | No returned history; this does not prove absence on all storage | Not a pass |
| MLB / October 23 snapshot | 235 unique entries | 149 statistical values | 44 nonparticipation entries; 42 absent from the game box | No mismatch among 149 values |

The 788 verified records are result-arithmetic checks against provider stats and original stored selections. They are **not** verified historical sportsbook prices, calibrated predictions, profitable betting results or model certification. NFL's 50 unverified settled records comprise 26 unsupported/missing fixture or sequence-market cases and 24 unavailable official player-stat cases. No duplicate keys were found in the stricter returned-record snapshots for NBA/NFL/WNBA/NHL/CBB; raw ranking refresh archives are not covered by this statement.

The timestamp scan flagged 96 NHL and 2 WNBA records saved at/after scheduled start. A restored NHL shots file contained 13 such records, all already VOID. These are recovery entries in that sample, not late wins. All remaining timestamp cases need record-level review. No timestamps or original predictions were rewritten.

## Repair batch deployed in PR #8

- NBA research forecasts discover recent current-season games through ranked players' official logs, then ingest reconciled complete two-team box scores for minutes, usage, pace and opponent context. Regular season only; the existing 48-hour research availability lag remains. Source failures/incomplete evidence withhold affected forecasts. Frozen/started cards are untouched.
- Live source check for Jeremiah Fears (`5144091`) loaded game `401909839`, October 22 UTC, season 2027: 8 points, 21 minutes. The original saved 24.3 / OVER 11.5 is preserved, not retroactively replaced or declared validated.
- NBA/WNBA/CBB grading fallback uses each saved fixture's season and a player+season cache key instead of hardcoded 2026.
- WNBA/CBB full-game grading now waits for the exact fixture to be officially complete. NBA's existing final guard also verifies fixture identity. Period/scorer markets retain separate rules.
- Non-Soccer dashboards omit the duplicate Snapshot block. Top Plays empty-state explanations use simpler public wording.
- Audit tooling requires a captured local JSON export and reads official sources. Missing/unsupported evidence is counted as unverified, never as a passed grade. Automatic review rejected another NBA production-performance request because those routes may settle records; the successful NBA rerun used the already captured local snapshot instead.

## Next priorities

1. Finish backup coverage/recovery verification without clearing or resizing volumes.
2. Verify exact native period-market fixtures and standalone prices before connecting them to the rankings.
3. Audit remaining 50 NFL cases, all pending/void/DNP records, timestamp recovery cases and MLB legacy snapshots through read-only exports.
4. Independently validate current models/probabilities/GI before enabling qualified featured picks; extend all-market Top Plays to remaining capture paths and complete supported first-basket modelling.
5. Finish enhanced game/player intelligence, mobile regression and real admin-session verification.

## MLB read-only recovery audit

Downloaded the October 23 Drive performance snapshot (582,933 bytes; SHA-256 `46e72764847affbf4f2ce31a4b673486711b50e25b13d17f32887fac9f17417e`) and checked official MLB game 849805. Of 235 unique category/player/game entries, 149 statistical values and their team/opponent identity matched. Forty-four entries had no qualifying participation (42 legacy Miss labels and 2 legacy Hit labels), and 42 had no matching player box entry. All 235 first-seen timestamps were after the scheduled start. No source record was changed. These are reactivation blockers, not verified pregame betting results.

The admin mapping now retains legacy projection/GI values for inspection, first-seen time separately from snapshot capture, team/matchup and explicit review limitations. It does not manufacture a calibrated probability from legacy home-run/benchmark percentages. The inspector labels stored outcomes Saved actual rather than claiming independent official verification.

## Requested compact card sizing

Following the user's two iPhone screenshots, restore three visible game cards across the shared swipe row and reduce Top Plays to approximately two visible cards on phones (four on wider screens). Clamp game context to two lines, retain logos/time/status and horizontal scrolling, and keep Soccer's grid unchanged. Deployed and verified in PR #8. Full Prediction Performance moved off the main dashboard in PR #9.

## NBA Q1 / First Basket evidence collected October 24

Collected all 1,813 fixtures identified in the existing runtime census: 1,805 usable event records, 1,762 reconciled Q1 scoring tapes, and 1,801 first-score labels. Original compressed responses and SHA-256 provenance are preserved in `Sach-NBA-Event-Census-2026-10-24.tar.gz`, Library file `libfile_bcaa72ea165c81919418eddb622e6d28`. First score includes free throws and is distinct from first field goal.

Quarter-specific research used 7,572 training, 4,284 calibration and 13,693 test rows across 884 test fixtures per market. Points forecast MAE improved just 0.154%; rebounds, assists and threes were worse than the comparison baseline. This does not approve any model. Exact evaluation and limitations are in `model-research/2026-10-24-events/`.

Live merged OWL coverage: eight games, 3,378 props, zero Q1/First Basket markets. The included FanDuel native Source API is fresh and exposes Q1 two-runner markets, quarter milestones, and First Basket markets labelled SAME_GAME_MULTIS. Milestones cannot substitute for two-way lines; SGP-only prices cannot substitute for standalone First Basket prices. Native event/start/quote verification remains separate from model approval.
