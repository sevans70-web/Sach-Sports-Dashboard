# R1 Prediction Dashboard performance repair — not deployed

Source **b8d05e3**, artifact **R1-2026-11-23-b8d05e3-c8428f1ae381**. R1/CW09/CW11/V62 remain open. This task made **zero production writes** and no upload. No provider investigation, history import, backup export, 350-card audit or broad regression suite was repeated.

## Confirmed defect and repair

The withdrawn candidate performed archive traversal plus repeated main/featured loading on interactive refresh. Actual November23 production Month UI was47.194s, first Month/Season52.932/60.144s. Those failures remain the production baseline, not a simulated success claim.

Three independent `performance:nba/nfl/nhl` objects in the **existing** dashboard namespace persist derived views and validated source checkpoints in existing `documents`/`metadata` tables. No new service, namespace, schema migration or model calculation. Cold foreground requests coalesce and read authenticated original picks/grades only; archive and featured restoration run in resumable alarm phases. Prior valid rows survive source failures and partial responses. All five periods, market/group/result filters, original-side/day summaries and original source timestamps remain available. Incomplete archives/featured history, stale records and failed refreshes are explicitly labeled.

A genuine capture/grade readback invalidates the relevant sport's cache. The protected overlay publishes independently of archive completion; revision checks preserve invalidation racing a refresh. A60s protected TTL also recovers missed notification. Refresh timestamps do not replace original prediction or grade timestamps. Other sports keep the existing route; the public response calculations were extracted unchanged.

Main/featured statistics now share one professional-sport browser request. A final stress check exposed repeated aggregation/RPC cloning of the full archive despite cached inputs: six simultaneous full responses exceeded5s. The final repair memoizes bounded serialized public responses inside the owning object. The same compiled check now passes. No threshold was relaxed to hide that failure.

## Measured verification (local, not live acceptance)

| Check | Result |
|---|---|
| Cold six concurrent main/featured NBA |4.385–4.453s;1,078 authentic protected records;12shared source GETs;**zero archive requests**|
| Cold NFL / NHL |0.134–0.138s /0.242–0.248s;149/245authentic records;zero archive requests|
| Process restart, persisted NBA view |2.632s;zero source calls|
| Six foreground requests during archive work |0.789–0.998s|
| Six simultaneous complete NBA archive responses |1.122–1.395s;7,971reconciled public records|
|15sport/period cached checks |0.005–0.649s;row/status totals independently reconcile|
| Background NBA completion |11bounded phases,2,947cloud docs+96verified local Drive wrappers;largest phase13.823s;max134/220budget,2active source requests|
| Persistent derived SQLite size |7,465,584compressed bytes in3,097rows;below32MiBguard|
| Genuine recorded pick/grade release |Revealed unmodified withheld authentic evidence;original cohort1,078→1,079;updated grade/summary;zero source writes|
| UI replay |6desktop/mobile NBA/NFL/NHL flows;combined main request,zero separate featured requests;automatic refresh,filters,directions,503retention;zero page errors/overflow|

The compiled workerd rehearsal enforces350subrequests/30sCPU and uses the existing verified isolated restore read-only. It delays source reads and restarts the isolate mid-archive; each of96NBA media bodies is fetched once across restart. Source wrappers/Drive metadata are locally constructed around authentic records and independently byte/MD5-checked; this is **not** a fresh Google Drive or provider-access test. Manual alarm stepping compresses waiting; it does not certify the live90-minute rotation. NFL/NHL full legacy archives remain honestly partial in this rehearsal. No full-record payloads or private database are committed.

Targets: cold<15s, repeated/concurrent<5s; final measurements also have coldNBA<5s. CPU/memory production acceptance remains required; no local pass is claimed as live Cloudflare memory verification.

**Targeted tests:**37distinct performance/parser/history checks pass (36base+new serialized-response contract; six final cache contracts rerun after the final change). Existing actual workerd capture/grading/recovery8checks also pass:45distinct relevant checks total,0final failures. Two frozen-package/tamper/approval checks pass separately. Compiled recorded-data rehearsal37checks passes; six UI flows pass. TypeScript0diagnostics. Production build and no-upload dry-run pass:7,586.51KiBcompressed, below10MiB. The unchanged broad/model/NBA EV evidence is reused.

## Bounds and recovery

- Performance phase20s, individual source5s,220guard,2source concurrency; readers48cloud/24Drive requests and8sreader budget.
- View16MiBdecoded, source checkpoint1MiBdecoded, durable compressed cache32MiB. Serialized response memo≤8entries/16MiB. Views split into256KiBchunks, atomic manifest and SHA readback. Original full cloud checksum or original Drive MD5/size verifies before projection; derived checkpoints have separate SHA.
- Partial/source timeout results checkpoint before yielding. Cancellation prevents late writes. No-progress retries back off15minutes; UI polling cannot override provider retry/cooldown. Preserve prior verified views on error. Oversized/corrupt source data is explicit incomplete coverage, never fabricated zero.
- No cache path writes `history_documents`, originals, picks or grades. Only existing operational derived storage is written after future approved activation. Capture/grading write semantics and first-pick evidence remain unchanged.

## Safety and open acceptance

Read-only counts:11,615history+6,116originals+1,478picks+1,269grades=**20,478**. The previous full-row comparison is reused, not rerun; all ten legitimate additions remain included. The existing20,468record backup is preserved and was not re-exported; this task does not claim its contents now include those ten additions.

Active fallback deploymentd86b1e4d/versiona48c431a remains. Paused branch include stays `__cw08_manual_release_only__`. CW08 deployment39ea465b/version46e95f99 and15-minute schedule unchanged; research tables never accessed. See read-only `production-controls.json` and `protected-counts.json`.

**GO for a separately approved controlled attempt of this exact artifact; NO-GO for completion.** Before any upload, reconfirm exact artifact, bindings, backups/recovery point, inventory, fallback and paused builds. Previous approval is consumed and does not authorize this artifact.

Retain on tracker: actual live Prediction Dashboard latency and all five periods/archives; NFL missing eligible rankings/projections/featured; NHL incomplete market coverage; NBA supporting history; full operational initialization; all38capture markets; all3grading rotations;204previously ungraded predictions only where authentic official evidence permits. Missing historical captures cannot be retroactively invented. No item moved to Completed.

## Reproduction and evidence

`compiled-proof.json`, compressed build/test/runtime logs and `browser-replay-proof.json` contain measured evidence. Optional focused reproduction with an existing authorized isolated restore: set `APP_ROOT` to frontend, `RESTORE_SQLITE` to the existing local verified restore, and `REHEARSAL_WORK` to a **new disposable local directory**; run `node rehearsal/compiled-rehearsal.mjs`. It deletes only its own local `state` subdirectory and rejects unknown outbound sources; never point it at production. Dependencies must match the app lockfile. Archive wrappers and future test clock are disclosed in the harness. No fresh provider investigation required.
