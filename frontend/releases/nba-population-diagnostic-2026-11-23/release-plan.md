# NBA population diagnostic — exact authorization boundary

**Prepared and verified offline. NOT authorized for upload; NOT deployed; not an R1 release.**

| Frozen item | Value |
|---|---|
| Artifact | `NBA-POP-CENSUS-2026-11-23-01e5a84612d9` |
| Complete inventory/config SHA256 | `01e5a84612d9b65745c2ec8c980d85750602e5522c7b0b33b103e0ce133c4561` |
| Patch SHA256 / bytes | `24285ee5ec901888287c7229eab897a471436dc224f6943f452b1e96e857d302` / 11,227 |
| Target | Existing `sach-sports-cloudflare-test` Worker |
| Base artifact | Already deployed `NBA-ODDS-DIAG-2026-11-21-cae200070535` |
| Base deployment / version | `5f930400-3285-4177-b1d8-ed5307374566` / `48e8858a-7326-41ea-9457-532c74ec3337` |
| Immediate rollback | `48e8858a-7326-41ea-9457-532c74ec3337` at100% |
| Compatible emergency fallback | `a48c431a-5c3e-4491-8529-38cb20dfa898` at100% |

## Exactly what would change

**One existing module:** `bundle/nba-odds-diagnostic.js`. Its original SHA256 is `841a4da64a657c1c252f465ec32693a37162c363d03d8b335efd78db84d01961`; new SHA256 is `92e02d40b55eae5d493cad22475a029fe1bc8847b1a8b53a7350d001bc1d6be8`. The wrapper, 750 other files/assets, configuration, namespaces, credentials/bindings, schedules, queue/alarm code and all prediction models remain byte-identical to the active diagnostic artifact. This does not activate pending R1/UI/NBA-alias/NFL fixes.

Existing seven-market `mode=feed-sample` behavior remains. Add two read-only modes on the same existing GET `/api/market-coverage?sport=nba` route:

1. **`mode=feed-census`**: one existing bound OWL NBA payload, all seven full-game category candidates in one backpressure-driven NDJSON stream. Preserve original player/prop/game IDs, names, category/period, book, line, both prices, nulls, flags and timestamps; nested known player identities are retained and omitted field names explicitly disclosed. Include invalid/suspended/unpriced offers, plus period-excluded candidates. Source coordinates, sequence, per-market counts, SHA256 and completion trailer prevent gaps, duplicates or mixed snapshots. These audit coordinates are not provider IDs. No per-book Top25 cutoff or paging. No filters/caller URLs accepted.
2. **`mode=source-census`**: one official NBA GET per request for fixed `scoreboard`, `summary`, `roster` or current-season `team_schedule` resources at the existing `site.api.espn.com` origin. The established public user agent/Accept profile, manual redirects and eight-second deadline remain; no auth headers/credentials are forwarded to ESPN. No athlete-gamelog probes, alternate hosts/identities or access-control bypass. Receipts preserve actual status, duration, original source URL, response Date/Age/ETag/Last-Modified where supplied, raw-body/payload hashes and actual observation time. HTTP200 is not automatically model validation.

Bounds fail explicitly before a successful full-census response: at most64source games/64books per game/100,000examined props/25,000candidate offers/16MiBserialized offers; official response bodies<=2MiB, maximum2active official reads per isolate. A canceled/incomplete stream lacks a valid trailer and cannot pass offline verification. Source403 establishes a one-hour exact-source denial cooldown;429 honors Retry-After with an origin-wide minimum60seconds. No automatic retries. Only disposable in-memory caches/cooldowns change; **no SQL/KV/R2 writes, imports, prediction generation, capture activation, consumption marking or new infrastructure**.

## Exact authorization requested

Authorize **one controlled manual upload of the frozen artifact above**, plus one bounded read-only current-population collection session through these modes and existing authorized read-only source/storage access. This is not approval for full R1, a production data seed, credential changes, new services or automatic builds.

Before approval there is nothing further to upload or repeatedly probe. After approval:

