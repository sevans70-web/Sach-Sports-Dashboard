# Approved NBA FINAL-only seed — imported and verified

**The controlled import succeeded. All 101 FINAL game sources and their 101 new pointers are verified in the existing production NBA evidence object. No R1 deployment occurred; R1 remains blocked.**

Artifact `NBA-FINAL-SEED-2026-11-17-7a5cba7d706f`, exact frozen session from d0a63bb, unchanged import mechanism29e97b4. The user explicitly approved this one controlled import, its existing-object tables/journal/triggers and scoped rollback, acknowledging the20,466/20,468backup gap. [Authorization evidence](authorization-evidence.json).

## Actual execution and verification

- Target: existing dashboard namespace `fc70a55e49c84d28bacc562a8d5cfb62`, named object `capture:nba`, jurisdiction `none`.
- Session digest `7a5cba7d706f70dbfd1a8e2196d2aa6a44f8987f13b105361ebdeb0508262ef3`; run `c2e156b4d30bde7ddffebb29967e2651883f0955bedc009bd93dc9bff7cd6de3`.
- Session gzip SHA `ff969f9b2e9ad3be1870916448f1d79a1d979e4e93c62b38781847c6dc550794`; original source package SHA `c6f828e8463b1bb616e2f88b86f0049cbb67156a1b9404469dd3ef8d74dba6c4` checked unchanged.
- Created only the approved two evidence tables and one append-only journal, with nine journal triggers, inside that object. No new service, namespace, Worker binding or migration deployment.
- Eleven serialized insert-only batches staged **101 unique canonical FINAL source bodies**. **101 absent source-check pointers** published atomically with their ownership event. No pre-existing source/pointer was overwritten; the preflight evidence store was empty.
- All101 exact version bodies, source hashes, original observation timestamps and original successful-check timestamps passed live readback. Actual stored encoded evidence size **764,248bytes**, within the64MiB evidence budget. No capacity error occurred.
- The complete manifest was independently compared byte-for-byte inside the live journal against the frozen session. Its original archive/raw-body/semantic hashes, source URLs and HTTP receipt provenance all match. Exactly two journal events exist: manifest and publish; no rollback/consume event.
- The acknowledged protocol contains **62SQL requests**, below90/attempt. Each remote request contained one statement. No unsupported cross-request transaction, blind retry, credential transfer or alternate transport was used.
- A subsequent **offline-only** duplicate preparation over actual production readbacks used the unchanged canonical validator and recognized101 existing valid sources, proposing **zero new pointers**. This was not a second import or production write.
- No critical acceptance failure; **rollback was not required or executed**. All source evidence and the immutable ownership journal remain intact. The documented scoped rollback remains available only while no consumer has used the evidence and no newer collection changes the owned keys.

Execution completed November17, **8:07:51PM Toronto**; independent canonical readback verification recorded **8:09:31PM**. See [verification.json](verification.json), [import receipt](import-receipt.json) and [post-import checks](post-import-checks.json) for exact timestamps/hashes. Receipt SHA `40f5c271d2c2b0f6c1b02945119bdf33a567c2df1ffc09d370c4d5ac2d28548e`.

The full credential-free request/response history is retained in [execution-transcript.json.gz](execution-transcript.json.gz), SHA `455cb8579587e557e6b60c46b31bf13a4c1f4de42f7ec14dc781732309598dac`. It contains the official normalized source payloads and operational SQL results, not production ledger rows. The bridge verified the request hashes and response order before reporting completion.

## Safety gates and unchanged production records

Fresh [preflight](preflight.json) confirmed the frozen artifact/code, existing backup objects, empty evidence schema, null job lease, absence of a competing evidence consumer/build and unchanged production fingerprints. The fallback archive/consumer analysis from d0a63bb remained applicable; the deployed version did not change.

After the first two empty tables were created, the two-minute safety proof expired. The bridge stopped before the next write. Actual live metadata and all four protected inventories were rechecked; only after they matched was a fresh proof recorded and the same acknowledged session continued. No request was blindly resent. Further genuine safety refreshes ran during staging, immediately before publication and during final readback. This was one import session, not repeated or re-frozen attempts.

Post-import full-row ordered fingerprints match preflight and the latest November17 rollback exactly:

| Protected dataset | Before | After | Fingerprint |
| --- | ---: | ---: | --- |
| History documents | 11,615 | 11,615 | `6e7f1c27dddcbabe945d374b6efd2e4f` |
| Original receipts | 6,111 | 6,111 | `33d1173b71b0fe2f35aaf0b314a22836` |
| Saved picks | 1,473 | 1,473 | `656e60d2cb9dc59db003de6754cf09cb` |
| Grades | 1,269 | 1,269 | `0e21950e276648be18bce04e2c468e33` |
| **Total** | **20,468** | **20,468** | **Unchanged** |

The existing verified Drive backup still covers **20,466** records, not20,468; the two known later original receipts remain outside it. No backup was overwritten, newly created or represented as current-full coverage. The import never accessed these ledgers for writes and did not restore an older database.

Dashboard remains fallback deployment `b1ef6404-fd00-4312-857c-c50013bb64a2`, version `a48c431a-5c3e-4491-8529-38cb20dfa898` at100%. Automatic-build branch filter remains `__cw08_manual_release_only__`, with original commands. No model consumer was activated. CW08 remains deployment `39ea465b-ca3f-47f8-9bd2-50eb2f1ad174`, version `46e95f99-98f2-4abe-a2b2-0ff24b4f8e4b`; its separate namespace, credentials and schedule were not changed or written.

Actual production CREATE/trigger/INSERT permissions and the required storage writes are now verified successful. The previously denied physical `page_count` diagnostic was **not retried**; exact physical page occupancy remains unmeasured. No permission/security/capacity denial occurred in the approved import. No new paid service, plan, credential or provider-access workaround.

## What remains open

This completes the historical-seed operation, **not R1 or current NBA forecast acceptance**. All saved source times and model/freshness rules remain unchanged. No forecasts, probabilities, EV values, picks or grades were invented or recalculated. The current fallback does not read the new evidence tables, so this import does not claim improved live ranking counts.

Fresh complete authorized player-season discovery (the retained discovery responses remain expired), current game/roster/opponent context, fresh sportsbook prices and any additional eligible finals remain required. Only then can the R1 candidate's current-data gates and actual production browser/capture/grading acceptance be reassessed under separate deployment approval. Tracker R1/CW11/V62 remain blocked; no row is moved to100%completed.
