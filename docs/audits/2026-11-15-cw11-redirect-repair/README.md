# CW11 / V62 — cold NBA summary redirect repair

Verified code: `600bd5d22811ddf17be9684b0cab2a86ed22d7ed`, continuing `eaa6cf9` on `cloudflare-compatibility-test`. No deployment. CW11 remains blocked pending a fresh approved artifact and complete live acceptance; V62's failed-release/rollback record is retained.

## Exact failure and request path

The diagnostic-only replay uses the unchanged withdrawn bundle from package `fe2f058`, whose archive and bundle hashes were verified before extraction. It runs in workerd/Miniflare at the existing production compatibility date `2026-11-06`, `nodejs_compat`, the 350-subrequest ceiling and isolated KV/SQLite DO bindings. The request and replay clock match production: `/api/dashboard-summary?sport=nba&scope=current`, `2026-11-16T04:33:39.624Z`.

The path is: Worker fetch → real compiled Vinext router → dashboard-summary GET → game-slate GET → loadNbaGames(false) → NBA fetchJson → nbaSourceFetch → nbaOfficialFetch → official-history-source read → global fetch with `redirect:'error'`. workerd rejects that option before any official scoreboard request is sent. The short-window catch then retries the wider calendar, which fails identically; game-slate returns 503 and summary publishes unavailable/null counts.

The unchanged withdrawn Worker reproduces **503, unknown game count, 24 unsupported redirect attempts and zero outbound scoreboard requests**. The same request, clock and recorded official input contract through the corrected compiled Worker returns **200, 17 games, zero unsupported attempts and eight scoreboard requests**. The test-only entry adds a clock and a redirect-option counter, without replacing business routes, sources, caches or models; its diagnostic headers/control are never included in the shipping bundle. No new live deployment was used for reproduction.

This establishes the confirmed redirect cause rather than assuming memory exhaustion. V62's same-request production logs already identify this unsupported option. Cold background capture was an insufficient regression gate: its request-budget wrapper replaced the native redirect option with `manual`, masking the foreground defect.

## Corrections

- Use Cloudflare-compatible `manual` mode in the shared NBA/NFL official-source wrapper. Explicitly cancel/reject 301/302/303/307/308 responses instead of following another URL or leaking credentials. Combine the existing eight-second deadline with any caller cancellation signal.
- Make background accounting honor an explicit manual/error redirect policy. Default allowed-host redirect handling remains metered and bounded; an explicit no-follow request cannot silently take another hop. Concurrency, reservations, durable checkpoints, denial cooldowns, retry caps and immutable evidence logic remain intact.
- Exclude live scoreboards from the 15-minute historical-source cache. Their validated short NBA cache remains responsible for current game data.
- Validate the NBA scoreboard `events` array before accepting a payload into that short cache. The new malformed-response recovery test exposed the earlier cache poisoning: a JSON 200 response with no valid scoreboard could keep later healthy reads failing. Malformed data is now rejected before caching; valid data recovers normally.

NFL foreground history/search uses the same previously broken wrapper and receives the compatible behavior. A cold compiled NFL route now actually reaches the intercepted official 403, retains its legitimate quote-backed row and creates no fabricated betting selection. NHL uses its separate provider transport, without this unsupported redirect option; its compiled current-season, denied-feed and ranking tests pass unchanged. CBB/CFB integrations remain covered by the full suite; their transport and sports logic were not modified. No sportsbook odds, model coefficients, probabilities, rankings, EV formulas, research protocol or historical records were changed.

## Verification

All provider/database traffic during compiled tests is intercepted, with synthetic bindings and isolated state. Official NBA scoreboard fixtures were collected once from public authorized endpoints and include source URLs and response digests; they are runtime diagnostics, not fresh model validation or production authentication claims.

- **Full suite: 830 passed, 0 failed, 11 skipped**. Ten skipped compiled-summary cases were executed separately; the remaining skip is the opt-in older retry-starvation artifact diagnostic.
- **Compiled runtime: 17 passed, 0 failed**, plus the separate instrumented summary rerun **10 passed, 0 failed**. This covers the exact cold summary, fresh concurrent summary/slate requests, same-host/cross-host redirects, HTTP 401/403/429/503, malformed data, bounded timeout/recovery, NFL cold capture and lost-acknowledgement restart, foreground NFL history, and NHL coverage/denials.
- Concurrent cold requests (two summaries and one slate) agree on 17 fixtures and share eight scoreboard reads, with no history writes. No provider credentials are forwarded to the public official source. Test history requests require the configured synthetic server binding and are read-only.
- Redirects are not followed; authentication denials are not softened, alternate-host access is not attempted, and rate-limit recovery respects the cooldown. Failed schedules produce explicit unavailable responses and null summary counts; existing same-day snapshot-retention tests preserve previously verified cards/schedules instead of clearing them or inventing a zero slate. A genuinely cold unavailable feed cannot produce invented games.
- The real eight-second source deadline is exercised. The forced-hang summary fails safely and recovers after valid data returns (about 18 seconds across the existing short/wider attempts in the recorded run). This is not a measured production latency guarantee.
- No unsupported-redirect, cross-request I/O, uncaught workerd or Miniflare compatibility error appears in the corrected runtime logs. Native option instrumentation records zero unsupported attempts. Existing NBA signed/zero EV, PR memory, featured, schedule/count, historical preservation, admission and grading regressions pass.
- TypeScript: zero diagnostics. Production compilation and prebuilt Cloudflare dry-run pass. Tested bundle digest: `ce7c248d2f422d03808379f89ff70dd48d55e448692100f2775f6103ecb4152d` (424 files). This fingerprint is test evidence; it does not authorize uploading the older withdrawn artifact or imply a new approved release package.

## Production protection and recommendation

Read-only Cloudflare checks confirm the dashboard remains fallback deployment `4e8f8721-6e0a-4836-b877-9446a0f360d0`, version `a48c431a-5c3e-4491-8529-38cb20dfa898`. Automatic-build inclusion is still `__cw08_manual_release_only__`; original build/deploy commands are unchanged. No production binding, schedule, namespace, credential or historical record was modified.

CW08 remains deployment `39ea465b-ca3f-47f8-9bd2-50eb2f1ad174`, unchanged version and `*/15` schedule. Read-only status is ready: 938 receipts, 781 grades, 162 completed cycles, zero pending uploads and no storage error. Frozen model/protocol and evidence are untouched.

**A new controlled deployment is technically justified for this repaired blocker.** Required next steps are to freeze a fresh artifact from this verified source, verify its digest/configuration and compatible fallback, obtain approval, and complete the full actual production browser plus all-sport scheduled capture/grading acceptance. Restore the compatible fallback immediately on any critical live failure. Existing provider/history/model-support limitations remain explicit and are not fixed by redirect compatibility. Do not mark CW11 or V62 complete from these offline checks.

Tracker update retains CW11 as Blocked, appends the verified repair results to its existing notes, and updates V62's evidence/next step without erasing the original failed release. No rows move to 100% completed. Cell readback is verified; native Sheet rendering was unavailable and existing formatting was preserved.
