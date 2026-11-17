# R1 NBA fallback/candidate comparison and repair

Status: the targeted NBA denial/recovery comparison passes locally. Nothing deployed. R1/CW11/V62 remain open for a newly frozen release, remaining release checks, approval and actual production acceptance. The old R1 archive remains unchanged; do not deploy it again.

## Precise regression

The active fallback deployment is `a43f9bf6-bdb6-4e45-a5b0-7d1b2881cfcb`, serving version `a48c431a-5c3e-4491-8529-38cb20dfa898`. The withdrawn candidate was deployment `f2f5c908-4d8a-420a-918d-6a0e02e0b2b9`, version `a8e46b4c-3f72-431b-9155-459bfb1f8704`. Both archived compiled bundles were extracted without modifying their modules.

Their compressed NBA Points model/history partition is **byte-identical**: SHA256 `115fb0e140b83907d42d8bb6bd1345fc8841b2478f112f40e2fc9045cf3c3f41`,12647 observations. The corrected compiled partition remains identical. This rules out a changed Points model or missing embedded observations as the source of this comparison's discrepancy.

The candidate's `nbaSourceFetch` introduced official-history denial caching. Its key normalizes `athletes/<id>/gamelog` to `athletes/:id/gamelog`, omitting both athlete and season. One NBA403 therefore becomes a one-hour denial for **every** athlete in that family, even URLs never attempted. The background budget's persistent denial cache made the same inference. The fallback's provider transport attempts athletes separately. The candidate then adds these artificially suppressed players to `unavailablePlayers`; `attachFittedResearchForecasts` correctly abstains for them, and public eligibility correctly removes rows lacking complete forecasts. The overbroad denial evidence is the defect, not the final ranking count limit or EV formula.

The existing source test explicitly expected a second NBA athlete to be suppressed after the first403. It now verifies athlete-specific denial instead. NFL's existing policy and origin-wide429 cooldowns are unchanged. No endpoint, authentication, header disguise, credential or provider change was introduced.

## Confirmed recovery gap

`worker-entry.mjs` already writes NBA boards into the existing short-lived KV cache, but only reads that cache for NFL. A cold NBA request could therefore ignore a valid NBA cache receipt after a provider failure. An empty refresh does not overwrite the previous receipt (`cachePregameBoard` already rejects empty rows); the missing step was reading and validating it.

The repair adds read-only NBA recovery after an HTTP failure, failed payload or HTTP200 empty board. It requires the existing10-minute board window, same market/Toronto day, future fixture times, complete model evidence and valid current quotes. It preserves original ranks, lines, forecasts and timestamps; returns explicit stale/refresh-pending metadata with a valid `observedAt`; and never republishes the retained receipt as a fresh capture. Expired quotes, started games, wrong dates/markets and unavailable models remain excluded. When there is no legitimate recoverable evidence, it still abstains.

## Controlled compiled comparison

`nba-compiled-denial-comparison.test.mjs` imports each archive's actual compiled forecast module into workerd, with350 subrequests and the existing compatibility flags. It uses25 authentic recorded NBA Points rows from the fallback's November16 response. Four initial athlete requests receive403; the others receive an explicitly constructed successful empty-gamelog contract, so no new observations are invented. All three runs use the same historical replay clock, recorded quotes, embedded history and downstream public eligibility/EV implementation.

| Artifact | Upstream gamelog attempts | Eligible rows | Available EV |
|---|---:|---:|---:|
| Withdrawn candidate |4|0|0|
| Verified fallback |29|9|8|
| Corrected candidate |25|9|8|

The corrected output is compared against the fallback reference by exact player identity, projection, full probability/quote evidence and EV value. The ninth row has an explicit `direction_unavailable` EV reason because projection equals line; no EV is manufactured. Other rows still abstain for genuinely missing team history/uncertain roles. The repaired candidate respects all four actual denials and their cooldowns; it does not retry them to bypass a restriction.

This reproduces the production failure mechanism in the withdrawn compiled code. It is **not** a byte-for-byte replay of every production upstream response: individual denied response payloads and all successful historical provider responses were not retained in the incident logs. The original incident's zero-observation audits and403 traces remain in the previous audit. The controlled comparison separates that evidence from reconstructed fault contracts; no simulated result is called a live pass.

