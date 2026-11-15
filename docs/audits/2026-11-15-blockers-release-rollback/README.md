# Approved dashboard release — live gates failed; fallback restored

The user approved the frozen dashboard release. Manual Cloudflare build `279281f0-51c3-42ec-b1c0-48c070cdc751` succeeded using package commit `debdd62`, source `1167c46`, and exactly the approved digest `1a78b897e0bd1f35b1de61009e5ca5b8abe33011619fd2a0ad46e9b81c72cd68`. It installed dependencies and unpacked/uploaded the prebuilt artifact; it did not compile or redesign the dashboard. No namespace, migration, paid service, credential or hosting change was introduced.

| Action | Toronto time, November 15 | Deployment | Version |
|---|---|---|---|
| Approved candidate activated | 12:42:00 PM | `5f1e0a2b-ca18-4405-9775-50f24f447a67` | `d3f4639d-29a7-4763-ab43-9a7bbfd5d5c8` |
| Compatible fallback restored | 3:14:05 PM | `9b1c3dea-a683-4e0f-9f42-71236a095a9d` | `a48c431a-5c3e-4491-8529-38cb20dfa898` |

These are the actual Cloudflare timestamps. Live acceptance was performed in the later verification window around 3:13 PM Toronto. The current production version is the fallback, not this candidate. The approved candidate was withdrawn and its unchanged archive remains available for audit. Its preparation command now rejects it. Do not redeploy it or retry the old manual build.

## Critical failures

**NFL cold capture still fails.** Subsequent jobs repeatedly returned `rankings_unavailable`, remained in `rank`, reached ten stalled attempts, had no checkpoint for those jobs and set `needsAttention=true`. Denial-cache reuse was observed (57 hits in one attempt), demonstrating that avoiding repeat 403s alone did not make the actual application route complete. The generic capture error discards the unsuccessful ranking payload's detailed cause; the precise remaining application/feed cause has not been established. The runtime test previously used a controlled ranking-response fixture and therefore did not prove this complete cold production route. No access controls were bypassed.

Some earlier collection did advance: since the predeployment cutoff, the database gained 113 NFL original receipts/four picks and 102 NHL original receipts/32 picks. Those are preserved. This partial success does not satisfy the later cold-recovery gate. NBA/NHL capture and grading lanes advanced independently, but some NBA/NHL capture completions had zero eligible rows; phase completion alone is not complete market coverage. A separate NHL First Goal job deferred on `rankings_http_503` after 31 source checkpoints; no successful recovery for that job was established.

**NHL browser coverage was not acceptable.** Shots, Points, Assists, Saves, Goals and Blocks had zero eligible displayed predictions. The API retained 25 raw skater rows per market and 23 raw goalie rows; these must not be represented as eligible picks. Shots/Points reported `player_team_history_unavailable` for evaluated candidates; Saves additionally reported missing verified quotes. All had zero verified sportsbook quotes and returned the model-watch source with sportsbook lines pending. Schedule/player source diagnostics were available; the endpoint-level cause of missing sportsbook/model evidence remains unconfirmed. The skater candidate diagnostic reported 208 available / 64 evaluated, which also requires real eligible-population validation, not a count increase. The UI explained missing evidence, but the required reload acceptance check timed out waiting for a ranking card. No predictions or odds were invented to make that check pass.

Rollback was initiated when these live failures were confirmed. No further deployment was attempted.

## What passed and what was not completed

- All 17 NFL tabs displayed quote-backed rankings in actual browser/API checks: quarterback categories 16 each; rushing, receiving, receptions, touchdown and Q1 receiving/rushing categories 25; rush+receiving 21; sacks 24. These were retained/public rankings, not proof of a successful cold collection. No browser page or hydration errors were recorded before the later coverage timeout.
- All seven NBA API markets returned HTTP 200 during the verification read. PR returned 23 rows in 0.312 seconds, without the earlier 503. Points/Rebounds/Assists/Threes had mathematically checked positive and negative EV where valid; exact zero was not present in live data and was not manufactured. PRA/PR/PA had no valid EV in the returned snapshot, with the explicit reason that component projections alone cannot supply a joint probability model. This limitation must remain visible; it does not establish full NBA combination acceptance.
- A version-filtered retained-log query over the candidate window found zero matching memory-limit, hard-subrequest-limit or `job_subrequest_budget` messages. This supports the bounded-work improvement but does not excuse the failed release or guarantee absence of all unobserved failures.
- Browser verification stopped at the critical NHL reload failure before completing the NBA browser checks. Full featured/history/schedule acceptance was not completed after failure; do not claim it passed. Post-rollback API checks confirmed the NFL slate and NBA PR route remained available.
- Preflight frozen digest, production config, fallback archive and four artifact checks passed. The source had previously passed 805 regressions and zero TypeScript diagnostics. After quarantine, four artifact/safety checks passed and attempting candidate preparation fails as intended.

## Evidence preservation and infrastructure

All 18 predeployment database checksum groups match exactly, with the fixed cutoff `2026-11-15T17:40:00Z`. This covers existing original receipts, picks, grades and historical documents. Across current original/pick/grade tables, duplicate key counts are zero. New grades since the cutoff include 11 NFL and 31 NHL results; all join to the exact original pick checksum, with zero missing originals and zero checksum mismatches. No tables, queues, reservations or evidence were deleted during rollback. The same dashboard SQLite namespace and KV are preserved.

Dashboard automatic builds remained paused through the entire manual release; the include filter is still `__cw08_manual_release_only__`. Original build/deploy commands were restored after the manual build was created. No token values were requested, copied or exposed.

CW08 stayed on deployment `39ea465b-ca3f-47f8-9bd2-50eb2f1ad174`, version `46e95f99-98f2-4abe-a2b2-0ff24b4f8e4b`, with its */15 schedule unchanged. Its read-only status remained ready; receipts increased from 899 to 902, with 658 grades, zero pending uploads and no storage error. Frozen research model/protocol/receipts were untouched. Dashboard job alarms are held by the compatible fallback; CW08 continues separately.

No completion tracker rows were moved because the combined repair failed live acceptance.

## Required before another release

Reproduce the actual NFL cold rankings route inside the Cloudflare runtime, including real denied-source and unsuccessful provider responses, and prove rank-to-originals-to-done progress for genuinely eligible quotes. Preserve and diagnose safe error reasons instead of relying on a synthetic successful board. Resolve/verify NHL sportsbook and player/team history coverage against the eligible population, and check NBA combination model/EV availability without rewriting saved originals. Rerun source, runtime, browser and scheduled recovery gates. Freeze a corrected artifact and obtain fresh approval. The repair is not 100% complete.
