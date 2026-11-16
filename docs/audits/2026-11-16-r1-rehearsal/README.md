# R1 rehearsal — frozen, not deployed; backup restore gate open

**Latest status:** [explicitly authorized current backup and real Drive restore passed](../2026-11-16-r1-current-recovery-complete/README.md) for all20,466records. The earlier access/export/current-coverage blockers below are preserved historical evidence and are superseded. Frozen R1 is ready for controlled deployment approval, not deployed or production-complete.

Follow-up: [existing-folder discovery and real archive restore](../2026-11-16-existing-backup-restore/README.md) supersedes the access-blocker assessment below. The owner account already has access; eight scheduled manifests restore successfully. Full-current recovery coverage remains a separate unverified gate. No new folder/sharing is needed.

The tracker authorizes R1 development and verification. It does not authorize a deployment. The production dashboard still runs compatible fallback `a48c431a-5c3e-4491-8529-38cb20dfa898`, deployment `4e8f8721-6e0a-4836-b877-9446a0f360d0`. CW11 and failed production verification V62 remain open. No item moved to 100% completed.

## Frozen artifact

`frontend/releases/r1-2026-11-16/manifest.json` pins source `2bf33d6f9bfc0a57aaa42b7346ebcce65422680a` and application repair `600bd5d22811ddf17be9684b0cab2a86ed22d7ed`. The application directories are identical across those references. Fresh production build and prebuilt deployment dry-run succeeded; TypeScript has zero diagnostics. No upload occurred.

The 424-file production bundle/config/assets digest is `d7714dc0cac2f05950a0eed9b7bd7a9aebd82893465c25635f4dbe8907f4f71b`; archive SHA-256 `f6bf43437e726879c89cf1ef274d061d0e0736d2e918e8cd1410b92c426f9b54`. Preparation verifies source ancestry, archive integrity, configuration and extracted fingerprint, and refuses deployment flags. Existing withdrawn candidates remain quarantined. See the adjacent release plan for the exact scope and pending production acceptance.

## Exact failure and runtime recovery

All provider/database traffic in compiled tests is intercepted, with synthetic binding values, isolated SQLite/KV and workerd's production compatibility flags, 350 subrequests and 30-second CPU bound. Authentic recorded fixtures are distinguished from generated fault/grade fixtures. No test writes production storage.

- **Withdrawn reproduction:** same NBA summary request and clock as V62: HTTP503, 24 unsupported `redirect:error` attempts, zero outbound scoreboard requests.
- **Frozen candidate:** HTTP200, 17 authentic recorded games, zero unsupported redirect attempts, eight scoreboard requests. Two simultaneous cold summaries and a slate agree and coalesce those eight reads; no history writes.
- Same/cross-host redirects, HTTP401/403/429/503, malformed JSON and a genuinely delayed source are rejected safely, produce unknown/null counts rather than invented zero games, and recover on valid responses. Timeout recovery completed in approximately 18–20 seconds across the entire multi-request summary test, not a live page-performance measurement.
- Cold NFL capture reaches the authentic quote and intercepted ESPN403, writes source checkpoints and advances to originals with 22 measured requests / max four active sources. Lost database ACK and restart preserve the first receipt; no unvalidated betting selection is created. All 17 retained foreground tabs remain responsive during an in-flight background source.
- Compiled NHL cold routes retain legitimately quoted Shots/Points/Saves and use season20262027 official history. Denied feeds become explicitly unavailable rather than healthy empty boards; later tests retain the model holds.
- **Rollback/storage:** candidate -> the actual `namespace-fallback.js` entry -> candidate uses the same persisted SQLite/KV and pending evidence. The fallback reads unchanged documents and original receipt, then candidate recovery completes without duplication. The initial harness incorrectly imported the fallback's underlying `index.js`; it was corrected to read the frozen manifest's mainModule. Historical-clock alarm delivery is not forced, avoiding a misleading real-time rearm loop. This is local compatibility proof, not a production rollback action.
- **Shipping official-final grading:** NBA/NFL/NHL lanes run concurrently through the actual frozen grading routes and parsers, using explicitly synthetic official-final contract fixtures. Each completes; a lost grade ACK forces restart and readback, with exactly three insert-only grades and unchanged pick objects. Maximum measured requests per phase: NBA4, NFL6, NHL6. This is not a claim that three real games were graded in production.

