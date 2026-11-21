# November 21: seed reconciliation and all-category ranking audit

**R1 remains blocked. No deployment or import was performed in this task.**

## The frozen seed was already imported

The interrupted work had completed the explicitly authorized insert-only import on November 17 at 8:07:51 PM Toronto. Commit `60f9b9c` now preserves its actual execution receipt, SQL acknowledgements, full source readbacks and protected-inventory comparisons in [the production audit](../2026-11-17-nba-import-production/README.md). This is reconciliation of completed work, not a second import or a new authorization request.

Frozen artifact: `NBA-FINAL-SEED-2026-11-17-7a5cba7d706f`; session from `d0a63bb`, mechanism from `29e97b4`.

November 21 read-only checks:

- 101 immutable FINAL sources, 101 successful-check pointers, 764,248 encoded bytes; one publish, zero rollback/consumer events.
- All 101 recorded source SHA-256 values, sizes and original verification timestamps match the frozen session. Zero pointer/hash mismatches. Local package hashes are unchanged: plan gzip `c6f828e8463b1bb616e2f88b86f0049cbb67156a1b9404469dd3ef8d74dba6c4`, session gzip `ff969f9b2e9ad3be1870916448f1d79a1d979e4e93c62b38781847c6dc550794`, session digest `7a5cba7d706f70dbfd1a8e2196d2aa6a44f8987f13b105361ebdeb0508262ef3`.
- The NBA object has no current lease. Two old `active` and two `blocked` jobs have not changed since November 17; 60 jobs are done. Old active-state rows are not proof that a collector is currently executing. No competing maintenance was started.
- Current page-count/page-size PRAGMAs were rejected by the authorized SQL API (`SQLITE_AUTH`). No alternate route or permission bypass was attempted. The completed import's earlier capacity checks remain evidence of its preflight; **current physical capacity was not reverified**. No further write is planned or authorized.
- Final protected inventories and ordered full-row fingerprints are unchanged: history 11,615; original receipts 6,111; picks 1,473; grades 1,269, total **20,468**.
- The verified backup manifest and three objects remain in the existing Railway Backup Drive folder. Its existing isolated restore covers **20,466**, leaving **two original receipts outside that backup**. This task neither changes that backup nor claims the gap is covered.
- Dashboard remains deployment `b1ef6404-fd00-4312-857c-c50013bb64a2`, version `a48c431a-5c3e-4491-8529-38cb20dfa898`. CW08 remains deployment `39ea465b-ca3f-47f8-9bd2-50eb2f1ad174`, version `46e95f99-98f2-4abe-a2b2-0ff24b4f8e4b`. Automatic builds still exclude this working branch through `__cw08_manual_release_only__`; build/deploy commands unchanged.

See [read-only checks](production-read-only-checks.json). The seed's full body hashes were verified during the original import; this task compares the current stored hash metadata, sizes and pointers rather than pretending to repeat those original full-body readbacks.

## Actual production coverage

All **37 registered categories** were requested through real Chromium sessions with normal TLS verification. The audit includes 14 NBA, 17 NFL and six NHL categories, rather than just the seven primary NBA markets. Every captured ranking API returned HTTP 200. Every category was also visited on desktop (1440px) and mobile (390px), expanding the entire ranking list.

NFL was checked on **Sunday November 22**, matching its actual sportsbook/game slate. Today's November 21 view has no NFL games and is not evidence of missing Sunday players. Recorded API counts and later live browser counts are separately timestamped; dynamic feeds can differ between checks.

Auxiliary player-history/performance/settlement requests were explicitly suppressed in the read-only UI audit to avoid their application write paths. Ranking/schedule/summary responses were live. Therefore this audit does not claim full history-flow or production-release acceptance.

[Every-category matrix](market-matrix.md) includes raw API rows, actual production browser counts, and separately labelled candidate replay counts. Detailed reports are compressed alongside it.

### NBA

Thirteen markets return `boardUnavailable:true`, `boardFrozen:true`, and `No pregame board was recorded`. First Basket returns 20 genuine priced entries. Today's first game began at 1 PM Toronto; the original daily pregame board was absent at the lock boundary. The old UI silently presented those successful empty responses as zero rankings. A historical seed does not authorize recreating a pregame board after the fact.

Current NBA schedules and book-only First Basket quotes are available. **Fresh, complete NBA player discovery and current model context have not been verified.** Previously retained discoveries are expired; their timestamps are not renewed. Ordinary player-history GETs can persist source history, so no such production source-refresh request was added under the read-only restriction. No private-preview or denied-client investigation was repeated.

### NFL

