# Cold collection / ranking repairs — not approved for deployment

Base: `43ccafe`, branch `cloudflare-compatibility-test`. No deployment or provider-account configuration changes. This evidence separates production observations, offline replay and unresolved access requirements.

## Confirmed production failures

Cloudflare's dashboard service spans show HTTP 403 at `https://api.owlsinsight.com/api/v1/nfl/props` and `/api/v1/nhl/props` during the withdrawn candidate. NHL had an earlier successful 200, then 403. ESPN athlete-gamelog and search denials are an additional failure, not an explanation for missing sportsbook prices. Binding presence and configured header names do not prove valid credentials or provider entitlement. No explanatory account notice was supplied; account restriction versus provider-side incident remains unconfirmed. No credential values were inspected, copied or logged. The already-configured supplemental feed previously returned 401, so an authorized live alternative is not currently demonstrated.

The old cold route swallowed primary feed errors, attempted history/model-watch enrichment with no executable prices, and returned generic `rankings_unavailable`. Its job remained active after three non-advancing attempts, obstructing later capture. See `owls-source-spans.json` and the prior rollback audit.

NHL official statistics separately hardcoded 2025–26. That omits current-season newcomers and applies the wrong baseline in 2026–27. It is an application defect, but cannot explain away the independent sportsbook 403. When no priced candidates exist, zero history refresh requests are intentional, not proof of a history-provider outage.

The compiled production framework also lazily installs its global fetch patch. On the first cold request it could replace the job accounting wrapper: a source-only route test missed this. A full compiled-Worker test initially failed (zero charged requests and bypassed denial handling). `worker-entry.mjs` now installs the framework patch before the job wrapper is first installed. The same compiled test then charged 22 requests, bounded concurrency to four, recorded denial evidence and wrote three source checkpoints.

## Implemented repairs

* NFL/NHL primary odds fetches persist credential-free, whitelisted quote inputs or denial diagnostics to existing job source storage; respect Retry-After; use bounded denial cooldowns; separate foreground and capture in-flight ownership. No new namespace or migration.
* With both feeds unavailable, NFL stops before futile history enrichment. No probabilities, selections or odds are invented. A valid quote may still be captured as original evidence even if its history/model is unavailable; it is not a betting selection.
* Capture failure diagnostics survive budget cancellation. Three non-advancing capture attempts, or eight attempts even with input activity, enter a visible blocked state. Other markets/sports and grading can continue. Coalescing respects market and Toronto capture date. New scheduled probes can retry after the cooldown; old evidence is retained.
* NHL requests the official slate's actual season, requires unambiguous player/team/position/fixture identity and exposes source/quote rejection coverage. Denied feeds return explicit unavailability rather than a healthy zero. Valid in-memory boards survive a failed refresh only within the existing 60-second/before-start boundary; their observation time is never renewed.
* Public ESPN transport does not switch hosts following authorization rejection or rate limiting. Existing service-error recovery remains.
* NBA legacy frozen combination forecasts explicitly explain missing original joint probabilities. Component means cannot reconstruct historical EV. Current joint-model EV, rankings, original records and the PR memory repair are preserved.

## Reproduction and validation scope

`frontend/tests/actual-cold-routes.test.mjs` runs the real route implementations, models, SQLite Durable Object coordinator and KV under workerd, with 350 Cloudflare subrequests, a 220 job guard and four admitted source requests. Compiled mode additionally runs the actual shipping Vinext handler and framework, not an API stand-in. Historical clocks and explicit alarm delivery make restart/cancellation reproducible. All database bindings and credentials are synthetic, outbound requests are intercepted, and unexpected hosts fail.

The official-source fixture contains downloaded public NHL/NFL payloads and provenance. Book responses are **contract reconstructions from previously recorded real receipts**, preserving their exact prices, lines, player identities and timestamps. NFL pregame statuses replay the recorded pregame slate, since the later official download had already started games. This is failure reproduction, not a new live feed-access claim or a calibration dataset.

