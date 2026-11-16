# R1 current-production backup and restore — passed

The user explicitly authorized read-only export of four named production datasets to the existing Drive folder and an isolated local restore. Counts were rechecked before exporting and were unchanged. The earlier automatic export-review blocker is resolved by that explicit authorization; no workaround, credential copy, provider change or research-table access was used.

**The remaining R1 current-backup requirement has passed.** The frozen candidate is ready for controlled deployment approval on the existing rehearsal evidence. Nothing was deployed; R1/CW11 are not100% complete because actual candidate production browser, resource and scheduled-job acceptance must follow an independently approved deployment.

## Immutable backup and recovery point

- [Verified completion manifest](https://drive.google.com/file/d/1Gl1quPVMBo5ELLFKBIAuQEOkHqqQRKZf/view?usp=drivesdk),101,766bytes, SHA256 `80765c6ba9187d4c5c0f639889a72c04ec9cbfa14fd55e1d28f49585afd31a6b`.
- Existing [Sach Sports - Railway Backup folder](https://drive.google.com/drive/folders/1q0FpKWUxzvGq7KM7bc6ov1hkXjTgaFYe), owned by `sachsportsplatform@gmail.com`. The legacy label is not the hosting platform; production remains Cloudflare.
- Source observed November16 at10:31:31AM Toronto (`15:31:31.088141UTC`), and identical source counts/full-row inventories verified after export at11:01:34AM and after the Drive-based restore at **11:07:38AM Toronto** (`16:07:38.010924UTC`). This covers all records currently present at those checks, not future entries later that day.
- Three immutable data objects (one standalone gzip part and two tar containers),132 unique internal gzip parts, plus one completion manifest. Data objects total43,685,430bytes. No additional Drive folder was created; earlier backups were not overwritten, moved, deleted or renamed.

| Dataset | Source before | Drive restore | Source after | Exact inventory |
|---|---:|---:|---:|---|
| history_documents | 11,615 | 11,615 | 11,615 | Match |
| worker_pregame_originals | 6,109 | 6,109 | 6,109 | Match |
| worker_pregame_picks | 1,473 | 1,473 | 1,473 | Match |
| worker_pregame_grades | 1,269 | 1,269 | 1,269 | Match |
| **Total** | **20,466** | **20,466** | **20,466** | **Pass** |

The new recovery point includes the121 later history-document versions,268originals,36picks and1,020grades that the earlier November15 full-volume snapshot could not establish. It also includes all remaining rows in the four authorized tables, including preserved college/deferred-sport history; none were filtered out to make validation pass. Older Drive-only archives remain preserved separately.

## Export and integrity procedure

Production access used only read-only SELECTs against the four tables. Each row was exported as its exact PostgreSQL JSON text with a source MD5. The full source inventory is the ordered MD5 of those row hashes, not a lossy reconstruction of selected fields. All original columns, timestamps, zero/null values, quote/prediction fields and grades are retained. There were no production inserts, updates, deletes, migrations or credential operations.

Bounded ordered batches were checkpointed locally. One large transfer connection dropped; only missing ranges were resumed with byte-bounded batches, including singleton batches for large history documents. The final132 parts cover every source position exactly once. A compressed transfer envelope used a public format passphrase solely for transport through the authorized read integration; it was not an account credential or a claim that the Drive backup is password-encrypted. Final files are standard gzip/JSON in the existing private Drive location.

An early check encountered the earlier partial packaging index and correctly refused completion at6,100 history rows. After complete packaging, all source/table fingerprints passed. No completion manifest was published from the partial index.

The verifier was corrected to retain PostgreSQL's actual source ordering. The production database uses `en_US.UTF-8`; re-sorting identities with binary/JavaScript ordering can falsely change inventory hashes. Part offsets are checked for gaps/duplicates and restored source positions have their own uniqueness constraint. This correction changes only the offline backup utility, not production application/model code.

All data objects were uploaded with explicit parent-folder IDs and downloaded back through authenticated Drive streaming. Container SHA256/size, member whitelist, individual part SHA256, decompressed SHA256, exact row MD5 and table inventories were verified. The standalone part is excluded from the tar members, so it is not restored twice. The completion manifest was uploaded only after source verification and the isolated restore passed, then downloaded again to verify its exact SHA256, size, scope and status.

The final manifest's permissions were read back: the expected Sach Sports owner and existing backup service-account writer; no new public, domain or user sharing grant. No API keys or OAuth credentials were exported. CW08's separate SQLite/KV data was not accessed.

## Isolated restore and tests

The local SQLite destination is new and isolated. It was populated **only from authenticated Drive readbacks**, not from the original local export files. It preserves the raw database JSON text and every source row hash, checks SQLite integrity, checks every restored primary-key identity, compares all20,466 row hashes/table inventories, and rejects an attempted duplicate insert. It refuses to overwrite an existing restore destination. Zero duplicate identities or altered/missing source records were found.

All **11,615 stored history-payload SHA256 checksums** additionally match the application checksum algorithm. Source/restored receipt and game-date ranges are recorded in `timestamp-ranges.json`; originals include the November16 game date and the latest original receipt `2026-11-16T04:32:51.705561UTC`. They were not re-dated, recalculated, regraded or converted into new predictions.

**22 focused tests passed, zero failed**: current full-recovery packaging/restoration, missing/tampered/duplicate parts, changed source inventories, database source-order preservation, destination overwrite refusal, existing history/pregame backup checks and frozen R1 artifact safeguards. The actual20,466-record Drive round-trip restore is additional real-data evidence, not a generated test fixture.

Private export payloads, transfer envelopes and the581MiB restored database remain outside Git under `/workspace/work/r1-authorized-backup-2026-11-16`. Git evidence contains only aggregate inventories, hashes, timestamps, manifests/receipts, safety metadata and test results; no record payloads or credentials.

## R1 release readiness and limits

The candidate archive is unchanged: SHA256 `f6bf43437e726879c89cf1ef274d061d0e0736d2e918e8cd1410b92c426f9b54`,424-file bundle/config/assets fingerprint `d7714dc0cac2f05950a0eed9b7bd7a9aebd82893465c25635f4dbe8907f4f71b`, application repair600bd5d / frozen source2bf33d6. Its prior832-regression/19-compiled-check rehearsal evidence remains tied to those exact bytes; no dashboard rebuild or new application/model change occurred in this backup task.

Cloudflare readback confirms compatible fallback deployment `4e8f8721-6e0a-4836-b877-9446a0f360d0` remains active, with the existing dashboard-only SQLite namespace `fc70a55e49c84d28bacc562a8d5cfb62`, KV `644df6a469e84dba90c8f7dac410f895`, compatibility2026-11-06 and350-subrequest limit. Automatic builds remain paused through `__cw08_manual_release_only__`. CW08's deployment `39ea465b-ca3f-47f8-9bd2-50eb2f1ad174` and15-minute schedule remain unchanged. No claim of a new research collection cycle is inferred from control-plane metadata.

**Pre-deployment rehearsal/backup gates pass; the frozen candidate is ready for a controlled deployment approval request.** Standard immediate pre-upload checks still apply. **Not all R1 production acceptance requirements are satisfied yet:** actual candidate browser/API/resource checks and real all-sport capture/grading acceptance still require the separately approved release and must use the compatible fallback on critical failure. Recorded replay is not a live production pass. No new NHL model is validated or promoted by this backup, and no checklist row is moved to100% completed.