The real API has quote-backed rows across all 17 supported tabs. The active fallback still filters many valid research/baseline rows using full betting qualification: Sunday Passing Yards displays zero despite 23 captured source rows. Existing candidate code already distinguishes a fitted projection from a historical baseline and explains absent confidence/EV; this audit verifies that existing repair across the complete recorded population rather than inventing new probabilities.

The candidate displays 23/23/22/23/20 passing-related rows, 43 rushing, 61 receiving, 61 receptions, 32 rushing+receiving, 25 anytime TD, 25 first TD, 6 sacks, 10 tackles, 12 tackles+assists and 19/45/33 Q1 passing/receiving/rushing rows at the declared snapshot clock. Displayed quote-backed research is not a qualifying betting selection. Probability validation failures and insufficient official history remain explicit.

### NHL

Actual live and candidate replay counts: **Shots 9, Points 20, Goals 0, Assists 0, Blocks 0, Saves 3**. The real API carries additional quote rows; raw quotes are not automatically complete rankings. Goals/Assists retain validation-failure safeguards; Blocks lacks a fitted model. Lower counts are not repaired by generating picks or relaxing those checks. Existing eligible comparison rows and saved decisions remain intact.

## Verified application repairs

1. NBA missing-original-board responses and wrong-market payloads become explicit unavailable states, retaining any verified board. These terminal evidence conditions do not trigger the five-second failure loop; normal periodic polling remains.
2. NBA/NFL/NHL view-only evidence checks withhold wrong sport/market, missing player/game identity, inconsistent pregame identity, wrong quote period, future/post-start forecasts or mismatched exact quote bindings. No upstream row is relabelled or rewritten. All legitimate rows in the captured 37-market population pass these checks.
3. Shared signed EV formatting now retains valid negative and zero returns for NBA/NFL/NHL. Rank cards explain unavailable EV visibly, including probability-validation failure and First Basket's lack of an independent model. Qualification, probabilities, odds, model calculations and saved selections are unchanged.
4. Removed the arbitrary five-UNDER quota from the affected NBA candidate/display paths. Genuine eligibility and the existing Top-25 limit remain; neither direction is forced. Coverage counts use the same policy. Other sports retain their prior policies.
5. Coverage counters now include NFL's legitimately displayed quote-backed context rows and exact-price comparison EVs, without counting those rows as betting picks. NHL comparison EV counts match its displayed complete forecasts.
6. Collapsed NBA/NFL/NHL cards no longer fan out player-history requests. Only expanded quick analysis requests that evidence. Deferred history is described as deferred, rather than incorrectly saying it is loading. Other sports' history behavior is unchanged.

## Verification and limits

- Every category's actual production UI was audited on both viewports; zero captured page/hydration errors and no page-width overflow.
- Local Cloudflare Vite candidate: every category on both viewports, every displayed card's market identity checked. Real previously captured API bodies and a declared November 21 18:17 UTC snapshot clock were used; **not a live candidate deployment or current production pass**. Desktop/mobile counts match in every category. Collapsed cards made zero history requests.
- Full regression run: **891 cases; 871 passed, three failed, 17 opt-in skips**. All three failures were the older NBA midnight VM harness omitting the pre-existing `nba-history-availability` import: its missing function threw inside the route and became a misleading 503. The harness now supplies the actual classifier; all three DST/midnight cases pass unchanged recovery assertions. No production code was weakened to satisfy the harness. The full suite was not repeated after this test-only correction.
- Final focused ranking/EV/count/model/history checks: **40 passed, zero failed**; post-change coverage check: **13 passed, zero failed**, overlapping that group. The additional all-17 NFL and all-six NHL coverage assertion verifies counts against the actual card eligibility helpers; original payloads remain byte-for-byte unchanged.
- A focused final browser check also verifies three Saves cards and the real -2.1% comparison EV on both viewports, zero collapsed history requests, exactly one request after expanding one card, and an accurate deferred-history label. See `deferred-browser.json` and the two verified screenshots.
- Final TypeScript check: exit 0, zero diagnostics. `git diff --check` passes. Existing NBA seven-market durable-restart/model/probability/EV parity, Cloudflare capture/recovery, history, NFL and CW08 tests passed in the full run. Opt-in compiled release cases were not represented as executed.

**NO-GO for declaring R1 or the ranking work complete.** Next required data evidence is fresh authorized NBA player discovery, complete recent player/team/opponent context and an eligible future pregame board with current quotes. A future release also requires separate approval and real production browser/capture/grading acceptance. NHL model-validation gaps remain open; the frozen CW08 model is unchanged. The two-record backup gap and current capacity-query permission limitation remain explicitly recorded.

No second import, new subscription, production record write, R1 deployment, credential change, namespace creation, model tuning, build restart or CW08 change was performed.