Compiled execution: **19 passed, zero failed**, comprising 18 in `compiled-final.log` plus the separately added shipping-grading test; the old withdrawn NFL starvation diagnostic is opt-in and excluded. The withdrawn NBA reproduction separately passes its one diagnostic assertion. General compiled job stress tests additionally cover 180 concurrent NFL inputs, forward checkpoints after exhaustion, cancellation, independent lanes, durable429 cooldown, 324 eligible synthetic NHL captures and grading 271 synthetic picks beyond the old250-row page. These synthetic counts are not dashboard or pick coverage claims.

## Full regression and browser rehearsal

Final full suite: **832 passed, zero failed, 13 skipped**. Skips are ten summary cases, the withdrawn NFL diagnostic, and the new frozen-only rollback and grading cases. Summary, rollback and grading are executed explicitly in workerd as documented above. Full checks retain NBA EV/PR, featured/history, CBB/CFB shared integration and deferred-sport history protections.

The first full run had two failures in `nfl-route-cache.test.mjs`: the VM clock was frozen to the recorded November15 input, but imported `activeFootballBoardDay` used the real host date. That incorrectly selected another slate and invoked the mocked feed. The test now supplies the same recorded clock to the real helper. The retained-board and later-block merge assertions remain strict; no application logic or recorded ranking was changed to make them pass.

Frozen local UI with intercepted authentic recorded November15 API responses passed desktop and 390×844 viewport checks, without page/hydration errors:

| Sport | Recorded UI rehearsal results |
|---|---|
| NBA7 | Points23, Rebounds23, Assists22, Threes25, PRA17, PA17, PR20; EV labels on every rendered card |
| NFL17 | Five QB tabs16 each; Rushing25, Receiving25, Receptions25, Rush+Receiving21, AnytimeTD25, FirstTD25, Sacks24, Tackles25, Tackles+Assists25, Q1Passing16, Q1Receiving25, Q1Rushing25; unavailable forecasts explicitly explained |
| NHL6 | Shots25, Points25, Saves7; Assists/Goals/Blocks0 renderable cards with the existing validation/model explanations |

Zero NHL renderable cards in the held markets is not treated as missing feed evidence or repaired by inventing forecasts. The recorded API can contain quoted candidates that do not meet the supported display/validation requirements. Their frozen safeguards were preserved, not relaxed. This release does not validate a new NHL model.

Forced PR503 refresh retains all20 recorded cards and a stale-data explanation. Recorded NBA/NHL featured players remain the same; historical API replay retains the recorded NBA382 completed observations. Unit/runtime EV tests preserve positive, negative and exact-zero EV, quote identity and absence reasons without altering ranks/predictions/history. Browser replay does not prove fresh API processing, real device/PWA installation, live cold latency, production memory headroom or scheduled acceptance.

## Current production reads and provider limits

Read-only dashboard checks use the existing public routes and actual configured Worker bindings with truthful `SachSports-ReleaseAudit/1.0` identity, TLS verification and the managed environment's normal proxy. No provider keys are read, copied or changed. Direct Node networking initially lacked the environment proxy and was connection-refused; enabling Node's standard environment-proxy/system-CA support fixes the audit client's transport, not provider authorization.

The current fallback returned NFL Passing2 rows (2.68s) and NHL Shots25 rows (5.31s); these are fallback API observations, not R1 live acceptance. Fresh dashboard NFL quotes and HTTP200 OWL upstream telemetry are recorded separately. A tomorrow NHL response alone is not fresh authenticated-quote proof: it returned25 retained/unpriced rows and zero fresh verified quotes. The separate current-slate NHL check returned25 fresh verified quotes (latest quote11:02:43.545UTC), HTTP200 at11:03:46.976UTC. Together with the two verified NFL quotes this clears the current dashboard-bound feed gate, without treating tomorrow’s unavailable prices as fresh evidence. No expired/saved response clears that gate.

