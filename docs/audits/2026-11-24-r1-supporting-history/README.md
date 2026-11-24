# R1 NBA supporting history / NFL official inputs — November 24, 2026

**Decision: repairs implemented and targeted candidate checks pass; R1 remains open. No release prepared or deployed.** Base `a650106` and existing follow-up `49cd86b` are preserved. This work does not revisit the historical import, prior 350-card odds audit, private previews, or the verified Prediction Dashboard cache implementation.

## Confirmed defects and repairs

### NBA

The ranking model reads complete validated FINAL boxscores through durable recovery. The supporting-history endpoint separately requested athlete gamelogs and then `history_player_games`; neither path consumed the model's recovered observations. Consequently a legitimate forecast/EV could coexist with HTTP200 and `points:[]`. The original production reproduction, including the top and bottom Points cards, is retained in [the previous acceptance record](../2026-11-24-r1-depth2-live/README.md).

New full-game forecasts now carry read-only supporting evidence selected from **the exact observation set used for their input receipt**, with player/team/game/market identity, original source and retrieval times, actual results, minutes, attempts and the exact model-game IDs. The unchanged same-team/season/window/48-hour rules select the last ten eligible model appearances; up to20 genuine observations remain available for display. The input feature vector cross-check validates the last3/last10 actuals and workload. Explicit zeroes remain zeroes. Names/IDs/market/fixture/date and mismatched receipts fail closed.

Expanded cards use that evidence before making any history-provider request. Cache keys include team and input receipt; refresh resets previous chart state; the disposable browser cache is bounded to128 entries. The history API can read the identical evidence from an existing current board without writing player history. The UI explains the48-hour lag and that up to ten eligible appearances feed the model. Original forecast values, timestamps, coefficients, probability/EV formulas and frozen historical rows are unchanged.

**Scope limitation:** this adds evidence to newly computed forecasts, never backfills original frozen receipts. Older forecasts without matching evidence still use the existing saved-official-log path and can truthfully remain unavailable. Head-to-head/career-history recovery is not certified by this task. No claim that all historical charts are now restored.

### NFL

There were two denied athlete-log dependencies: the ranking route's historical baseline and the fitted forecast's independent refresh. Quotes could succeed while the latter set every forecast to `recent_official_history_unavailable`. Retrying either log was not a solution.

Both now use supported ESPN **team schedule + official FINAL boxscore** resources already used by the official integration. The adapter validates exact event, regular season, team, opponent, final result and the conservative48-hour availability lag. It parses actual attempts, carries and targets alongside the correct passing/rushing/receiving statistic and feeds the **unchanged** baseline/model parsers. No missing player row/category becomes zero. A complete current player/team/season input slice replaces an older bundled revision in memory; saved predictions and source records are not modified.