## Actual compiled-route outage recovery

`nba-compiled-cache-recovery.test.mjs` calls the corrected compiled Worker's real `/api/nba/rankings` routes. All upstream feeds are denied; only the existing KV contains authentic November15 recorded pregame boards. Cold concurrent Points/Rebounds requests and the remaining markets recover:

| Market | Recovered rows | Available EV | Explicit unavailable EV |
|---|---:|---:|---:|
| Points |23|23|0|
| Rebounds |23|23|0|
| Assists |22|20|2|
| Threes |25|24|1|
| PRA |17|17|0|
| PR |20|20|0|
| PA |17|17|0|

Every recovered forecast equals its original. KV bytes remain unchanged; outbound history writes are forbidden and observed writes are zero. Unavailable EV is explained rather than invented. These are historical runtime-fixture counts, **not current live ranking counts**.

## Scope and remaining release work

Only NBA denial scope and NBA cache recovery change. The manual redirect rejection, source deadlines, bounded memory/concurrency, NFL recovery/checkpoints, NHL recovery, featured qualification rules and frozen CW08 model/protocol are preserved. Focused tests include persisted denial/restart, valid cache retention, expiration, malformed/missing evidence and historical immutability. The complete suite covers signed/zero EV, all seven markets, featured categories/First Basket, historical selections and other sports. Shipping compiled regressions recheck cold summaries, redirects/auth failures/timeouts, NFL17-tab visibility/checkpoint/lost-ACK recovery, NHL coverage, fallback compatibility and all-sport grading contracts.

The external reason ESPN refuses an individual URL remains a provider limitation; this repair corrects the application's invalid inference that it refused every NBA athlete. A long outage without fresh legitimate quotes/history can still prevent new forecasts. No cached price is extended indefinitely and no historical forecast is rebuilt after kickoff.

No production database writes, dashboard deployment, research deployment, automatic-build enablement or provider/credential changes were made. Read-only Cloudflare checks confirm the same dashboard fallback, research version and paused branch filter. CW08 health reports1427receipts,960grades,298completed cycles,0pending uploads and no storage error; model `007c02b` and15-minute schedule remain unchanged.

See `test-results.json` and the retained logs for final verification counts. The targeted comparison is resolved in code; actual production browser/all-sport scheduled acceptance remains open. Do not mark R1 or CW11/V62 complete or request deployment approval from these local results alone.

## Reproduce without production access

From `frontend`, extract the two existing archives to separate temporary directories. Use their `workers/default/bundle` subdirectories for `FALLBACK` and `WITHDRAWN` below (these are task-specific shell variables, not system paths). No API key or production binding is required.

```sh
node --test tests/*.test.mjs
npm run build:vinext
npx tsc --noEmit
SACH_NBA_COMPARISON_BUNDLE="$FALLBACK" SACH_COMPARISON_OUTPUT=/tmp/nba-fallback-reference.json node --test tests/nba-compiled-denial-comparison.test.mjs
SACH_NBA_COMPARISON_BUNDLE="$WITHDRAWN" SACH_EXPECT_DENIAL_COLLAPSE=1 node --test tests/nba-compiled-denial-comparison.test.mjs
SACH_NBA_COMPARISON_BUNDLE="$PWD/.cloudflare/output/v0/workers/default/bundle" SACH_COMPARISON_REFERENCE=/tmp/nba-fallback-reference.json node --test tests/nba-compiled-denial-comparison.test.mjs tests/nba-compiled-cache-recovery.test.mjs
SACH_COMPILED_RUNTIME=1 SACH_REPLAY_BUNDLE="$PWD/.cloudflare/output/v0/workers/default/bundle" SACH_FALLBACK_BUNDLE="$FALLBACK" node --test tests/actual-cold-routes.test.mjs tests/compiled-summary-redirect.test.mjs
node scripts/deploy-cloudflare.mjs --dry-run
```

Final results:844regression passed/0failed/15opt-in skips;19shipping-runtime passed/0failed/1diagnostic skip;2new compiled checks passed; TypeScript0diagnostics; production compilation and upload-free dry-run passed. Featured/First Basket, signed/zero EV, history preservation, interrupted-job, rate-limit, timeout, cancellation and other-sport regressions remain green. The corrected Worker was only compiled locally, never uploaded.
