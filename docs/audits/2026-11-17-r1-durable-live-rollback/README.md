# R1 approved durable release — live failure and immediate rollback

**NO-GO. The one approved deployment attempt was made and rolled back. R1/CW11/V62 remain open; no repair is moved to completed.** Frozen artifact and source code remain preserved. Do not retry this package without resolving the live blockers and obtaining new approval.

## Exact release and rollback

The user approved `R1-2026-11-17-4c23239-6173e391`, package commit `fe049d6994890ce60a6a9c1475c2bc44beebd027`, for `sach-sports-cloudflare-test`. Existing authenticated Cloudflare manual job `809e57db-5eae-4904-bc8c-269dc673c5a8` checked out that commit, extracted the frozen archive and verified its digest twice. No application compilation or credential transfer occurred.

- Archive SHA256 remains `47fb603427002383ccfa99e39d4d90a48a20369c04b51c82d1bc0ccba18fa153`.
- Exact 425-file bundle/config/assets fingerprint: `6173e39163b64964c07591a9b93f94c4282a71df8abfc694af85e8edfeb97aca`.
- Candidate deployment **`e5892740-c77f-4a3d-9d95-9f5deb8350f0`**, version **`01c7e153-5f96-49ac-9cad-6590cf3ab71e`**, activated **November17,5:38:53PM Toronto**.
- Immediate rollback deployment **`b1ef6404-fd00-4312-857c-c50013bb64a2`**, compatible version **`a48c431a-5c3e-4491-8529-38cb20dfa898`** at100%, activated **5:43:16PM Toronto**.

The original manual build/deploy commands were restored immediately after upload. Automatic branch includes remained `__cw08_manual_release_only__` throughout. No second candidate attempt was made. Existing SQLite/KV, additive durable evidence tables, pending jobs and all records were retained in place; no import, restore, deletion or schema rollback.

## Actual production results

| Gate | Actual observation | Acceptance |
|---|---|---|
| Summary/slate APIs | NBA17/NFL13/NHL14 games agree within each API's slate window; partial pick coverage remains explicit/unknown, not invented zero. Summary times1.107s/0.477s/0.449s | Endpoint checks passed; these counts are not necessarily today's complete slate |
| Featured/history APIs | All3sports HTTP200, historical reads connected; no source/model/qualification changes | Endpoint availability only; full browser qualification not verified |
| NBA Points retained evidence | Actual candidate HTTP200,25rankings,25valid EV diagnostics; `dataState:stale`, explicit retained-ranking notice/original timestamps | Cache-first outage recovery worked; not fresh cold history success |
| NBA Rebounds cold recovery | Actual candidate HTTP503 in4.820s, `nba_official_history_unavailable`,0rows/0fittedforecasts despite54integrity-verified quotes | **Critical failure** |
| NBA official historical source | Candidate logs show all56requested player gamelogs failed,0fixtures/0observations; official gamelog endpoint HTTP403 with one-hour cooldowns | Fresh Cloudflare history access not restored by workspace HTTP200 evidence |
| NBA scheduled capture | Assists and Threes both retry after60s: `rank`→`rank`, `job_source_http_403`,0checkpointBytes; request usage20and4, max concurrency4 | **Critical no-progress recovery failure**; immediate fallback |
| NHL replay lane | Scheduled `scan`→`game`→`done`, two requests in its active scan phase | Progress observed, not a complete NHL capture or official-grade acceptance |
| Resource telemetry |145retained events in release window; no non-ok Worker outcomes observed; max reported invocation CPU462ms/wall16,495ms; two NBA phases below220/350request budgets | Not a full soak, peak-memory measurement or all-job resource pass |
| Actual desktop browser | Chromium navigated the production URL with real clock/no replay/TLS enabled, but local runner rejected certificate authority before rendering | **Not passed**; no cards/browser counts/hydration success claimed |
| Actual mobile/browser all-market checks | Not run after critical fallback | Incomplete; API or recorded replay not substituted |

The candidate Rebounds request began before rollback and returned the failed candidate response; later fallback reads are recorded separately. Points25 alone was never treated as seven-market success. PR/other NBA markets, NFL17tabs, NHL6tabs, browser featured/history, warm-p95 performance and complete capture/grading acceptance remain unverified for this release.

The browser's local certificate issue is separate from application/provider failures. A focused attempt to register the existing managed system CA in the local NSS store did not resolve Chromium navigation; no certificate-check bypass or insecure browser flag was used. No further browser workaround or deployment was attempted. It cannot support a claim that end-user browsers fail, nor a claim that browser acceptance passed.

## Protected records, backup and research Worker

Ordered **full-row** fingerprints before5:35:10PM and after5:43:43PM match for all **20,468** records:

| Dataset | Count | Ordered full-row MD5 inventory |
|---|---:|---|
| history_documents |11,615|`6e7f1c27dddcbabe945d374b6efd2e4f`|
| worker_pregame_originals |6,111|`33d1173b71b0fe2f35aaf0b314a22836`|
| worker_pregame_picks |1,473|`656e60d2cb9dc59db003de6754cf09cb`|
| worker_pregame_grades |1,269|`0e21950e276648be18bce04e2c468e33`|

This includes the20,466protected backup records plus two earlier receipts; nothing was lost, overwritten or added to these four tables during the attempt. The existing Google Drive backup manifest and all three data objects are still available at their original sizes. Prior authenticated checksums/isolated restore are reused; no new export/import, folder, sharing or backup-file modification.

Rollback API verification: NBA Points25, Rebounds25, NHL Shots25, NFL Passing Yards2, all HTTP200; NBA25EV diagnostics available in each checked market. These are API counts, not browser verification or all-market certification. The fallback retains its known incomplete repairs.

CW08 is unchanged: deployment `39ea465b-ca3f-47f8-9bd2-50eb2f1ad174`, version `46e95f99-98f2-4abe-a2b2-0ff24b4f8e4b`, fifteen-minute cron and frozen model `007c02b`. Read-only operational status: ready,1,509receipts/960grades/329completedcycles,0pendinguploads/no storage error. No code, binding, schedule, credential, protocol or research-table mutation.

## Smallest next action

Do not repeat a general repair cycle or private-preview investigation. Use these real candidate logs to locate the initial noncheckpointed403 in the NBA background ranking path and demonstrate partial-progress recovery from that exact denial. Establish legitimate current NBA discovery/census evidence from actual Cloudflare execution for an uncached market; durable storage cannot create inputs the Worker never receives. Repair the local browser certificate trust before any further release so actual desktop/mobile acceptance is available. No new feed purchase, invented history or automatic retry is authorized.

R1 remains blocked. The complete38-market capture rotation and three-sport grading rotation were stopped by critical rollback; never call an enqueue, short replay or API200 a completed rotation. The original48local checks remain valid for their scope but do not outweigh this production failure.
