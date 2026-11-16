# R1 current recovery point — export blocked by automatic approval review

Source branch starts at8721fa7. No R1 deployment, production record change, backup overwrite, Drive sharing change or research Worker operation is performed.

## Verified current source and gap

Read-only production inventory at `2026-11-16T14:47:10.809376Z` (November16,09:47AM Toronto) covers all four tables:

| Table | Records |
|---|---:|
| history_documents | 11,615 |
| worker_pregame_originals | 6,109 |
| worker_pregame_picks | 1,473 |
| worker_pregame_grades | 1,269 |

`source-baseline.json` preserves full-table ordered row-inventory fingerprints without exporting record payloads. This is a measured recovery target, not a completed backup. It covers records currently present, not future entries later on November16.

The existing full-volume manifest completed November15 at02:31:06AM Toronto. Read-only timestamp comparison identifies121 history documents updated later,268original receipts,36saved picks and1,020official grades created later. Its filesystem-only archive has no Worker-table exports; it cannot establish a recovery point for these later database versions. The separately verified Cloudflare retention archives stop at November10 (NFL pregame November9). No source was deleted or rewritten to reconcile these gaps.

The existing destination remains `1q0FpKWUxzvGq7KM7bc6ov1hkXjTgaFYe`, owned by `sachsportsplatform@gmail.com`. Access is not the blocker; no new folder or sharing grant is needed.

## Approval-review blocker

The first bounded production payload-export query was rejected before any payload export completed. Automatic approval review stated: “The query extracts100 full history records and returns an encrypted/base64 payload with the encryption key embedded in the SQL, effectively exposing sensitive production data to the agent without explicit authorization for this export.”

The query used an explicitly non-secret transport-format passphrase for read-only compressed transfer, not an API key or account credential. Nevertheless, the rejection is respected: no alternate execution, plaintext extraction, hidden route, credential copy or workaround is attempted. A narrow explicit approval request identifies all four tables/counts, the same existing folder and an isolated restore, excluding credentials and CW08 storage. Export remains blocked while that request is unanswered.

## Prepared and tested independent work

`frontend/scripts/current-recovery-backup.mjs` is an offline packager/verifier/restorer with no network or production database handle. It preserves each exported row's exact database JSON text and source MD5, all fields and unknown future columns, in SHA256-addressed gzip parts. It requires identical bracketing production inventories, verifies every table count/fingerprint, rejects missing/duplicate/altered parts, restores transactionally to new SQLite storage, checks all field bytes/readback, and exercises unique-key duplicate prevention. It refuses to overwrite an existing restore database.

Nineteen focused tests passed (three current-recovery cases plus16 existing backup/restore checks). These are local generated fixtures; they do not certify a backup or restore of current production payloads. The earlier8manifest/11part real archive restore remains valid for its explicitly older scopes. R1's frozen archive SHA remains `f6bf43437e726879c89cf1ef274d061d0e0736d2e918e8cd1410b92c426f9b54`.

## Remaining steps after explicit export approval

1. Export all four tables through the existing authorized read-only integration in bounded ordered chunks; pin source-row hashes and capture a stable before/after inventory. If rows change, do not publish a completed manifest.
2. Package every original field without dropping malformed/legacy records; do not change a source prediction or grade to make validation pass.
3. Upload content-addressed parts to the same existing Drive folder, then authenticated download/readback and hash/size checks. Reuse matching verified files on retry; publish a complete manifest only after all parts verify.
4. Restore only the downloaded files into a new isolated SQLite database; verify20,466records (or the freshly refreshed stable baseline), exact row hashes/table inventories, timestamps and unique identities. Keep current-source and archived-day evidence distinct.
5. Update the tracker, then recheck the frozen artifact, paused builds, fallback, dashboard-bound feed evidence and unchanged CW08 before requesting controlled deployment approval. Real production browser/resource and scheduled acceptance remain post-approval requirements; they cannot be claimed from this rehearsal.

**Status:** the full-current recovery requirement is not passed, and the frozen candidate is not cleared for deployment approval. The blocker is automatic approval review of the payload export, not inaccessible Drive storage. No user action to create/share a folder is needed.
