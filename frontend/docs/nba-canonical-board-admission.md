# NBA canonical board admission

This is a local migration draft. Release requires a disposable PostgreSQL replay matching the production major version, a review of the legacy writers, an approved schedule hold, and separate production authorization.

## Trust and timing

- A database operator independently verifies the complete Toronto slate against the official ESPN scoreboard, archives the response, and records its SHA-256 and the full game ID to UTC tipoff map in `nba_board_admission.verified_slates`. Set a short expiry and refresh or revoke approval if the schedule changes. The Worker credential has read-only access to the active map through an RPC and cannot approve or refresh it. The database trusts the operator's verification of the archived bytes.
- The Worker requires an exact schedule match before attempting a write. The database checks the approved map and board evidence again. It serializes canonical attempts by market and day, locks the approval row against concurrent edits, and checks `clock_timestamp()` after waiting and validating. The receipt's `updated_at` records admission time. PostgreSQL can commit later. The application retains its local cutoff and receipt checks, and stops publishing if storage acknowledgement is ambiguous. The application verifies the canonical payload checksum and quote/provenance details. A database owner or superuser has administrative bypass capability.
- Existing originals stay readable and are protected without backfills. The guard covers direct inserts, key-changing updates, legacy upserts, deletes, and truncation. It leaves unrelated streams, picks, receipts and grades on their current paths. Legacy backup scripts can still read canonical originals. If a canonical upload through the legacy RPC is refused, keep its source file and verify the archived copy independently before any approved cleanup. Any legitimate correction or retention deletion of a protected row needs a separately reviewed procedure.

## Disposable PostgreSQL replay

Use an existing local PostgreSQL cluster over a Unix socket with no production data. In a fresh disposable cluster, have the administrator create empty `anon`, `authenticated` and `service_role` roles, with `BYPASSRLS` only for `service_role`. Use an empty database owned by the local migration operator and connect as that role. Run from `frontend` with an explicit local socket directory.

```sh
createdb -h /path/to/local/socket sach_nba_board_test_local
psql -X -h /path/to/local/socket -v ON_ERROR_STOP=1 \
  -d sach_nba_board_test_local -f tests/nba-canonical-board-admission-postgres.sql
```

The fixture exercises first insert, duplicate preservation, legacy upsert, unauthorized approval access, elapsed and caller-shifted cutoffs, direct UPDATE/DELETE/TRUNCATE, existing legacy reads, and unrelated writes. Run the next checks with two sessions against the same fixture database. Reload a fresh fixture if the ten-minute upcoming window expires.

```sh
python3 tests/nba-canonical-board-concurrency.py --socket /path/to/local/socket \
  --database sach_nba_board_test_local
```

Use another fresh fixture database for the version 335 check, since the concurrency replay intentionally moves tipoff into the past. The baseline history client checks real local PostgreSQL receipts through a local test adapter that supplies the REST response shape.

```sh
node tests/nba-canonical-board-fallback.mjs psql /path/to/local/socket 5432 \
  sach_nba_board_test_fallback /path/to/version-335-checkout
```

1. In session A, begin a transaction, set the local role to `service_role`, and run `select public.fixture_nba_put('upcoming','rebounds','first');`. Await the result without committing. In session B as `service_role`, attempt `select public.fixture_nba_put('upcoming','rebounds','second');`. Confirm it waits. Commit A before tipoff. Confirm B completes without replacement and the stored quote, digest, payload and timestamps still equal A's receipt. Repeat with another unused market and `'legacy'` as B's fourth argument. B should fail with SQLSTATE 23514.
2. For the lock boundary, use an unused market such as `steals`. In session A, begin and acquire the guard's advisory lock with `select pg_advisory_xact_lock(hashtextextended('sach:nba:canonical:slate_board_steals:' || day::text, 0)) from public.fixture_nba_slates where name='upcoming';`. Start B's `fixture_nba_put('upcoming','steals','delayed')` before the recorded tip. Release A after that tip. B must fail with SQLSTATE 23514 and the new market key must remain absent.
3. For delayed or lost acknowledgement, hold a successful insert open beyond the client timeout. Cover both rollback and commit with the response discarded. Verify that rollback leaves the key absent and a committed original remains byte-for-byte while the Worker stops downstream publication until a subsequent verified read. The compiled Worker fixture simulates the lost response. A PostgreSQL replay must establish the transaction behavior separately.
4. With the database guard in place, test the version 335 read path against protected originals and unrelated history, and verify legacy attempts to replace protected bytes fail. Before a production rollout, identify any scheduled version 335 or backup writers that use protected keys and hold or isolate them.

