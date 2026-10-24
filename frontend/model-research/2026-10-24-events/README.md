# NBA quarter and first-score development evidence — October 24, 2026

This work does not approve any betting model or alter saved predictions.

## Source collection

`scripts/collect-basketball-events.mjs OUTPUT --full-census` selects every fixture in the existing NBA runtime census before reading outcomes. It retrieves official ESPN summary/play-by-play responses, records original response SHA-256 hashes, and saves compressed source responses. The fixture universe itself has not been certified against a complete season schedule.

Results: 1,813 requested, 1,805 usable event records, 1,762 reconciled Q1 scoring tapes, and 1,801 usable first-score labels. Eight fixtures failed identity/completeness checks; additional partial period tapes remain excluded. First score includes free throws and must never be relabelled as first field goal. Quarter participation is observed after the game, so historical pregame eligibility remains unverified.

The persistent source archive is `Sach-NBA-Event-Census-2026-10-24.tar.gz`, Library file `libfile_bcaa72ea165c81919418eddb622e6d28`. It contains the original compressed responses, event observations, and per-response provenance manifest. No credentials or sportsbook records are included.

## Quarter forecast evaluation

`scripts/evaluate-basketball-events.mjs EVENT_JSON OUTPUT` reconstructs complete reconciled full-game box scores from the same original sources. It uses prior Q1 outcomes and prior full-game role, usage and opponent features with a 48-hour exclusion lag. It never uses the target game's actual minutes, usage or starter flag as features.

The 2025 fixture sequence is split into training and calibration; 2026 is evaluated separately. There are 7,572 training rows, 4,284 calibration rows and 13,693 test rows across 884 test fixtures per market. The exact report is `q1-evaluation.json`.

Points mean absolute error improved only 0.154% versus the old full-game/4 comparison. Rebounds, assists and threes were worse. This does not establish a practically meaningful gain, a calibrated probability or an executable betting edge. Full-game/4 remains a comparison baseline, never a public quarter forecast.

Unresolved: independent untouched holdout, archived pregame lineup/injury information, quarter participation/void rules by sportsbook, exact historical period quotes, probability calibration and model-versus-market performance. No candidate enters the validated model registry or live ranking projection path.

## Current market coverage

Production merged OWL feed on October 24 at 14:16 UTC: eight games, 3,378 props, zero matched/priced NBA Q1 or First Basket markets. `nba-market-coverage` logs now report exact category/period counts. The fixed FanDuel native Source API diagnostic examines alternate coverage without promoting raw markets into verified quotes. Official OpenAPI marks `/api/v2/{book}/{sport}` as available on all paying tiers; the diagnostic is cached for an hour and adds no subscription.

## Verification

261 tests passed and the production build passed for the Top Plays capture repair. The event parser rejects mismatched, nonfinal, preseason, recent and incomplete fixtures. Native market discovery tests reject raw runner odds/credential exposure and deduplicate market IDs.
