# NBA retained-evidence bootstrap decision — November 17, 2026

**GO for the offline FINAL-only bootstrap design; NO-GO for production import or R1 release today.** No production import, deployment, provider request, credential change or model change was performed. A future import needs separate authorization and a reviewed production sender; the delivered CLI deliberately cannot import or deploy.

This continues 936f6d4/07c69bc. It reuses the retained official response bodies and existing validation/model implementations, without reopening private-preview or provider-access investigations.

## What is actually available

Inventory clock: **2026-11-17 6:46:16 PM Toronto** (23:46:16.981Z). [inventory.json](inventory.json) lists each archive checksum, source URL, original HTTP observation time, source hash and admission/exclusion reason.

| Retained official material | Result under unchanged validation |
| --- | --- |
| Latest captured 115 HTTP 200 bodies | 65 complete FINAL two-team censuses; 50 expired player-season discoveries |
| October 28 original-audit 50 bodies | 36 complete FINAL censuses; 14 rejected |
| Other prospective/scored 25 bodies | 11 not final; 14 too early under the existing 48-hour rule |
| Previously accepted census fixture 34 bodies | Quarantined: original HTTP receipt times unknown |
| Nine ancillary scoreboards | Schedule context only, not complete historical player censuses |
| Older population manifest | 2,469 fixture references/372,468 derived observations, not complete raw source bodies; cannot reconstruct missing fields |

The 224 candidate player/fixture bodies yield **101 unique eligible FINAL sources**, **16,242 per-market observations**, **2,707 player-fixture records**, **473 recorded players** and **all 30 teams**. Games range from October 21 23:00Z through November 15 22:00Z. Rejected censuses total 39: 27 inside the existing 48-hour receipt rule, 11 not final and one inconsistent census (401909095). Three earlier rejected fixture references remain excluded separately. No missing receipt time is inferred from a local validation time.

The eligible censuses contain the existing model's player actuals/workload, starter status, FGA/FTA/turnovers and derived usage; complete team/opponent possessions, duration and six-market allowed totals; fixture, season, team, opponent and home/away identity. Existing semantic reconciliation, nonnegative/integer checks, regular-season/final requirements and source identity rules all run unchanged. No values are synthesized. PRA/PR/PA continue using the existing same-game combination-history function.

## Coverage estimate and its limits

At the **original captured slate clock**, November 17 5:04:46 PM Toronto, these records support the unchanged historical feature requirements for **25/25 captured public rows in each of Points, Rebounds, Assists, Threes, PRA, PR and PA**. This is a bounded captured cohort, not a count of today's eligible forecasts or the full sportsbook population. Both the complete 101-source archive and the 65 sources inside the existing 21-day/48-hour reader window produce those historical coverage results. The 36 older sources do not become newly discoverable merely because they are stored.

Only 22 teams have at least five recorded fixtures; 284 players have five appearances including DNP. Neither figure establishes forecast eligibility: unchanged role, positive workload, opponent and current-input requirements still apply. **Zero fresh player discoveries remain.** The 50 saved discoveries exceed the unchanged 15-minute limit. No discovery is placed in the bootstrap plan.

Still required: fresh, complete authorized player-season discovery for the actual sportsbook-eligible population; any additional complete eligible finals it identifies; current fixture/team/opponent/roster context; and fresh exact sportsbook lines and prices. The latest retained game is November 15 22:00Z. The number of additional missing finals cannot be established without fresh discovery. The bootstrap therefore removes repeated historical census downloads, but does not solve denied fresh discovery or prove cold-start forecasts are possible during a total provider outage.

## Durable compatibility and safeguards verified offline

The existing `capture:nba` SQLite evidence store accepts the canonical validated envelopes without schema, model or binding changes. The plan uses approximately **746 KiB encoded SQLite body storage**, below the existing 64 MiB evidence cap; largest encoded source is 8,076 bytes. The gzip is 475,365 bytes; decoded plan is 3,488,439 bytes. A live importer must also account for existing occupancy and API/transaction limits.

[bootstrap-tests.log](bootstrap-tests.log): **3 focused tests passed, zero failed**, including an actual local workerd SQLite Durable Object. TypeScript: **zero diagnostics** ([checks.json](checks.json)). No broad regression rerun or dashboard build was needed because no production code changed.

- Original source times and all 101 source hashes read back exactly.
- Interrupted third write rolls back atomically inside the local DO transaction.
- With one legitimate pre-existing source, 100 sources insert; the existing source stays identical. Repetition inserts zero and recognizes 101 duplicates without updating timestamps.
- Full Worker restart preserves the identical store snapshot.
- Protected history/receipt/pick/grade and unrelated-sport marker records remain identical in the isolated database. These are explicit local protection tests, not a claim to have exported or inspected production ledgers during this task.
- Rollback deactivates only 100 introduced pointers, preserves the pre-existing pointer and all immutable bodies. Reattachment is idempotent. Forged receipts, conflicting evidence and rollback after later collection are rejected without mutation.
- No outbound network is allowed in the rehearsal. CLI rejects import/deploy/apply flags.

The runtime test proves the **existing store's compatibility**, not authorization or transactional semantics of a future remote SQL sender. See the [controlled process](controlled-bootstrap-plan.md) for that boundary and required staging/readback gates.

## Frozen data plan

- Schema: `nba-final-bootstrap/v1`; 101 FINAL-only source entries.
- [finals-only-plan.json.gz](finals-only-plan.json.gz) SHA-256: `c6f828e8463b1bb616e2f88b86f0049cbb67156a1b9404469dd3ef8d74dba6c4`.
- Decoded plan digest: `3c2d82c7e3310ccd01528da5f4ca92646a22cba5cd40f68492d89e6fbfdd8813`.
- Every entry preserves original archive hash, raw-payload hash, source URL and HTTP observation time. Local `validatedAt` is explicitly a new semantic validation time, never a replacement HTTP receipt.

Reproduce offline from `frontend`: `node scripts/plan-nba-bootstrap.mjs --inventory /absolute/new/output-directory`. A new planning clock changes the package/digest; it does not change original observation times. Existing archive/body checksum mismatches stop processing.

## Production safety and recommendation

[Read-only configuration snapshot](safety-snapshot.json): active dashboard fallback deployment `b1ef6404-fd00-4312-857c-c50013bb64a2`, version `a48c431a-5c3e-4491-8529-38cb20dfa898`; CW08 deployment `39ea465b-ca3f-47f8-9bd2-50eb2f1ad174`, version `46e95f99-98f2-4abe-a2b2-0ff24b4f8e4b`. Automatic builds remain restricted to the existing non-release branch filter. No backup or production records were changed.

**Recommendation:** retain this verified FINAL-only plan as a possible inexpensive seed for existing storage. Do not treat it as an R1 release clearance. Before any separately approved import, implement/review the narrow sender and its guarded staging/readback path. Before claiming current NBA recovery, obtain legitimate fresh discoveries and prove current-slate coverage without extending freshness. No new subscription or provider bypass is recommended. CW11/R1/V62 remain blocked; no tracker item is completed.
