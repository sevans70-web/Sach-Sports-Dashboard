# Provider recovery and release reassessment

Continues `d51b093` on `cloudflare-compatibility-test`. The owner has confirmed OWL Rookie active through December 15. No credentials, Worker configurations, provider integrations, frozen models/protocols or production records changed. No upgrade, purchase, support message or deployment occurred.

## Live access: partially recovered, not globally cleared

Read-only Cloudflare telemetry shows **13 sampled successful research NHL merged-props calls** from **8:21:31 PM through 10:34:04 PM Toronto, November 15**, after the last sampled research 403 at 7:44:16 PM. These are observed successful calls, not a proof of every unsampled request or a permanent explanation of the earlier rejection.

CW08 advanced from the prior audit's 930 receipts/658 grades to **938 receipts/702 grades**. During this check completed cycles advanced **157 → 158** with zero pending uploads, no active error and no storage error. The 15-minute schedule and research deployment `39ea465b-ca3f-47f8-9bd2-50eb2f1ad174` remain unchanged. A new stored first-receipt was read without writes; its compressed envelope checksum, original quote, history hash and frozen probabilities were verified and replayed. The receipt targets MTL/NYR assists, player `8483515`, fixture `2026020331`, with saved line 0.5, OVER +145/UNDER -197. It remains research-only and unapproved for production selection. No outcome was used to tune the model.

A latest separate source snapshot contained zero quotes for its fixture. That is retained as normal coverage evidence, not filled with invented rows. HTTP 200 by itself does not establish market completeness. New stored receipts, immutable references and probability replay provide stronger evidence of actual resumed collection.

The dashboard's last sampled NHL props read remains 403 at 8:01:48 PM; its last sampled NFL props read remains 403 at 3:13:48 PM. No later dashboard-bound success is established. The previous audit client received Cloudflare Error 1010 before reaching the dashboard; no repeat using an alternate identity/host/proxy was attempted here. Thus the earlier research failure has recovered in the observed window, but dashboard/NFL denial is neither newly reproduced nor disproved. Do not describe the global access blocker as resolved.

SportsGameOdds' last sampled `/v2/events` response remains **401**. Existing binding/header and synthetic-runtime checks found no confirmed wiring defect. A valid intended key/account cannot be proven from Cloudflare's write-only secret metadata. Keep current credentials untouched and use existing-account verification/provider support. An unavailable optional backup should not veto a later release once the primary dashboard feed and graceful failure behavior are genuinely verified; its present authentication has not been repaired and no paid replacement is proposed.

## nflverse validation completed in isolation

The public [nflverse datasets](https://github.com/nflverse#licensing) provide generally CC-BY history with attribution; no access-control bypass or paid subscription is involved. The downloaded player-stats datasets are 2025 (19,422 rows) and 2026 (10,306 rows, Weeks 1–10). Of 1,805 current-season players, the previously downloaded identity snapshot maps 1,798 to ESPN IDs; seven remain unmapped. The slim fixture retains the available current identity rows and actual Jordan Love/Josh Allen statistics, plus source hashes, attribution and official nflverse schedules. It does not manufacture mappings for missing players.

The new **research-only** `frontend/scripts/nflverse-history-validation.mjs` validates existing data inputs and returns observations/exclusions, never a projection, probability, EV, selection or database write. It is not imported by production routes. Tests demonstrate:

* Exact ESPN→GSIS resolution, refusing unmapped or ambiguous IDs; player names cannot select another player's history.
* Target fixture, season, team/opponent and pregame event cutoffs. Real 2025 records and the target game's realized statistics cannot enter the 2026 pregame sample. Jordan Love's nine earlier 2026 games remain, including the actual September 13 passing total of 387.
* Genuine zeros remain values. A missing component cannot become zero or a combined total.
* Identical duplicates are deduplicated; conflicting duplicates, mismatched opponents, ambiguous schedules and invalid dates fail safely.
* All three active Q1 markets are explicitly unavailable from weekly full-game totals; first-touchdown event order needs play-by-play. No full-game statistic is divided to synthesize a quarter. Defensive statistic semantics remain gated instead of assuming a similarly named column is equivalent.

The [schedule source](https://github.com/nflverse/nfldata) supplies game/ESPN IDs and actual Eastern kickoff times; fixture preparation converts these with the America/New_York timezone, respecting DST. These downloads happened after some games: the tests are retrospective source-validation evidence, **not proof those exact bytes were available before a historical pick**. Full-game histories are useful for future supported model inputs only after an approved adapter and source-semantic checks. They do not establish current sportsbook access, live official grading reliability or validation for unsupported models. nflverse normally updates [postgame/nightly](https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html), with later corrections; no live SLA is assumed. No production source was switched.

## Production-like recovery tests

The shipping compiled Vinext Worker ran in workerd with actual route/model/coordinator implementations, SQLite Durable Objects, isolated KV, a 350-subrequest ceiling and the 220 job guard. Previously recorded real sportsbook prices and downloaded official NHL/NFL inputs are replayed through the provider contract; intercepted failures and credentials are synthetic, and remote production writes are forbidden. This is not a newly authenticated NFL feed claim.

Six compiled checks pass: NFL quote capture despite ESPN 403, durable checkpoint/restart/lost-acknowledgement recovery, bounded denied-feed blocking, authorized supplemental-feed contract recovery, all 17 retained NFL tabs alongside background capture, and NHL current-season priced-history/denied-feed handling. NHL replay retains the fixture's legitimately quoted Shots 1/Points 1/Saves 2 candidates; those are small replay counts, not live totals. The new real-data checks separately verify the recovered frozen research receipt and nflverse matching/season/quarter limits. Original records, source objects and immutable picks remain unchanged.

**Results:** 822 regression tests passed, zero failures; one opt-in withdrawn-artifact diagnostic skipped. Six compiled-runtime checks passed; six new real-data checks passed; zero TypeScript diagnostics. The research-only validator's final conflicting-duplicate safeguard also passed its focused tests. Full output is in `full-regression.log.gz`. Frozen research bundle remains exactly 151874 bytes, SHA256 `c6a71a74051e42a9f6642944b6f9e247be3c4b3f74c96cd84319fb0dbb4959e4`.

No shipping dashboard application, capture coordinator, model, frontend component or release configuration changed in this follow-up. Previously completed NBA EV/PR memory, schedules, NFL visibility, NHL ranking, capture/recovery and history repairs remain in place on the branch. Their pending production build evidence is preserved; no new dashboard production build/upload or live deployment acceptance is implied by these offline tests.

## Controlled deployment decision: NOT READY

The **NHL research-access blocker is downgraded to monitoring** because repeated successes, new first-receipts and scheduled progress are observed. The **combined dashboard provider-access gate remains open** because fresh NFL and NHL success using the actual dashboard binding has not been verified. The dashboard's browser/edge verification path must also be available for rollback acceptance. Neither passing tests nor the research Worker's success proves another Worker's key/account or live rankings.

Next required action is one authorized, bounded dashboard-bound NFL/NHL access check after the edge access/credential association is verified through the existing provider account/support workflow. The unsent OWL support request from the prior audit remains ready for owner review. If those checks pass, repeat the production/browser/cold scheduled acceptance and freeze a new controlled release for approval. Do not rotate working research credentials, add providers or deploy now.

Production remains fallback `9b1c3dea-a683-4e0f-9f42-71236a095a9d`. Automatic-build inclusion remains `__cw08_manual_release_only__`. Evidence/SQL reads in this audit record **zero rows written**. All CW08 original receipts and history remain protected.
