# Final read-only NBA seed preflight — November 17, 2026, Toronto

**Recommendation: GO for separate approval of the exact, narrow historical import below. Do not execute under this preflight authorization. R1 remains NO-GO.** The existing immutable FINAL-only records can safely be staged using the tested insert-only protocol, subject to the disclosed live permission/capacity risks and import-time stop gates. No production table, pointer, ledger, Worker, schedule, credential or backup was changed.

This is a read-only preflight from code **29e97b4a1dbb00d482c20bde9e2a707a87621761**, not a new investigation or model release. Previously completed offline tests/restore evidence were reused.

## Exact frozen import

| Field | Frozen value |
| --- | --- |
| Artifact ID | `NBA-FINAL-SEED-2026-11-17-7a5cba7d706f` |
| Target | `sach-sports-cloudflare-test`, namespace `fc70a55e49c84d28bacc562a8d5cfb62`, object `capture:nba`, jurisdiction `none` |
| Session digest | `7a5cba7d706f70dbfd1a8e2196d2aa6a44f8987f13b105361ebdeb0508262ef3` |
| Session gzip SHA-256 | `ff969f9b2e9ad3be1870916448f1d79a1d979e4e93c62b38781847c6dc550794` |
| Session gzip size | 594,129 bytes |
| Source gzip SHA-256 | `c6f828e8463b1bb616e2f88b86f0049cbb67156a1b9404469dd3ef8d74dba6c4` |
| Source plan digest | `3c2d82c7e3310ccd01528da5f4ca92646a22cba5cd40f68492d89e6fbfdd8813` |
| Current evidence snapshot hash | `d2b6c1ea398a0a28eb98281b0cc0c430c22066b6e156d030b6ad34955939c72d` |
| Proposed changes | 101 insert-only FINAL source bodies; 101 new pointers; zero existing pointers to update |

Files: [session.json.gz](session.json.gz), [artifact.json](artifact.json), [live snapshot](snapshot.json), [verification](verification.json), [exact authorization request](authorization-request.json), [rollback plan](rollback-plan.json). The source package remains the previously verified [101-FINAL plan](../2026-11-17-nba-bootstrap-plan/finals-only-plan.json.gz); no source timestamps or statistics changed.

## Production state actually checked

Read-only checks ran November 17 at approximately **7:28–7:33 PM Toronto**. Session frozen at **7:36:27 PM**. [Live read-only evidence](live-readonly-evidence.json) includes requests, responses, timestamps and zero-row-write metadata. Failed diagnostic reads are retained with their errors rather than represented as passes.

- Active dashboard fallback: deployment **`b1ef6404-fd00-4312-857c-c50013bb64a2`**, version **`a48c431a-5c3e-4491-8529-38cb20dfa898`**, 100%. Version remains available.
- Dashboard binding still points to the same SQLite namespace and `DashboardJobQueue` class. Compatibility date `2026-11-06`; Worker subrequest limit 350 unchanged.
- Automatic builds still restricted to `__cw08_manual_release_only__`; original build/deploy commands intact. The ten most recent dashboard build records are stopped, with no active build observed.
- CW08 remains deployment **`39ea465b-ca3f-47f8-9bd2-50eb2f1ad174`**, version **`46e95f99-98f2-4abe-a2b2-0ff24b4f8e4b`**. Its binding uses the separate research namespace. No research table/status mutation or deployment occurred.

## Storage, consumers and conflicts

The actual object has existing `documents`, `jobs`, `metadata`, `phase_events` and `source_cache` tables. The **exact importer schema query** returned zero rows for `nba_history_versions`, `nba_history_checks`, `nba_bootstrap_events` or their triggers. Therefore there are no existing durable NBA evidence bodies/pointers/import events and no name/schema conflicts. The snapshot's zero evidence occupancy is derived from that live result, not an invented empty fixture.

Proposed encoded evidence bodies total **764,248 bytes**, within the existing **67,108,864-byte** evidence budget. Eleven staging batches; largest payload 79,341 bytes; largest SQL statement 3,087 bytes; maximum four parameters. Manifest 862,886 bytes, below the two-MiB protocol cap. Existing source-cache/document/job payload sums are 308,600 / 4,800 / 30,576 bytes (343,976 total); these are logical payload sizes, **not physical disk usage**.

`PRAGMA page_count` was denied with `SQLITE_AUTH`. It was not retried or accessed through an alternate mechanism. Physical page occupancy/free space remains unverified. `page_size` returned 4,096. Any capacity failure after a later approval must stop the insert-only operation; staged inert records are retained and no existing records are overwritten.

The active fallback archive checksum still matches `25aab16c46cf967700333b9ff4d9781c5d11575cadbc55f7a3ba1866e481d764`. The archived release-hold wrapper matches its reviewed source. None of its **378 compiled JavaScript files** contains the durable NBA evidence table names. This reuses the established association between that fallback artifact and version a48c431a; no production code upload/download or preview was needed. The wrapper holds capture/grading/replay alarm/schedule execution. Retained rows marked active/blocked are old queue state, not proof of running work: the live lease is null and their last touches predate rollback.

