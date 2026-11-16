# Existing dashboard backup discovery and isolated restore

## Result

**No Drive access change or new backup folder is needed.** The existing folder is [Sach Sports - Railway Backup](https://drive.google.com/drive/folders/1q0FpKWUxzvGq7KM7bc6ov1hkXjTgaFYe). Direct folder metadata confirms `sachsportsplatform@gmail.com` is its owner and the existing backup service account is a writer. The legacy name is not the dashboard hosting platform; production remains Cloudflare.

**The latest scheduled archive restore passed:** eight manifests, 11 parts, 11,504,113 bytes, 489 history documents and 1,008 original/pick/grade records. **A full current-production recovery snapshot is not established by this test.** The scheduled archive intentionally selects the six-day Toronto retention boundary. November11–16 records are newer than these manifests. R1 remains held; no deployment approval requested.

## Configuration and discovery

`frontend/scripts/worker-history-backup.mjs` reads the encrypted `BACKUP_DRIVE_FOLDER_ID` binding and writes content-addressed `cloudflare-staging-history-v1-*` files directly under that folder. `worker-pregame-backup.mjs` reuses it for independent originals/picks/grades. Their existing daily cron is `10-17 9 * * *`; history coverage includes shared sports, while the current Worker schedules separate pregame archives only for NBA/NFL/NHL. The frozen fallback retains the daily archive schedule even while it holds capture/grading alarms.

The binding name is declared in configuration and existing production binding evidence; its encrypted value is not exposed or copied. The effective current destination is corroborated by today's production archive logs, matching fresh manifest timestamps/content and each file's direct Drive parent. The legacy full-volume script also uses this parent and resumes its existing `railway-*` child rather than creating duplicates.

The previous generic filename search returned no results. Direct metadata traversal from an already known NBA archive segment found this chain:

`segment -> segments -> archive -> nba -> sach-history -> railway-2026-10-16T19-41-37-633Z -> Sach Sports - Railway Backup`.

The legacy backup child is `1kJ7JJu3moVnfUkNuDNvbfb8VpDYxHJ-r`; it is **not** the direct parent of the new Cloudflare manifests. Listing the root immediately located them. This corrects the earlier inference that another folder link or sharing grant was required. No files, parents, permissions, credentials or names were changed.

## Latest identified complete manifests and verified coverage

| Scope | Archived day | Created (Toronto) | Restored records | Parts |
|---|---|---|---:|---:|
| NBA history | November10 | November16 04:16:58 | 127 | 4 |
| NFL history | November10 | November16 04:17:47 | 17 | 1 |
| NHL history | November10 | November16 04:11:49 | 55 | 1 |
| CBB history | November10 | November16 04:15:48 | 254 | 1 |
| CFB history | November10 | November16 04:10:50 | 36 | 1 |
| NBA originals/picks/grades | November10 | November16 04:17:05 | 657 (412/125/120) | 1 |
| NHL originals/picks/grades | November10 | November16 04:11:56 | 198 (110/44/44) | 1 |
| NFL originals/picks/grades | November9 | November15 04:17:54 | 153 (136/10/7) | 1 |

The root listing is bounded to the 100 most recent returned objects; this is not a whole-drive inventory. All parts referenced by these eight complete manifests were located and downloaded. Source database read-only counts match each restored sport/day exactly. NFL has no original/pick/grade rows on November10, explaining the lack of a new non-empty manifest that day; no missing rows were fabricated.

`restore-result.json` records every selected manifest and referenced part ID, expected digest, bytes, source fingerprint and result. `source-coverage.json` and `coverage-comparison.json` retain the actual day/table counts. There are 9,346 current source rows across the checked history/original/pick/grade tables dated November11–16 that are outside these selected archive scopes. That number includes shared college history; it is not a count of betting picks. The29 CFB originals on November10 are also outside the current separate NBA/NFL/NHL pregame archive scope; the CFB history restore does not certify those independent original rows. Legacy full-volume files are preserved but were not treated as a proven current complete snapshot.

## Existing full-volume backup also identified

The existing legacy child contains a completed full-volume manifest `1qSjJJmD1OUEeqCYDDtxrPigmLiLGbsuY` (`backup-manifest-2026-11-15T07-01-00-431Z.json`). It completed November15 at02:31:06 Toronto, with100,442file receipts /1,689,879,773bytes and100,268source paths. Its34,526,740byte manifest was downloaded locally without inline payload output. It reports zero errors/unverified source paths; independent inventory checks confirm unique file paths, every initial source path covered, and well-formed per-file IDs/hashes/sizes. `legacy-full-manifest-summary.json` pins the downloaded manifest SHA-256.

This identifies a completed legacy backup; it is not a claim that all100,442remote files have been independently re-downloaded or fully restored in this task. The manifest predates the newest Cloudflare database receipts, and does not replace the separate Worker pregame-table backup. No request to share another folder is justified.

## Integrity and isolated restore

Files were grounded by Drive metadata before authenticated streamed download. No provider/Google API credentials were requested, copied or placed in evidence. Raw payloads and the restored SQLite database remain local under `/workspace/work/r1-backup-restore-2026-11-16`; they are not uploaded to GitHub or Drive.

The offline verifier:

1. Requires a new local SQLite file and refuses to overwrite an existing destination.
2. Verifies every manifest's exact byte count and MD5 against its content-addressed filename. The metadata connector does not expose `md5Checksum`, so this is not claimed as an independent metadata-MD5 comparison.
3. Requires every referenced part and verifies its exact bytes and manifest-pinned MD5, version, sport/day and item count.
4. Verifies each history payload's SHA-256 with the application's canonical checksum function; enforces unique streams and unchanged dates.
5. Validates pregame table/fixture/player/market identities and capture-before-start timing; compares the complete recovered sequence with the manifest's `sourceChecksum`.
6. Inserts all records transactionally into isolated SQLite, reads every field back, recomputes full inventories, enforces unique identities and runs `PRAGMA integrity_check`.
7. Rolls back inserts on missing, altered or duplicate evidence. It performs no network requests, restores no production rows, and has no credentials or remote write path.

All eight real archive scopes passed. Sixteen focused tests passed with zero failures, including byte tampering, missing parts, duplicate evidence, refusal to overwrite a restore destination, rollback, and the existing history/pregame backup tests. No application/model/production Worker code changed. The R1 candidate archive and its digest are unchanged.

## Status and next action

The **access blocker is cleared** and the **existing scheduled-archive restore test has passed**. No folder needs sharing and no user authentication is required. A statement that the latest archives can restore all current production records would be incorrect: they are sport-day retention archives, not a full current database snapshot.

The remaining full-current-backup gate is coverage/recovery-point verification, not permissions. Before clearing that broader R1 gate, verify an existing current full snapshot or produce a bounded current backup in this same configured folder through an authorized existing process, covering newer originals, picks, grades and history. Do not create another location, silently weaken scope, redeploy a Worker to run the check, or alter production records. The tracker records the narrower passed restore and broader remaining coverage requirement separately. R1 and CW11 are not marked complete; CW08 and dashboard automatic-build settings remain unchanged.
