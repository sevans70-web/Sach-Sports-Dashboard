# N05 continuation — 2026-10-29

N05 covers NBA and NFL. **Open, not complete.** Current quotes are not evidence of an operating quarter prediction model.

## Applied correction

`footballBookRows` now prefers a verified two-way main contract before sportsbook preference. Previously a preferred book's one-sided milestone could suppress another book's main pair. Within a book's milestone ladder, the lowest offered target precedes freshness. Bookmaker counts no longer mix main and milestone contracts at the same number. Exact prices, period, player and fixture identities stay attached; no target becomes a fabricated decimal O/U.

462 tests and the production build passed. New regressions cover all three quarter yardage markets, reversed source order, invalid main pairs, mixed contract counts and differently timestamped ladder targets. This shared football parser also serves CFB; CFB is excluded from N05 acceptance.

## Live acceptance

Run from frontend:

```
node scripts/verify-n05-live.mjs /tmp/new-exclusive-report.json
```

It reads seven live quarter markets, retains only summary counts/reasons and exclusive-creates a report. Exit 2 means incomplete. It does not mutate production, history, checklist state or the model registry. The smoke check requires verified quotes, a true two-way contract, a numeric fitted forecast and a supported directional forecast in each market. Passing this smoke check would still not certify model accuracy or every player's eligibility.

`live-2026-10-29.json` records all seven endpoints returning HTTP 200. NFL passing/rushing/receiving had 2/3/10 verified rows; NBA points/rebounds/assists/threes had 19/19/17/17. Every row lacked a supported quarter projection (`market_model_not_fitted`). NBA rebounds/assists/threes were milestone-only in this snapshot. Counts are time-specific feed coverage, not permanent provider limitations.

## Verified forecast blocker

The runtime manifest contains no NFL or NBA Q1 fitted model groups. This is not fixed by relabelling cards, showing a sportsbook implied line as a forecast, dividing full-game projections by four, or copying an observed mean into the fitted projection slot.

Recovered the original 1,813-fixture NBA census from `libfile_bcaa72ea165c81919418eddb622e6d28` and replayed `evaluate-basketball-events.mjs`. The replay reconstructed 285,042 full-game census observations across 1,803 fixtures and exactly reproduced all four previously committed MAE results. Points improved 0.154% versus the former full-game/4 comparator; rebounds, assists and threes were worse. The existing quarter-label participation and untouched-evaluation limitations remain. No candidate was promoted or public forecast fabricated.

NFL quarter artifacts also remain experimental: the existing passing evaluation has only four later-period forecasts, and all three markets lack certified exact-price/prospective evidence. See the original `model-research/2026-10-19/nfl-quarter-population/README.md`.

To close N05: develop and evaluate quarter-specific forecasts with pregame eligibility, verify the exact live quote/forecast binding, capture projections and direction before tipoff/kickoff, and check quarter results without rewriting original forecasts. Main-contract source coverage must also be established where the active feed currently supplies only N+ milestones. P01 remains separate and open. Existing history, frozen cohorts, grades, hidden sports and retention are untouched.
