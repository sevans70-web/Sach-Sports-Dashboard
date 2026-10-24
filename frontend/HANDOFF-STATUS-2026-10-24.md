# Sach Sports handoff status — October 24, 2026

This checklist distinguishes deployed work from changes prepared for review. Production at the time of this update is commit `518b379930292f038fe5ce8c5123722abfb272fe`; Railway deployment `1ac0ab53-3cb4-445e-a805-1e711edaa039` reached SUCCESS. No destructive volume operations or new subscriptions were performed.

| Handoff requirement | Verified state | Remaining work |
| --- | --- | --- |
| 1. Continue existing project | Located repository, production branch, infrastructure, shared components, records and previous development notes. Existing application retained. | Ongoing reconciliation of all defects against live behavior. |
| 2. Backup/storage | Source deletion removed in PR #2. OAuth repaired; backup resumed October 24. Downloaded and parsed a 54,313-byte NHL backup file containing 65 records. | Full job completion, full source/remote checksum coverage, deterministic restore selection where duplicate filenames exist, and broader recovery verification. No volume cleanup is authorized. |
| 3. Shared structure | PR #3 deployed hero/timestamp, Top Plays, swipeable Games, Rankings, Performance. | Current repair removes duplicate Snapshot block for non-Soccer dashboards. Full iPhone/iPad regression remains. |
| 4. Top Plays | Compact carousel deployed with four basketball categories and no-pick states. No fabricated odds or model probabilities. | Currently consumes summary/default-market rows. All-market aggregation and independently qualified model selections remain. |
| 5. Games | Swipeable game cards retained without previous three-game truncation. | Enhanced validated winner/score/total projections, market comparison and full injury/matchup intelligence. |
| 6. Rankings | PR #6 retains the frozen overnight NBA slate while any game is live; Previous/Today/Tomorrow access separates daily boards. Previous API verified 25 frozen ranks. | Further overnight end-to-end checks, all-sport lineup/progress/status/card consistency and validated probability/GI. |
| 7. Player intelligence | Basketball Last 5/10/20 season rollover, pregame filtering, duplicate-game filtering and preseason exclusion deployed in PRs #4–5. | Complete explanations, matchup/minutes/role/injury evidence and mobile experience across sports. |
| 8. Historical validation | Bounded official-stat and saved-selection arithmetic checks below. Original calls/lines retained. | Full original line provenance, projections, snapshots, DNP/void/pending reconciliation, all dates and all sports. |
| 9. Sports | Shared non-Soccer layout covers NBA/NFL/CFB/NHL/CBB/WNBA; MLB remains hidden publicly. | Sport-specific and historical checks remain, including MLB reactivation readiness. Soccer excluded from redesign/validation. |
| 10. Performance | Existing periods retained; audited returned-record uniqueness in NBA/NFL/WNBA/NHL/CBB snapshots. | Complete count reconciliation including voids, pushes, pending, late recovery and hidden archives. |
| 11. Defects | Midnight NBA reset repaired. Jeremiah's missing new-season game repaired in chart. | Current batch repairs NBA role-data refresh and basketball settlement season/final guards. Picks/GI, all progress/status and flicker defects are not certified complete. |
| 12. Sportsbook comparison | No new purchase, OWL upgrade or fabricated pricing. | Provider/Canadian regional/API/cost feasibility and comparison integrations remain future work. |
| 13. Admin | PR #5 includes hidden MLB/Soccer historical access, original raw fields and signed-out auth protection. | Real owner-session verification and complete hidden-volume coverage. |
| 14–16. Testing/deployment/reliability | Prior PRs #2–7 deployed with health verification. Current repair batch: 255 tests and production build pass; targeted layout tests also pass. | Current batch must be reviewed/deployed after the running backup is protected from interruption. Overall handoff remains incomplete. |

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

## Repair batch prepared in this continuation

- NBA research forecasts discover recent current-season games through ranked players' official logs, then ingest reconciled complete two-team box scores for minutes, usage, pace and opponent context. Regular season only; the existing 48-hour research availability lag remains. Source failures/incomplete evidence withhold affected forecasts. Frozen/started cards are untouched.
- Live source check for Jeremiah Fears (`5144091`) loaded game `401909839`, October 22 UTC, season 2027: 8 points, 21 minutes. The original saved 24.3 / OVER 11.5 is preserved, not retroactively replaced or declared validated.
- NBA/WNBA/CBB grading fallback uses each saved fixture's season and a player+season cache key instead of hardcoded 2026.
- WNBA/CBB full-game grading now waits for the exact fixture to be officially complete. NBA's existing final guard also verifies fixture identity. Period/scorer markets retain separate rules.
- Non-Soccer dashboards omit the duplicate Snapshot block. Top Plays empty-state explanations use simpler public wording.
- Audit tooling requires a captured local JSON export and reads official sources. Missing/unsupported evidence is counted as unverified, never as a passed grade. Automatic review rejected another NBA production-performance request because those routes may settle records; the successful NBA rerun used the already captured local snapshot instead.

## Next priorities

1. Finish backup coverage/recovery verification without clearing or resizing volumes.
2. Deploy and verify the tested repair batch without interrupting the backup.
3. Audit remaining 50 NFL cases, all pending/void/DNP records, timestamp recovery cases and MLB legacy snapshots through read-only exports.
4. Independently validate current models/probabilities/GI before enabling qualified featured picks; complete all-market Top Plays and supported first-basket modelling.
5. Finish enhanced game/player intelligence, mobile regression and real admin-session verification.

## MLB read-only recovery audit

Downloaded the October 23 Drive performance snapshot (582,933 bytes; SHA-256 `46e72764847affbf4f2ce31a4b673486711b50e25b13d17f32887fac9f17417e`) and checked official MLB game 849805. Of 235 unique category/player/game entries, 149 statistical values and their team/opponent identity matched. Forty-four entries had no qualifying participation (42 legacy Miss labels and 2 legacy Hit labels), and 42 had no matching player box entry. All 235 first-seen timestamps were after the scheduled start. No source record was changed. These are reactivation blockers, not verified pregame betting results.

The admin mapping now retains legacy projection/GI values for inspection, first-seen time separately from snapshot capture, team/matchup and explicit review limitations. It does not manufacture a calibrated probability from legacy home-run/benchmark percentages. The inspector labels stored outcomes Saved actual rather than claiming independent official verification.

## Requested compact card sizing

Following the user's two iPhone screenshots, restore three visible game cards across the shared swipe row and reduce Top Plays to approximately two visible cards on phones (four on wider screens). Clamp game context to two lines, retain logos/time/status and horizontal scrolling, and keep Soccer's grid unchanged. Production build passed; deployment remains held while backup runs.