The withdrawn artifact SHA256 `6b5562de7e6ba6ea8239c3da9edf9fc4f49cd3eadce5a471696e00ab47226b6a` was unpacked locally only. Under the same denied-feed conditions it remained active after three attempts, zero checkpoints and opaque `rankings_unavailable`, with four ESPN denials. The corrected compiled bundle instead preserves the exact denied endpoint, stops before ESPN and blocks safely across restart.

Positive cold replay captures one authentic NFL quote, survives a database write with lost acknowledgement and full isolate restart, completes, and preserves one byte-identical original without duplicate or unsupported picks. A separately authorized supplemental-feed contract also completes; this does not assert that the real subscription currently authorizes it.

Current-season NHL replay yields Shots 1, Points 1 and Saves 2 eligible rows from four real recorded receipts, with requested official histories 1/1/2 and zero unavailable histories. These are deliberately small fixture counts, not claimed live totals or imposed ranking quotas. Denied NHL replay yields explicit unavailable coverage and no invented quotes/history.

Browser replay against the compiled page/assets checks all 17 NFL tabs, seven NBA markets and NHL Shots/Points/Assists/Saves, with no React/page errors. Its larger counts come from separate recorded full-board responses; they test rendering, not provider recovery. Forced NBA PR 503 retains all 20 recorded cards with a stale explanation. See browser JSON reports.

Run from `frontend`:

```
node --test tests/*.test.mjs
./node_modules/.bin/tsc --noEmit
npm run build:vinext
SACH_COMPILED_RUNTIME=1 node --test tests/actual-cold-routes.test.mjs
```

## Release blockers and production protection

**Not ready for another deployment.** Restore/confirm authorized NFL/NHL sportsbook access (or a legitimately entitled configured alternative), then verify fresh real quotes, supported official histories and eligible forecasts. Do not host-switch/proxy around 403, request tokens in chat, backfill invented prices or relax frozen model safeguards. A later approved deployment must still pass cold production capture, restart, foreground/browser and scheduled-job gates with the compatible fallback available.

Production remains fallback deployment `9b1c3dea-a683-4e0f-9f42-71236a095a9d`, version `a48c431a-5c3e-4491-8529-38cb20dfa898`. Automatic build branch inclusion remains `__cw08_manual_release_only__`.

CW08 deployment `39ea465b-ca3f-47f8-9bd2-50eb2f1ad174` and `*/15 * * * *` schedule remain unchanged. Its rebuilt frozen bundle is still 151874 bytes, SHA256 `c6a71a74051e42a9f6642944b6f9e247be3c4b3f74c96cd84319fb0dbb4959e4`. Read-only status shows 902 receipts, 658 grades, zero pending uploads, no storage error, and an active cycle retrying `source_http_403`. Automation remains enabled, but provider rejection is affecting new collection; it is not healthy fresh coverage. Research transport/model/protocol were not changed.

The opt-in withdrawn-bundle comparison uses `SACH_COMPILED_RUNTIME=1 SACH_BASELINE_RUNTIME=1 SACH_REPLAY_BUNDLE=<local-unpacked-withdrawn-bundle> node --test --test-name-pattern='withdrawn production' tests/actual-cold-routes.test.mjs`. Verify the archive SHA above before unpacking. Its expected assertion is the old **failing operational behavior**, not readiness; it is skipped in ordinary tests and must never be uploaded. The release helper's withdrawal protection remains unchanged.

## Final results

Full regression: **816 passed, zero failures**, one opt-in baseline diagnostic skipped (separately executed and passed). Source-route runtime: six passed. Shipping compiled-Worker runtime: six passed. TypeScript: zero diagnostics. Production compilation and prebuilt dry-run passed with no upload. Browser replay: 17 NFL tabs, seven NBA and four NHL markets, zero page/hydration errors; PR failure retained 20 cards. Full test output is preserved as `full-regression.log.gz`; command results are summarized in `test-summary.json`. Logs have trailing display whitespace removed. No application model or historical-record rewrites. **Provider access remains a release blocker.**
