# NBA FINAL-only import mechanism — prepared, not executed

**GO for separate import review; no authorization to import or deploy is implied.** This implements the maintenance mechanism requested after 4e1bd57. No production SQL request, production import, Worker upload, provider request, credential transfer or model change was performed.

## Implementation

- `frontend/scripts/nba-bootstrap-import.ts`: bounded SQL protocol, canonical source validation, checksummed sessions, schema verification, guarded staging, atomic publication/ownership, readback and scoped rollback.
- `frontend/scripts/nba-bootstrap-import-cli.mjs`: offline file bridge to the **existing authenticated Cloudflare integration**. It exports one request at a time; it has no HTTP client or credentials and cannot deploy. A separate authorized operator must actually submit a request.
- `frontend/tests/nba-bootstrap-import.test.mjs`: actual local workerd SQLite tests and bridge/authorization/deadline checks.

The target is pinned to the existing dashboard namespace `fc70a55e49c84d28bacc562a8d5cfb62`, object name `capture:nba`. It accepts the previously frozen 101-FINAL package (gzip SHA `c6f828e8463b1bb616e2f88b86f0049cbb67156a1b9404469dd3ef8d74dba6c4`). Original payload hashes, archive provenance and HTTP receipt times are retained. The model's evidence envelopes and gzip/base64 codec are unchanged. Actual existing recovery code read all 101 hashes and original receipt/check timestamps back successfully.

If separately approved, schema initialization would create the existing two evidence tables **only if absent**, plus one append-only `nba_bootstrap_events` operational journal and nine triggers attached to that journal. These reside in the existing object; no service, namespace, binding, migration release, subscription or R1 deployment is needed. Unknown existing schema or triggers stop execution rather than being replaced. The review-only [schema.sql](schema.sql) is not an authorization to run it.

## Atomicity and protection

Cloudflare Data Studio sends separate SQL statements as separate object requests. The mechanism does **not** depend on a cross-request transaction or unsupported `BEGIN`/`SAVEPOINT`.

1. Validate the frozen plan, original times and a read-only before-snapshot. Identical active evidence is a duplicate; its body and pointer timestamps remain untouched. Conflicting versions, invalid bodies, orphan conflicts and dangling pointers stop preparation.
2. Stage at most ten absent immutable versions per statement, below 128 KiB encoded batch input. A whole-batch conflict/capacity guard prevents partial insertion when any source conflicts. Every batch is read back exactly. Staging is inert: no newly active check pointer is created.
3. Publish with **one ordinary INSERT into the journal**. Its BEFORE trigger checks every expected version/body and the complete before-pointer set. Its AFTER trigger inserts only absent new pointers. Both the ownership event and every pointer change are part of this single atomic SQLite statement. Any failed constraint/storage trigger aborts them all.
4. Read back exact version bodies, hashes and original times; verify new and pre-existing pointers. The immutable journal identifies owned pointers even when the successful publication response was lost. Repeating the same session leaves source and journal rows identical.
5. Before consumer activation, rollback uses another atomic journal INSERT. All owned pointers must still have the imported hash/time and all expected versions must match. Any later collection change aborts the entire rollback. Only pointers introduced by this run are removed; immutable bodies and all existing pointers/ledgers remain. A consume lock permanently blocks database rollback; later recovery uses a compatible Worker/logical fallback instead.

The tool never issues SQL against production history, original-receipt, saved-pick or grade tables, and has no Supabase/KV/research transport. The operational manifest retains the source/archive/raw-body hashes and original source provenance separately from normalized model evidence. No original times are upgraded to the import time.

## Boundaries and evidence

The existing SDK/API schema was checked: `POST /accounts/{account}/workers/durable_objects/namespaces/{namespace}/query/v2`, named object + jurisdiction + **one parameterized query per request**. No production write-mode API call was made. SQL and API-shaped response handling are verified in local workerd; live integration permission/review remains an import-time gate, not an inferred pass.

Limits: 128 sources maximum; ten sources/128 KiB per staging batch; 100 KiB SQL and 100 parameters/query; 2 MiB manifest; existing 64 MiB evidence-body budget; 90 SQL requests/attempt; serialized requests; 15-second local response deadline. A timeout is ambiguous: the server may have committed. The mechanism stops rather than claiming cancellation or retrying a mutation automatically. Explicit resume starts with schema/journal inspection of the same run. The file bridge refuses to resend a pending request and allows at most three explicitly initiated attempts before manual review.

[Focused test log](tests.log): **3 passed, zero failed**. [Verification receipt](checks.json): TypeScript zero diagnostics and recorded resource/packet bounds. No broad application suite or release build was repeated because this change is isolated maintenance tooling, not dashboard runtime/model code. Previously verified historical seven-market feature/math evidence is reused; no current forecasts or production acceptance are claimed.

Actual local SQLite checks include:

- Existing source/pointer untouched; 100 owned pointers + one duplicate; all 101 sources readable by the current durable recovery reader with original hashes/times.
- Lost staging, publication and rollback acknowledgements; successful same-run recovery, duplicate execution, and full Worker restart.
- Competing pointer immediately before publication: whole publication aborted, no ownership event and no other pointers inserted.
- Injected storage failure during pointer insertion: all pointer writes and publication event rolled back; staged immutable versions retained, later resume succeeds.
- Conflicting staged version: whole batch refused. Later collection blocks rollback without partial deletion. Journal UPDATE/DELETE/REPLACE refused; consume lock enforced.
- Protected local history/receipt/pick/grade/unrelated-sport markers remain identical. These are isolated markers, not a claim of a new production-ledger export.
- Invalid/expired authorization and wrong fallback fail before writes. No credential, network or production access in the tests. A real 15-second unresolved transport stops after one request, with no automatic retry.

## Current recommendation

The mechanism is ready for a **separate, informed authorization decision**, subject to fresh read-only preflight and freezing the resulting import session. Follow the [exact runbook](runbook.md). Production write permission and approval review are untested; stop if denied. No bypass or replacement credential is proposed.

A seed is not R1 acceptance: the earlier inventory has **zero fresh discoveries**. Fresh authorized discovery, newly eligible complete finals, current fixture/roster context and exact current sportsbook prices remain necessary. No freshness/model rule changes; no claim that a seed alone restores current forecasts.

R1/CW11/V62 stay Blocked. Nothing is moved to 100% completed. Existing dashboard fallback, paused automatic-build filter, production backups and CW08 remain unchanged; see [safety.json](safety.json).