1. Reconfirm active base, selectable immediate/emergency rollback versions, unchanged production bindings/compatibility/350-request limit/held schedules, build filter only `__cw08_manual_release_only__`, and unchanged separate CW08. Reuse the verified Nov22 20,468-record composite backup; do not repeat the repair/import or imply today's count was re-exported.
2. Reconstruct the frozen candidate with `node scripts/prepare-nba-population-diagnostic.mjs --prepare-frozen NEW_OUTPUT`. Verify manifest, base, single-module patch paths/checksums and full digest. No full dashboard build. Use the previously authorized authenticated manual prebuilt Cloudflare environment; no token transfer or public preview. Stop if permission/review or any safety gate fails.
3. Upload ONLY the verified prebuilt output. Keep automatic builds paused and restore any temporary manual command settings as prescribed by the existing manual procedure. Record deployment/version/time. Confirm ordinary dashboard/API availability against baseline; this is diagnostic acceptance, not the 350-card audit or full-R1 acceptance.
4. Read `feed-census` **once**, save original bytes/status/duration/hash, and run `node scripts/verify-nba-population-stream.mjs CAPTURE.ndjson`. A fresh feed's actual count is N; the older reported5,518 is not a quota. Missing completion/hash mismatch/limit failure means NOT complete. Do not retry a blocked OWL call or reconstruct the omitted1,010 older offers.
5. Use `source-census` to obtain only needed current official slate, teams/rosters, pregame summaries and complete current-season calendars. Reuse already validated FINAL bodies with original hashes/times from the existing records. Fetch only missing eligible FINAL censuses required by those actual calendars (existing21-day window/48-hour availability lag). **Session ceiling:160new diagnostic/source requests, max2in flight, four-minute wall deadline, zero automatic retries; stop on first upstream403/429, unexpected redirect, incomplete/contradictory source or permission error.** If a complete slate cannot fit, report the missing sources and stop; do not call partial data complete or repeat the same blocked endpoint. No athlete logs are requested by this diagnostic.
6. Classify every raw offer and roster/player/game/market slot with the original source coordinates/IDs, exact official identity/fixture/team join, quote/price/period/freshness status, current pregame context, source references and the **unchanged model's** input/role/history/selection reason. Run the actual candidate matching/eligibility/forecast modules offline; do not invent an exclusion reason from an aggregate counter. Track invalid quote, ambiguity, missing source, legitimate role/history hold, valid model forecast and Top25 publication separately. Do not force a minimum prediction count or infer availability from roster membership.
7. Replay these actual current inputs in isolated local workerd/SQLite using the existing durable writer/reader. Preserve actual receipt times; seed no production state. Obtain a reference, dispose the entire Worker/cache, deny live-source access, and compare recovered input hashes/projections/probabilities/side-specific EV and selection/holds for **all eligible players across all seven markets**, including unpriced/low-ranked candidates with truthful reasons. Missing fresh discovery or FINAL census must be explicitly unavailable/blocked, never restamped. This establishes current-data compiled recovery, not production cold acceptance.
8. Compare the precise pre-limit census and denominators; report any newly confirmed pipeline defect and apply only a separately tested branch repair. No model/calibration changes. Record success or exact missing fields/source status. Confirm no durable/record writes, unchanged dashboard/CW08/build controls. Then reassess R1 approval readiness once; full-R1 live desktop/mobile, capture/grading and protected-record acceptance still require their own release authorization.

## Rollback and completion

Immediately select the already available `48e8858a-7326-41ea-9457-532c74ec3337` at100% for any critical dashboard/diagnostic availability, security, resource, unexpected write or compatibility failure. Verify the old diagnostic and ordinary routes. The compatible `a48c431a` fallback remains the emergency alternative. No database restore, schema deletion or record rollback is needed/authorized: this diagnostic cannot write those stores.

Approval of this plan would clear only the diagnostic activation boundary. It would not mark R1 complete, authorize full R1, guarantee provider access, or make production durable history current. R1 remains open until complete current evidence plus later actual production release acceptance pass.
