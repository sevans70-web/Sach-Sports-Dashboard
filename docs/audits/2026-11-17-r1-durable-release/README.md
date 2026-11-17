# R1 release preparation — November 17, 2026

**GO for controlled deployment approval; not deployed and not complete.** Frozen artifact `R1-2026-11-17-4c23239-6173e391`. [Release and rollback plan](../../../frontend/releases/r1-2026-11-17-durable/release-plan.md); [exact manifest](../../../frontend/releases/r1-2026-11-17-durable/manifest.json).

## What changed

Preserved completed durable NBA recovery from `6d98710`. Current legitimate data exposed one additional concrete defect: the static 64-fixture slice omitted the 65th fixture and withheld three Points players on every refresh. Commit `4c23239` replaces this permanent cutoff with a 128-source foreground allowance and full-census background continuation under the existing job budget/checkpoints. No statistical model, EV formula or original prediction changes. CBB retains its prior behavior.

The current-data rehearsal uses 50 player gamelogs and 65 recent official fixture responses, all HTTP 200. Collection ran two requests concurrently, eight-second deadline, no retries, standard existing public profile/manual redirects; no credentials or new services. Response bodies/receipt times/hashes are in `current-inputs.tar.gz`. An initial local Node transport failure was not an HTTP denial; standard existing curl subsequently succeeded. No blocked Cloudflare preview, alternate provider host or credential transport was attempted.

Snapshot: **November 17, 5:04:46 PM Toronto (22:04:46 UTC)**. The seven production public boards contributed 25 displayed rows each, 50 distinct players; this is not an unfiltered sportsbook population audit. Existing fallback read-only public API responses had 25 rows per market. NBA slate/slate counts are defined API windows, not necessarily today's complete game count.

## Evidence and limits

| Check | Result | Evidence |
|---|---|---|
| Real current source responses | 115/115 HTTP200; all body hashes match | `current-inputs.tar.gz` |
| Current compiled forecast, before repair | Points22/25; one omitted fixture/three unsupported players; other6markets25/25 | `current-compiled-coverage-before-fix.json` |
| Final compiled forecast, same inputs/clock | All7markets25/25 supported; no unavailable players; 84–90 distinct source lookups, limit128 | `current-compiled-coverage-final.json` |
| Final exact shipping compiled routes | 19pass/0fail/1 intentional withdrawn-baseline skip; summary/redirect/auth/timeouts/NFL/NHL/checkpoint/fallback/grade | `final-compiled.log` |
| Actual compiled cached routes under denied feeds | 1pass;7stored boards preserved;0upstream reads for cached boards/0history writes; uncached outage explicitly unsuccessful | `final-cache.log` |
| Source-budget/durable safeguards | 10pass; exact5,382observations after eviction; all7market input/projection/probability/EV parity; semantic/cancellation tests | `source-budget-fix.log` |
| Strict real fetch budget continuation | limit30: used28/28/26/16; checkpoint progress26/29/25/18; versions12/27/39/49; fourth phase succeeds after restart | `source-budget-fix.log` |
| Resource/cancellation/foreground isolation | 16pass/0fail, including concurrent cold NBA combination forecasts in workerd | `final-resources.log` |
| Artifact extraction/CLI safety | 2pass; altered code/bindings rejected, no upload mode | `final-package.log` |
| TypeScript/build/dry-run | 0diagnostics/buildpass/dry-runpass; gzip7,573.14KiB | `final-types.log`, `final-build.log`, `final-dry-run.log` |
| Desktop/mobile-size browser replay | NBA7/NFL17/NHL6; no hydration/page errors; PR503 retains20cards/stale notice; featured/history preserved | `browser/` |

Total **48 selected checks passed, zero failures**, excluding browser assertions and the one deliberately skipped withdrawn baseline. Initial pre-fix 14 resource tests and the prior 844-test full regression are reused where unchanged, not counted again as new full-suite passes. The obsolete cache assertion was corrected: stored-evidence-first recovery must make zero provider reads, and a separate uncached case still exercises actual denied upstream handling. No test now invents a forecast to satisfy a count.

The current forecast runner executes the final shipping forecast module and actual Durable Object in workerd with a 350-subrequest/30,000ms CPU configuration. It replays captured real responses at their snapshot clock; the initial market took6.964s, subsequent markets1.133–3.084s under parallel local test load. These are **not live candidate performance or production egress measurements**. Older recorded browser UI rows are NBA23/23/22/25/17/17/20, NHL Shots25/Points25/Saves7; NHL Assists/Goals/Blocks have truthful validation/evidence holds. NFL17tabs retain16–25 quote-backed rows, missing unsupported forecasts explained and no invented selections.

Current board timestamps/quotes were valid at the captured clock, not guaranteed at approval/activation. Fresh production odds and the entire eligible candidate pool must be checked at release. Existing fallback Points API took11.153s, the other six4.004–9.606s; this is baseline observation, not a candidate pass or a repeated-stall diagnosis.

## Safeguards and remaining action

`release-safety.json` confirms unchanged active fallback/version, existing namespace/KV/secret names/compatibility, paused build filter, dashboard schedules and CW08deployment/version/15-minute schedule. Existing 20,466-record backup manifest and all three objects remain available with original sizes; reuse prior checksum/isolated restore, do not reimport old records over later receipts. No production record write/import, upload, binding mutation, credential change, source purchase or research-table access in this task.

No unresolved application rehearsal failure remains. Ask for approval of this exact frozen artifact, then perform actual production desktop/mobile browser acceptance, protected-record inventories, memory/loading/error monitoring and complete38-market capture/three-sport grading rotation with immediate fallback on critical failure. This is the remaining release action, not a claim of completion. Provider availability and larger unseen candidate sets remain risks requiring honest missing-evidence handling and live acceptance, not paid subscriptions or invented data.

Optional follow-up improvements are listed separately in the release plan. R1/CW11/V62 remain open; no completion row moved. `evidence-files.json` records hashes of preserved evidence.

CLI log trailing padding is normalized for Git; diagnostic content is unchanged.
