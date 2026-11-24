# Prediction Dashboard review and targeted R1 repair — November23,2026

**No R1 deployment. Additional application changes were required; the user's conditional authorization for the previous artifact was not consumed.** Updated frozen candidate **R1-2026-11-23-eb7bcf7-db22520f39e6** awaits separate approval. [Exact plan/checksums/rollback/acceptance](../../../frontend/releases/r1-2026-11-23-statistics/release-plan.md).

## Actual production findings

Actual Chromium/TLS-on read-only review: Prediction Performance pageHTTP200, no page errors; TodayNBA0is legitimate under the existing stored inventory. Month APIs forNBA/NFL/NHL return**0records in45.714/45.601/45.959seconds**, after walking olderSeptember/October archive files and stopping partially. This is a real live failure observation, not a replay. Shell audit requests received1010; the already authorized normal Chromium environment worked after its existing NSSdatabase permission was applied. No TLS/security/access bypass or private-preview investigation.

Read-only production aggregates prove **1473saved picks /1269grades**, last grade November15in each sport;204picks have no matching grade: NBA56/NFL114/NHL34, all datedNovember9–15. The fallback intentionally holds dashboard jobs. There are no saved fresh forecasts to reconstruct for the missed capture days; do not fabricate any.

The old candidate's all-period reader excluded protected picks/grades fromMonth/Season, paginated only1000rows despiteNBA1079picks/1023grades, and preferred an old backup for long periods. Its grading scan ignored picks older than7days. Duplicate pending copies could hide matching official grades. Home stats read legacy documents only; featured stats did not refresh automatically. Archive order consumed its budget on older files first. These are application/paused-job issues, not evidence requiring paid data or credential changes.

Additional genuine legacy compatibility issue: official_final envelopes used insertion-order hashes; JSONB reordered payload keys, causing valid whole-document-checksummed evidence to fail the inner check. Recovery now accepts independently verified whole source documents without rewriting hashes/timestamps. Unverified inputs remain strict, and existing protected grades are never regraded by a later cached observation.

## Verified repairs and limitations

The linked plan lists exact scope. All priorNBAEV/identity/PR-memory/redirect/cold recovery,NFLschedule/ranking/capture andNHLrepairs are preserved. No model/math/selection changes. Code commits **2ffc415,bfecf30,eb7bcf7**.

**36distinct targeted tests pass, zero final failures**, including real private-restore coverage beyond1000records/all-period recovery, immutable originals/grades, indexed duplicate merge, original-direction/daily/push math, compact projection/probability parity, archive priority/request-bound/resume, official-cache JSONB provenance, stale UI/grade recovery contracts, workerd pagination and compiled three-sport grading/lost ACK. Prior passing whole suite/350-card/provider/import/backup work was not repeated. TypeScript0diagnostics, build/dry-run/frozen-package checks pass. Final package is429fingerprinted files; archive SHA3dba5cdc277e920367bc0585d30fe980a703b69b51bf8f5a6ac517ec0a445c7e.

Exact compiled shipping Month APIs against **existing verified isolated restore** and real legacy source bodies returnNBA6601/NFL1314/NHL1149records. Full per-response counts, hit rates, pushes, direction and record identities reconcile; all1079/149/245protected model selections are restored or match existing original identities, with0invalid protected receipts. Times11.494/2.335/0.952seconds and183/117/69external intercepted requests under350. The Drivereturns an intentional503contract; archival coverage is honestlypartial, not certified complete. No network production writes. Protected-only home reconciliation is**675hits,594misses,1269decisions,204pending,53.2%**; broader research-history percentages differ legitimately and are not asserted as live values.

A quadratic lookup introduced during this repair was caught by the large-data check (~87s), indexed and regression-tested. Earlier frozen-clock replays establish numeric parity, not timing. The final timing harness advances the historical test clock on completed local external responses; it is not a live performance/resource measurement. Initial harness clock/working-directory fixture errors were corrected without weakening application safeguards. OSprocessRSS was not treated as production Worker heap proof.

Six local desktop/mobile exact compiled UI flows (NBA/NFL/NHL) pass filters, direction views, automatic60srefresh and featured refresh, and forced503retention, with no page errors/overflow. These use newly verified recorded API data and **do not replace mandatory actual production browser acceptance**. Original capture/model/card evidence from earlier R1 work is reused for unchanged paths.

Cold archived results may remain partial under request/time/integrity limits; the UI reports that coverage. Full live archive coverage and official grades for204backlog picks remain acceptance items. Missing participants/unsupported stats do not become invented outcomes. Record probabilities/forecasts are not refitted and histories/backup bytes are untouched.

## Safety and next action

Fresh read-only counts still**20468protected records** (11615history/6111originals/1473picks/1269grades). Existing verified backup/fallback retained; no new export/restore/import. Active deployment907bf0e9-e512-48d6-8629-ab9b33a68710/version9b38d251 remains unchanged; a48c431a rollback available. Bindings/schedules unchanged, builds paused, CW0839ea465b/46e95f99unchanged. No credentials, paid services, namespace/schema or research data changes.

**Next: separate approval for this exact updated artifact.** Then current operational initialization, actual7/17/6desktop/mobile, statistics/source reconciliation, loading/resource/error checks,38capture/all3grading rotations and protected-record comparison within90minutes, with immediate compatible fallback on critical failure. This task did not activate jobs or complete that live window. R1/CW09/CW11/V62 remainopen; no completed-row move.

Raw private restore/SQL row exports and local databases are intentionally excluded fromGit. Committed artifacts contain code, aggregate receipts, bounded public-page diagnostics and compressed logs only.
