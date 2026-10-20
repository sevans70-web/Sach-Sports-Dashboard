# NBA source status — October 20, 2026

The production NBA points response at 16:21:47 UTC reports 25 verified book quotes and 16 fitted experimental forecasts. The repaired matcher accepts the NBA book's court-tip time within 15 minutes of the official advertised start, requiring exact full away/home names, the same sports day and a unique roster fixture. It retains providerGameTime and providerEventId. Other sports keep their five-minute rule. Quotes are matched to the active slate before player deduplication.

NBA GI remains unavailable. No NBA historical exact-price calibration artifact has been fitted, and no NBA model has been approved as a validated betting recommendation.

## Directional selections independent of GI

The runtime now exposes `researchForecast.modelSelection` separately from GI and from the validated recommendation registry. A fitted distribution and a fresh, exact two-sided main-market quote can produce an estimated OVER/UNDER selection using the existing fixed policy (at least 55% model conditional win probability and at least 3% model expected unit return). GI is not an input to that decision. These thresholds do not establish calibrated NBA betting value. Markets with an existing failed exact-price evaluation still abstain.

Each selection retains its exact line, side price, bookmaker, quote ID, source update time and calculation time. Existing research-board archives preserve the output; old saved wager records and grades are unchanged. The UI identifies it as an estimate. It is not counted as a validated pick or added to validated betting performance.

A current-source check at 2026-10-20T17:23:16Z produced 11 estimated points selections from 25 quoted rows. This is a runtime check, not a historical performance result or a promise that the same quotes remain available.

## Credentialed OWL checks

- Rookie current merged props works; there is no basis to call the membership expired.
- April 1 results discovery returned no games.
- Official fixture/player fallback found the completed fixtures. Included Pinnacle history returned no opening or movement records for CJ McCollum and Buddy Hield in Atlanta at Orlando, and Andrew Wiggins in Boston at Miami, all UTC-dated April 1. These three samples do not establish archive-wide absence.
- The separate historical player-prop backfill returned HTTP 403.
- The configured supplemental current-price feed returned HTTP 429.

## Prepared alternate collector

`lib/nba-archive-quotes.ts` and `scripts/collect-nba-archive.mjs` support DunkAPI's documented closing player-prop response. This adapter has synthetic contract tests but has **not** been executed against real credentialed DunkAPI responses. Coverage, payload compatibility and price quality are unverified.

Official documentation:
- https://dunkapi.com/docs/get-player-props
- https://dunkapi.com/pricing

The documented free allowance is 500 credits without a card, and this endpoint costs 10 credits per call. The collector hard-caps its fixed census at 44 requests / 440 nominal credits, caches responses, never retries a charged failed request, and does not create an account, buy credits or change billing. The provider may draw calls from an existing wallet; use an unused free allowance for this run. No key is currently configured.

With `DUNK_API_KEY` supplied to the execution environment and the preserved NBA evidence extracted, run from frontend:

```sh
node scripts/collect-nba-archive.mjs /tmp/sach-nba-exact-prices
node scripts/evaluate-rookie-models.mjs /tmp/sach-nba-exact-prices /tmp/sach-nba-price-evaluation
```

The fixed sample contains the first 32 completed official fixtures from March 20 whose results have a 48-hour lag before April 5, followed by the first 12 April 5–7 fixtures. All supported standard markets are retained with a fixed sportsbook preference. The parser rejects mismatched game/player IDs or names, nonpregame timestamps, absent prices, ambiguous same-book thresholds and unverified nonappearance settlements. It retains original provider capture times and labels retrieval as retrospective. The existing evaluator supplies a research diagnostic, not production approval; subsequent calibration decisions must be based on actual evidence.

An API key or an authorized historical export is the remaining external input for this alternate path. No NBA GI number is fabricated from the NFL calibration.