## Scheduled capture and legacy callers

- Version 335 can read existing and newly admitted originals with the same payload and checksum contract. Its Worker shared-history writes are disabled by default. Keep automated capture on hold during fallback because version 335 cannot admit new canonical NBA boards under the draft. Its pregame receipts and grades use separate storage paths.
- The scheduled Worker archive reads from Supabase and writes verified archive parts to Drive. The legacy Railway backup copies to Drive, verifies the copy, then calls the old upsert before local deletion. Protected-key upserts can fail even for an already archived file. This leaves the verified Drive copy and local source intact, reports a retention failure and can increase volume usage if Railway is still active. Keep that canonical prune path held if active. A future retention adjustment can compare the exact existing canonical checksum through a read-only call and allow pruning only after all other archive checks pass. Missing or mismatched originals should retain the source.
- Capture currently runs automatically. A daily manual approval would require an operator available before every NBA slate and again for schedule changes. Use manual independent verification only for a single controlled validation. For routine capture, verify whether an existing operator-controlled runner can use the existing official ESPN scoreboard independently of the capture Worker. It would need to check and archive all scoreboard dates that cover the Toronto slate, reject incomplete or conflicting responses, and set or revoke a short-lived approval through a narrowly scoped database identity unavailable to the Worker. Preserve an auditable source receipt and compare the exact normalized map on the Worker and database paths. An earlier tip or evidence outage should close admission until a fresh independent verification. Leave routine operation blocked until this path is verified. Do not hand the approval credential to the current capture job.

## Controlled rollout and software rollback

### Protected operator rehearsal

The dashboard exposes a named `NbaAcceptanceOperator` service-binding entrypoint. Its `acceptNbaPoints` method requires a dedicated operator secret and returns an enqueue receipt for `{sport: "nba", market: "points", day: "YYYY-MM-DD"}`. Keep the credential in the approved operator's secret store and pass it as the request's `token`. The dashboard public fetch handler has no acceptance route. A real operator caller and credential are separate rollout prerequisites.

The same named Durable Object serializes acceptance against scheduled capture and recent replay. When `SACH_NBA_ACCEPTANCE_GRANT` is configured, both rotation paths are held, including when the grant is malformed or expired. Removing the grant restores normal rotation. Grading and daily archive stay on their existing paths. An acceptance grant pins the Toronto `day`, UTC `lockAt`, UTC `expiresAt` no later than tipoff, and `scheduleSha256` computed using the history writer's canonical JSON checksum of the independently approved game ID to UTC tipoff map. Set the database schedule approval to expire no later than the operator grant. A separate secret `SACH_NBA_ACCEPTANCE_OPERATOR_TOKEN` is required. Queue readiness counts all active capture and replay jobs and checks live leases on all six lanes. The target rechecks its own readiness before inserting one stable per-slate key. The job rechecks its deadline and the ranking writer checks the pinned fixture map before writing or accepting a saved original.

The six queue reads run independently. They become a safe drain check only when every capture/replay producer uses the gate. Interrupted or ambiguous scheduler fan-out leaves a durable marker and blocks one-shot acceptance pending reconciliation. There is no operator reset method. Before a live validation, pause the scheduler externally and let old-version invocations and leases drain. A concurrently executing old Worker or another privileged direct binding can bypass the gate. Configuration, isolated operator binding, rollout sequencing and queue readiness must be verified separately before production. A request already admitted by PostgreSQL can still commit later, and rollback retains all admitted originals.

Get approval after the disposable replay passes. Hold automatic capture for the chosen slate and keep version 335 available as the rollback target. Apply the migration and validate read compatibility before approving a fresh complete slate. Run a single controlled pregame capture around T−45 minutes before the first Toronto-slate tip, verify the original checksum and admission receipt by T−10, and verify a cold post-lock read at T+5. Stop on failed approval, missing or changed receipt, unexpected writes, or degraded reads. Return serving traffic to version 335 if needed and keep the schedule on hold. Leave the guard in place during software rollback to protect admitted originals. Treat any SQL reversal as a separate change.