The adapter checks the complete current regular-season team calendar, bounded to17 FINALs (the model's last10 *player appearances* must not be confused with ten *team games*). It coalesces players by team, admits two team builds, imposes a20-second overall deadline/2MiB body bound, and checkpoints each normalized FINAL in the existing operational source cache. Completed inputs survive a retry or isolate restart. HTTP403/429/timeout handling preserves partial work and respects persistent cooldowns; no automatic provider retry, credentials, alternate identity or access-control bypass is introduced. Existing sport lanes, denial accounting and request reservations remain in force. Unsupported fitted markets do not launch pointless full-game refreshes; offline-only evaluation does not initiate NFL source fetches.

**Real authorized source check:** all58 HTTPS requests returned200: six calendars +52 distinct FINALs for the six November26 teams. Two concurrent requests, zero retries; slowest510ms. This was the authorized workspace network, **not a Cloudflare production egress pass**. Exact endpoint/timing/raw-body checksums are in [nfl-source-proof.json](nfl-source-proof.json); the public official header/boxscore responses are retained in the test fixture. No additional athlete-log or provider-entitlement investigation was repeated.

## Targeted verification

**73 distinct targeted checks passed, zero failed; TypeScript exit0 / zero diagnostics.** The final19 affected checks were repeated after the last code changes; they are included in73, not added again. No complete-suite rerun or production build.

- [71-check focused regression](targeted-regression.log): exact NBA model/history parity, original records, NFL/quarter display holds, signed EV behavior, NHL count safeguards, existing performance cache and job admission/cancellation.
- NBA: **204 eligible census players per market ×7 =1,428 history/forecast pairs**, including roles beyond the top25. Points, Rebounds, Assists, Threes, PRA, PR and PA all pass exact input-vector/history checks. This reuses the previously authorized November23 source census; it is not a repeated quote/card audit or a live production pass.
- [Compiled NBA history route](nba-history-runtime.log): first/last eligible census cases in each market,14 correct responses; **zero source calls, zero history writes**, cached forecast bytes unchanged. A fresh source keeps its true receipt time even when it arrives just after the request's existing decision clock; no forecast is restamped.
- [Compiled actual NFL forecast attachment](nfl-forecast-runtime.log): real approved November24 quote-board rows for the November26 slate + the new authorized official source responses. All96 input rows/identities and original quote timestamps remain present:

| Market | Recorded quote rows | Independent projections | Genuine holds |
|---|---:|---:|---|
| Passing yards | 6 | 5 | 1 fewer than3 appearances |
| Passing TDs | 6 | 5 | 1 fewer than3 appearances |
| Rushing yards | 10 | 10 | None |
| Receiving yards | 37 | 34 | 2 role-uncertain;1 fewer than3 |
| Receptions | 37 | 34 | 2 role-uncertain;1 fewer than3 |

Joe Milton III remains held for insufficient history. Across the five markets this is **88 independent projections and8 legitimate holds**, not96 invented forecasts.

**Confidence/EV limitation:** passing yards, rushing yards, receiving yards and receptions retain the existing `price_validation_failed` safeguard. Restoring point projections does not approve their probabilities or enable confidence/EV. Passing TD pricing still needs a genuinely fresh, correctly matched quote. Recorded quotes were not restamped to manufacture fresh EV; all archived-price comparisons remained unavailable in this replay. Q1, first-TD, unsupported model markets and defensive market limitations remain distinct. Existing signed/zero EV and validated NBA behavior were preserved by the targeted tests and reused live evidence.

Compiled workerd/SQLite recovery tests additionally passed:

- Artificial10-operation budget: **3 →7 →9 completed FINALs**, including full isolate restart; only10 provider calls (one calendar+nine eligible FINALs). Repeated completion does not restamp input rows.
- Persistent403: keep the first completed FINAL, stop network retries inside the cooldown, survive restart, and allow a different lane/foreground request to succeed.
- HTTP429: enforce120-second origin cooldown, retry only after expiry, preserve cursor and finish; only the failed source is retried.
- Stalled body: cancellation stops source processing, leaves the previous checkpoint intact, no detached follow-up requests; recovery succeeds.
- Six-team cold input recovery alongside foreground traffic: **58 source calls, max2 concurrent,116/220 charged operations**, 817ms local replay wall time. This is isolated compiled runtime evidence, **not production speed/CPU/heap or a complete capture/grading rotation**.

## NHL: retained limitations, no new coverage patch

Reuse the actual November24 acceptance responses: eight Shots and eight Points rows with complete requested official history. Eight Goals/eight Assists source rows are subject to existing count/price-validation holds; they are not missing provider records. Saves has four model-only rows but **zero verified current quotes**, and Blocks has a quote-backed row but no fitted market model. No fabricated odds, forecasts, increased caps or frozen CW08 model changes. These do not become a production coverage pass in this task.

## Only426 new records backed up

The existing20,478-record chain was reused unchanged. Read-only export of **252 original receipts +138 saved picks +36 grades**, not another full export, was saved as a new file in the existing Railway Backup Drive folder owned by the configured Sach Sports account. The new complete manifest references that426-record delta and the original chain.

- Delta Drive ID `1y1qSgnRwsOjg3I3jF8bbkZfALwgqFBnM`;661,019bytes; SHA256 `c47fd9dbccd608394b3de0877a9d8e8b5987c3f5674ab8c4fb44e3bb32f330f1`.
- Complete manifest ID `1UPEAyr4x9mWoFF0jzso80ilYDG_BvOeY`;1,289bytes; SHA256 `1fd9aab55319ce90ce85daa3365a0592def16eb41fbdf4b9224ac08dbf41ccc5`.
- Both downloaded from Drive and verified byte-for-byte. No sharing changes or old backup overwrites.
- Isolated SQLite restore: **20,904 records**, four full-row inventory hashes match, all20,478 original row JSON/hash bytes unchanged, duplicate insertion rejected, integrity check `ok`. Final read-only production inventory still matches exactly.
- [Backup/restore proof](backup-proof.json) contains the four counts/hashes and verification. Private row exports and local databases are intentionally excluded from GitHub.

## Production safety and outstanding acceptance

[Fresh read-only safety checks](production-safety.json): active dashboard fallback remains deployment `72ab06fe-229a-4ece-a5d8-96eb1da50f6e` / version `a48c431a-5c3e-4491-8529-38cb20dfa898` at100%. Original build/deploy commands remain restored; branch include remains only `__cw08_manual_release_only__`. CW08 remains deployment `39ea465b-ca3f-47f8-9bd2-50eb2f1ad174` / version `46e95f99-98f2-4abe-a2b2-0ff24b4f8e4b` and15-minute schedule. No dashboard upload, new service, binding/schedule/credential change, production data write, historical import or research-table access.

**Keep R1/CW09/CW11/V62 open.** Source recovery and supporting-history candidate gates pass, but live acceptance has not occurred. Remaining requirements: genuine Cloudflare production source/browser acceptance of these fixes; legitimate probability/quote holds and supported-market availability; current operational initialization; all38 capture markets; all three grading rotations; complete archive/period reconciliation; the remaining173 older ungraded predictions only where official evidence permits. Preserve the already verified Prediction Dashboard speed/refresh evidence. No item is moved to100% merely because candidate tests passed.

Next action is a bounded review of the now-explicit NFL probability-validation limitations and actual supported-market acceptance criteria, followed by separately authorized release preparation/production verification when those gates are satisfied. **No replacement release is prepared and no deployment approval is requested by this task.**