All three account Workers were inventoried at metadata level. Only the dashboard binds to this namespace; CW08 uses its separate namespace and the other Worker has no Durable Object binding. No active import journal, job lease, build or competing bound consumer was observed. A read-only snapshot cannot reserve a future maintenance window or rule out an administrator starting a direct SQL session later. The import authorization must require no concurrent release or NBA evidence maintenance; atomic source/pointer guards remain mandatory.

## Backups and protected records

The existing `Sach Sports - Railway Backup` Drive folder remains available at `1q0FpKWUxzvGq7KM7bc6ov1hkXjTgaFYe`. The legacy folder name does not change Cloudflare hosting. All three data objects retain their prior names, sizes, parent and modification times. The completion manifest was downloaded again and matches **101,766 bytes / SHA-256 `80765c6ba9187d4c5c0f639889a72c04ec9cbfa14fd55e1d28f49585afd31a6b`**. The earlier complete Drive round-trip/isolated restore is reused, not repeated; no backup file or sharing changed. [Backup check](backup-check.json).

One aggregate read-only query over the four protected production datasets confirms **20,468 current records**, with full-row ordered fingerprints identical to the latest November 17 rollback evidence: 11,615 history documents, 6,111 original receipts, 1,473 picks and 1,269 grades. No row export or mutation occurred. The current baseline SHA-256 of those four aggregate table inventories is `a97f788f814479fa335239d6576fd861c692195bb9c31bbd0c579c7cee0af8af`.

**Backup scope is 20,466, not 20,468.** The two later original receipts were already present at the last verified rollback and are not in that older backup. This is a disclosed backup-coverage gap, not a lost record or a current-backup pass. It does not grant permission to create a new backup in this read-only task. The proposed seed touches a separate SQLite operational evidence store and never accesses these production ledgers; its rollback must never restore an older ledger backup. Broader current-backup/R1 acceptance is not cleared by this preflight.

## Permission and execution boundaries

Live `SELECT` access through the existing authenticated Cloudflare integration is verified. **Production CREATE TABLE/CREATE TRIGGER/INSERT/DELETE permission and automatic approval review are untested**, because probing them would violate the read-only instruction. The API's accepted permission group and local SQL/runtime tests do not prove that a future production mutation will be authorized. Stop on a permission, security, capacity, conflict or approval-review failure; do not switch clients, credentials or endpoints to evade it.

Three focused tests and zero TypeScript diagnostics from 29e97b4 remain valid; code hashes were checked unchanged. Those tests cover actual local workerd SQLite interruption/restart, duplicate/no-overwrite behavior, lost acknowledgements, atomic conflict/partial-failure protection and scoped rollback. The current session and rollback ownership list were revalidated locally, with all 101 canonical source hashes/original times intact. No broad tests/builds or provider requests were repeated.

## Exact separate authorization needed

Authorize **one controlled import of artifact `NBA-FINAL-SEED-2026-11-17-7a5cba7d706f` / session digest above**, using code29e97b4 and the existing authenticated integration only. The scope is:

1. Create the two absent evidence tables plus the append-only journal and nine journal triggers **inside the existing object**, with no new service/namespace/binding or Worker deployment.
2. Insert exactly the 101 validated FINAL bodies and atomically publish exactly their 101 absent pointers; preserve original hashes, provenance and source/check timestamps. Verify all readbacks and unchanged protected inventories.
3. Maintain the pinned fallback and an exclusive consumer-inactive release window. Permit at most three explicit same-session recovery attempts, stopping on any unexpected state or denial.
4. If critical verification fails **before any consumer uses the data**, atomically deactivate only the 101 unchanged pointers owned by this session. Retain all immutable source bodies and journal records. A later correction/collection or consume lock blocks database rollback; use logical fallback instead. See the frozen rollback ownership list.

The authorization must acknowledge the disclosed two-receipt backup gap and unverified production write/physical-capacity checks. It must exclude existing record/pointer/ledger updates, R1 deployment, model/freshness changes, credentials, new infrastructure and CW08. No live authorization file or invented approval reference was created.

Immediately before the first approved write, refresh the small safety/schema/lease/inventory checks required by the existing [runbook](../2026-11-17-nba-bootstrap-import/runbook.md). If state differs, stop rather than silently regenerating the approved session. That execution gate is not another general investigation. The two-minute safety proof and thirty-minute execution authorization are generated only after actual observations and approval.

Fresh NBA discovery, any newly eligible complete finals, current fixture/roster context and fresh exact sportsbook prices remain missing/unproved. A successful historical seed alone would not establish current rankings or production release readiness. **R1/CW11/V62 remain blocked; no item is marked complete.**
