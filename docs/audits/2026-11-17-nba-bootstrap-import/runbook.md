# Future authorized production execution — do not run under preparation approval

This runbook authorizes nothing by itself. The current task is preparation only. All commands below operate locally until an operator explicitly forwards a generated request through the existing authenticated Cloudflare integration.

## 1. Read-only preflight and exact approval scope

Using only existing authorized Cloudflare tools, reconfirm the target Worker `sach-sports-cloudflare-test`, namespace `fc70a55e49c84d28bacc562a8d5cfb62`, named object `capture:nba`, and jurisdiction `none`. Reconfirm the verified backup and existing protected-record inventory without changing either. Inspect the current version, paused builds and unchanged CW08 deployment. No secrets are exported or copied.

Require the established compatible fallback **version** `a48c431a-5c3e-4491-8529-38cb20dfa898` at 100% and a release freeze for the entire import/rollback window. This version predates durable-evidence consumption. Confirm that no consumer can use new evidence during the operation. If consumer inactivity cannot be established, stop: do not claim that deleting pointers is safe. All scheduled/production configuration remains unchanged.

Collect a current read-only evidence snapshot using exported `readImportSnapshot(sources, query)`, where `query` forwards `bootstrapRequest(accountId, query)` through the authenticated integration and decodes its response with `decodeQueryResponse`. It first reads `schemaQuery`, rejects unknown definitions, then reads only wanted source rows in ten-source pages and the total encoded body occupancy. It does not inspect or change ledgers. The resulting JSON has `{schema, versions, checks, totalBytes}`; do not invent an empty snapshot or substitute an old snapshot. Keep the response/inspection evidence.

From `frontend`, prepare a new local session (new output path):

```sh
node scripts/nba-bootstrap-import-cli.mjs --prepare \
  ../docs/audits/2026-11-17-nba-bootstrap-plan/finals-only-plan.json.gz \
  /workspace/work/import-preflight/snapshot.json \
  /workspace/work/import-preflight/session.json.gz
```

Freeze the code commit, code checksums, frozen source gzip SHA, resulting session gzip SHA, session digest/run, before-snapshot hash, new-pointer count and duplicate count. Inspect schema SQL and every generated mutation. Then request **separate explicit production authorization** for:

- Those exact FINAL records/session, insert-only immutable versions, absent-pointer publication and an append-only operational journal/nine journal triggers in the existing object.
- Readback/protected-record comparison and, while consumer inactivity is guaranteed, narrowly scoped rollback of only this session's introduced pointers.
- Up to three explicitly initiated same-session recovery attempts, stopping on any unexpected state, permission/security rejection or schema conflict.

This approval must exclude R1/Worker deployment, model/credential/freshness changes, new infrastructure, existing record/pointer updates, and CW08 access. The preparation approval from this task is not sufficient. If Cloudflare approval review rejects a production request, stop and report it; do not change clients/permissions or work around the review.

## 2. Authorization and safety files (non-secret)

After approval, create an authorization JSON with exactly the approved values:

```json
{
  "operation": "import",
  "sessionDigest": "APPROVED_SESSION_DIGEST",
  "planDigest": "3c2d82c7e3310ccd01528da5f4ca92646a22cba5cd40f68492d89e6fbfdd8813",
  "approvalReference": "EXPLICIT_USER_APPROVAL_MESSAGE_REFERENCE",
  "expiresAt": "UTC_TIME_WITHIN_NEXT_30_MINUTES",
  "consumerInactive": true,
  "fallbackVersion": "a48c431a-5c3e-4491-8529-38cb20dfa898",
  "protectedRecordBaselineSha256": "VERIFIED_ORDERED_PROTECTED_RECORD_INVENTORY_HASH"
}
```

The approval reference and safety booleans are operator attestations, **not substitutes for actual authorization or observations**. Never fabricate them to satisfy the checks. Every attempt needs current observed safety:

```json
{
  "accountId": "EXISTING_AUTHENTICATED_ACCOUNT_ID",
  "checkedAt": "ACTUAL_UTC_METADATA_CHECK_TIME",
  "fallbackVersion": "a48c431a-5c3e-4491-8529-38cb20dfa898",
  "researchDeployment": "39ea465b-ca3f-47f8-9bd2-50eb2f1ad174",
  "buildsPaused": true,
  "protectedRecordSha256": "SAME_VERIFIED_PROTECTED_INVENTORY_HASH",
  "consumerInactiveConfirmed": true,
  "releaseFreezeConfirmed": true
}
```

The file bridge requires safety proof no older than two minutes. Refresh it only after actual read-only metadata/inventory verification, never by simply replacing a timestamp. The pinned version/deployment gates intentionally stop if an independently authorized release changes the baseline. Re-review rather than silently changing constants. Session/source timestamps do not change when the safety proof is refreshed.

## 3. One request, acknowledgement, then next