External limitations remain distinct from R1 defects: ESPN athlete-gamelog/search403 may prevent fresh history-derived probabilities; SportsGameOdds401 is not repaired or assumed entitled. OWL can return valid quotes without every player/market having a validated model or history. No repeated blocked-endpoint retry cycle, purchase, provider switch or credential rotation occurred.

## Backup blocker and live safety

Production logs confirm November16 daily retention archives for November10: NBA127 documents/four parts, NFL17/one part, NHL55/one part, plus shared college archives. Their `restored:null` field means the optional restore observer did not run. These are retention-day successes, not proof of a complete current history/pregame backup or non-destructive restore.

Neither connected Drive account's targeted search located the current `cloudflare-staging-history-v1` manifests. Older legacy archive segments and capture-manifest folders cannot substitute. The remaining preapproval blocker is access to the actual latest complete history AND pregame manifests/parts, followed by byte/checksum/inventory validation and isolated restoration. A folder link accessible to the connected Sach Sports account has been requested. Do not waive this tracker gate or request deployment approval meanwhile.

Read-only fixed-cutoff current-session inventories verify all18 sport/table groups unchanged across the rehearsal. These independently calculated inventories are not mislabeled as matching an older audit's different hashing algorithm. No production writes, deletes, namespace changes or migration occurred.

Cloudflare readback confirms dashboard automatic builds still exclude `cloudflare-compatibility-test` via the existing `__cw08_manual_release_only__` filter. Existing dashboard bindings, fallback version and schedules remain unchanged. CW08 remains on deployment `39ea465b-ca3f-47f8-9bd2-50eb2f1ad174`, frozen model007c02b and `*/15` cron: 953 receipts, 871 grades, 186 completed cycles, zero pending uploads or storage error at the read. Research OWL HTTP200 responses continue; no research mutation occurred.

Terminal logs have only trailing whitespace normalized; response fixtures and frozen archives are unchanged.

## Reproduction

From `frontend`:

```sh
npm run build:vinext
node scripts/prepare-r1-release.mjs --prepare-only
node scripts/prepare-r1-release.mjs --dry-run
npx tsc --noEmit
node --test tests/*.test.mjs
```

The first command checks current source buildability; the subsequent preparation **replaces its output with the frozen archive**, which is what the following compiled tests must load. Extract fallback into a separate temporary directory with `prepareRelease('fallback', path)` and keep its verified main entry.

```sh
SACH_COMPILED_RUNTIME=1 SACH_REPLAY_BUNDLE=/absolute/frozen/workers/default/bundle SACH_FALLBACK_BUNDLE=/absolute/fallback/workers/default/bundle node --test tests/actual-cold-routes.test.mjs tests/compiled-summary-redirect.test.mjs
node scripts/r1-browser-server.mjs
```

In another terminal (Python Playwright and Chromium required):

```sh
python scripts/r1-browser-markets.py /absolute/local-output
python scripts/r1-browser-nfl.py /absolute/local-output
python scripts/r1-browser-markets.py /absolute/local-output --mobile
python scripts/r1-browser-nfl.py /absolute/local-output --mobile
```

The browser server extracts/verifies the frozen artifact into temporary local storage and denies every outbound request. It listens on127.0.0.1:3027 only. It must never be used as a substitute for approved real production browser acceptance.

**Decision:** application/runtime rehearsal passes; the full preapproval rehearsal is **not cleared** because the complete backup restore remains unverified. No deployment approval requested. Finish that gate, recheck frozen identity/live safety, then request controlled deployment approval. Actual production browser, resource and full scheduled capture/grading acceptance remain mandatory after approval.
