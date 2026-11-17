# Durable NBA recovery — implementation verified, not deployed

Resumed the original workspace from `d88776d` on `cloudflare-compatibility-test`, preserving every pending implementation file and the retained source fixture. No implementation was restarted and no private-preview or NBA connection investigation was repeated.

## Completed implementation

- The existing dashboard `capture:nba` SQLite Durable Object retains complete model-relevant official responses in `nba_history_versions` and a monotonic last-successful-check pointer in `nba_history_checks`. Bodies are immutable and keyed by source URL and SHA256; first observation/validation timestamps remain attached to their original versions. Transactions update the body and pointer together. The bounded store rejects capacity overflow without evicting valid evidence. No new namespace, binding, service, provider or model artifact is introduced.
- Only fenced NBA capture work can persist evidence through the request-local hooks. These use local SQL rather than self-RPC or additional provider requests. Foreground requests read through the existing binding and never acquire a write capability. Read RPCs have a two-second caller bound; existing four-source concurrency and job limits remain unchanged.
- Complete official final censuses may be reused during temporary summary-feed failures, retaining their actual source timestamps and hashes. Discovery evidence must still meet the existing fifteen-minute freshness limit, so an unknown new eligible game is never silently assumed absent. Expired discovery with an unavailable feed abstains explicitly. The existing 48-hour result lag, recent-fixture window, minimum player/team/opponent appearances and role checks remain unchanged.
- The refresh path restores the same observations after eviction/restart and exposes source coverage references. It does not rewrite saved projections, selections, lines, probabilities, EV, grades or prediction timestamps. Model equations, fitted artifacts and calibration are unchanged. New legitimate source versions do not overwrite earlier bodies or historical picks.

## Final safeguards completed on resume

1. **Truncated discovery:** compare completed regular-season category references against the prior valid set for the same athlete/season URL. Removing an event is rejected even if its metadata remains in `events`. A rejected update leaves both the immutable body and last-successful-check pointer unchanged and withholds the affected player. This is separate from the existing empty-response and schema checks.
2. **Semantic census validation:** in addition to the existing independent total reconciliation, require unambiguous home/away and numeric fixture/player/team identities; reject a player appearing on both teams, negative/fractional count statistics, missing starter/usage context, invalid minutes/attempts and nonpositive possessions/duration. Fault tests confirm these reject cases the earlier reconciliation-only parser could accept. The 34 legitimate retained source censuses still pass.
3. **Cancellation:** storage-read errors and stale-census fallback cannot swallow caller aborts/deadlines, request-budget deferrals or lease loss. Both NBA refresh phases propagate those failures. Active-request checks bracket durable reads so no new read/source work starts when an in-flight read returns after cancellation. Already dispatched read-only RPCs cannot be revoked server-side; their caller wait is bounded and late results cannot cause writes or another batch. Ordinary feed failures remain eligible for legitimate complete-census recovery.
4. **Reconstructed discovery W/L:** derive each test event's result from the actual player's team and the official header's winner flag, checked independently against the two scores. The contract includes real losses. No always-W placeholder remains. Discovery envelopes are still explicitly reconstructed test contracts, not claimed original ESPN gamelog responses.

## Real data and evidence limits

The retained fixture contains **34 official raw censuses / 5,382 observations** from the previously successful November 15 release verification. It is separate from the normalized grading backup. All historical stat values remain unchanged. Three source fixtures remain excluded: `401909965` has player/team turnover disagreement; `401909967` rebound disagreement; `401909984` rebound/steal/turnover disagreement. No substitute totals were created.

Original HTTP retrieval times for those local archives were not retained. The fixture records `originalRetrievedAt: null` and an explicit archival revalidation time. It is not backdated or represented as new live provider evidence. The future target fixture used for parity is explicitly synthetic; historical quote numbers test unchanged EV arithmetic, not a current sportsbook offer or newly eligible bet.

The real workerd/SQLite test seeds the isolated object through its NBA background context, disposes the entire Worker, restarts it against the same local SQLite storage, and restores **5,382 identical observations with zero provider calls**. Full observation records, first receipt timestamps, source bodies and historical marker documents match. Foreground write capability is absent. Seven-market projections and probability distributions match exactly before/after storage, as does EV arithmetic at the same recorded price inputs:

| Market | Input/projection/probability parity | EV arithmetic parity |
| --- | --- | --- |
| Points | Pass | Pass |
| Rebounds | Pass | Pass |
| Assists | Pass | Pass |
| Three-pointers | Pass | Pass |
| PRA | Pass | Pass |
| PR | Pass | Pass |
| PA | Pass | Pass |

This proves isolated durability and calculation preservation. It is **not** current live NBA coverage, a sportsbook eligibility count, production browser acceptance, a calibration result or a provider-authentication pass.

## Tests and reuse

- The formerly interrupted `nba-durable-regression.log` completed: **28 passed, zero failed, zero skipped**. Its TypeScript log has no diagnostics. It includes all-sport capture/checkpoint/grading independence, source cooldowns, denied NFL recovery, receipt immutability, NBA EV and parser/refresh checks. Those completed results were inspected and preserved rather than rerun indiscriminately.
- After the final safeguards: **4 durable-recovery checks passed**, including the real restart/seven-market comparison, semantic faults, cancellation at each layer and no post-deadline request admission.
- **5 NBA/college refresh regressions passed** after the shared refresh edit; the college path retains its original behavior.
- Final TypeScript: **zero diagnostics**. `git diff --check` passed. There was no whole-dashboard build, production upload or data import. Only the focused isolated runtime test bundle was compiled.

See `test-results.json`, the recovered baseline log and final check logs. Counts above describe distinct runs with overlap; they must not be added and presented as a new full regression suite.

## Production safety and next requirement

Read-only Cloudflare metadata confirms dashboard fallback deployment `4699c3c4-5067-4347-b3b7-9d205fee5085` / version `a48c431a-5c3e-4491-8529-38cb20dfa898` and CW08 deployment `39ea465b-ca3f-47f8-9bd2-50eb2f1ad174` / version `46e95f99-98f2-4abe-a2b2-0ff24b4f8e4b` remain active. Automatic dashboard builds still exclude this branch (`__cw08_manual_release_only__`); manual commands are unchanged. No credentials, binding configuration, schedules, production records, protected backups or research tables were modified. Tests prohibit real provider/production outbound access.

The new SQL tables are lazily added inside the existing dashboard object only when an approved running NBA capture persists valid evidence. Reads do not create them. There is no production import or backfill in this task. Existing ledger schemas and namespace identities are unchanged; the compatible fallback ignores the additive evidence tables and does not delete their contents. This compatibility statement is code/schema analysis, not a new live rollback exercise.

**The interrupted implementation is complete and verified for commit. R1 remains open, not production-complete.** Next prepare the updated frozen R1 artifact and required release checks, including resource bounds and adequate real current-slate discovery/census coverage. Activation, any production backfill and deployment require approval. Actual production browser, capture/grading and rollback acceptance remain required after approval. Do not deploy the old frozen R1 artifact or mark the tracker 100% complete from offline parity alone.