```sh
node scripts/nba-bootstrap-import-cli.mjs --next \
  /workspace/work/import-preflight/session.json.gz \
  /workspace/work/import-preflight/authorization.json \
  /workspace/work/import-preflight/safety.json \
  /workspace/work/import-preflight/transcript.json \
  > /workspace/work/import-preflight/next-request.json
```

The output contains one structured `request`, its hash and `networkCalls:0`. Review it against the frozen session. Forward **that request exactly once** through existing `cloudflare_execute` using `cloudflare.request(request)`. The path is pinned to the dashboard namespace and the body contains one query; no token is requested, read, placed in a file or transferred to a shell/alternate client. Do not print source bodies or full packet contents to the user. An authorized agent may pass structured data internally through the tools; retain local packet/response files for audit. Large packet data must be transported intact, never from truncated terminal output.

Save the actual unmodified Cloudflare JSON envelope locally. Acknowledge it:

```sh
node scripts/nba-bootstrap-import-cli.mjs --ack \
  /workspace/work/import-preflight/transcript.json \
  /workspace/work/import-preflight/actual-response.json
```

Then run `--next` again. It replays only stored responses locally and emits the next unsent request. It refuses a second `--next` while an unacknowledged request is pending. Schema setup, manifest journaling, each guarded staging batch/readback, atomic publish and full readback occur in order. No parallel forwarding. The first successful 101-source rehearsal used 61 SQL requests, within the 90/attempt ceiling. Existing duplicate bodies/pointers are skipped without restamping. The transcript is the resumable checkpoint; archive its checksum and the final receipt.

The callback API `executePreparedBootstrap` may alternatively be orchestrated by a reviewed authorized operator with the same existing authenticated request function and actual `assertSafety` observations. It serializes calls and bounds response waits to 15 seconds. There is no built-in production client, token handling or dashboard endpoint.

## 4. Failure and recovery

On a provider/integration/permission error, invalid response, checksum conflict, timeout, lost acknowledgement or failed safety check: **stop immediately**. Do not infer that a timed-out SQL request was cancelled; it may have committed atomically. Preserve request/transcript/error evidence.

For an explicitly authorized recovery of the same frozen session, refresh real safety observations and run `--resume` with the same five arguments as `--next`. It archives the prior attempt, resets only the local response replay, and starts with schema/journal reads. It never automatically resends the uncertain mutation. Staged versions are reused only byte-identically; an already committed publication/rollback is recognized by its immutable event. A third attempt is the limit; further action needs review. Do not prepare a different session to evade a conflict.

A conflict means stop for review, not overwrite or delete the conflicting row. If a publication readback fails, keep the compatible fallback and release freeze; resolve ownership from the journal. Do not activate R1 to see whether data "looks okay."

## 5. Scoped rollback and consumer activation

Rollback requires the same exact session and explicit rollback authorization. Use a **new transcript** with authorization `operation:"rollback"` and fresh actual safety proof; run the same `--next`/forward/`--ack` loop. The atomic rollback event removes only checks in `manifest.newChecks`, with all hashes/times still matching. A pre-existing pointer, corrected version, later collection or consume lock prevents rollback. All immutable bodies, journal events and production ledgers remain. Failed rollback must not be followed by ad hoc deletes or backup restores.

Before any future consumer deployment, record the permanent `consume` event using reviewed `eventQuery(session,"consume")` while the release freeze still holds; read it back. This is a conservative irreversible prohibition on database rollback. It does not activate a model or satisfy release acceptance. If there is any uncertainty that a consumer already used these inputs, retain all evidence and use compatible Worker/logical fallback even when no consume event exists. The journal cannot detect an unrecorded external model read; operator release control is mandatory.

## 6. Final verification and evidence

Verify the receipt checksum, source body/hash/original-time readbacks, pre-existing evidence snapshot, owned/duplicate counts and protected production-record fingerprints. Reconfirm dashboard/CW08 deployments and paused automatic builds. Preserve session, schema hash, before-snapshot, approval, request/response transcript and receipts in the existing audit location. Update Issue #129 and the tracker with **actual** results.

Import success would mean only that the historical seed is present safely. It would not authorize R1 deployment or establish fresh NBA player discovery/current odds. Leave R1/CW11/V62 open until their remaining current-input and actual production acceptance requirements pass.

## Authoritative transport/atomicity references

- [Data Studio](https://developers.cloudflare.com/durable-objects/observability/data-studio/): statements are separate object requests and are audit logged.
- [SQLite storage API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/): synchronous SQL, supported JSON functions, and transaction API boundaries.
- [SQL limits](https://developers.cloudflare.com/durable-objects/platform/limits/): 100 bound parameters and 100 KiB statement limit.
- Existing authenticated integration OpenAPI: named-object `query/v2` request has `durable_object_name`, `jurisdiction`, `queries:[{sql,params}]`; each response has `result.results` and may also have a stopping `result.error` even when the envelope says success. The decoder checks both.
