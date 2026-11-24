# R1 stability release — prepared, not authorized or deployed

**Artifact:** `R1-STABILITY-2026-11-24-e35c9d7-84829ff137af`.
**Target:** existing `sach-sports-cloudflare-test` only.
**Compiled application source:** `e35c9d7f02c9f63354aa74dfbc3dc933dc0f67e9`.
The exact package commit and literal manual commands are recorded in this audit's handoff receipt and Issue129 after committing the package. Pin that package commit, not a moving branch or the older withdrawn artifact.

- Bundle/config/assets SHA256: `84829ff137affe1e09736ed901f853da3805259d184cc7ecb0cc2b6ed976aa99` (431 fingerprinted files).
- Archive SHA256: `6898b846076b44675d6e4bea271c473c2641d1f9944bc78b4061981f21911d00` (13,175,634bytes).
- Complete file-inventory SHA256: `cca0943710acbb00aaf02dba5e1515e73f39eadab0995e9f1f614e10b6b7bfd0`.
- Compatible fallback version: `a48c431a-5c3e-4491-8529-38cb20dfa898`, currently100% on deployment `72ab06fe-229a-4ece-a5d8-96eb1da50f6e` at this task's read-only check.

## Scope and completion boundary

Include existing NBA redirect/PR memory/EV/identity/durable recovery and receipt-bound supporting history (`af5f712`), bounded Prediction Dashboard performance/refresh/partial-archive work (`b8d05e3`), NFL official FINAL calendar/checkpoint recovery plus exact quote/period/EV validation and missing-value explanations (`af5f712`/`31911ba`), and existing NHL loading/recovery safeguards. Preserve original prices, projections, timestamps, receipts, historical picks and grades.

This is a full compatible Worker/assets package, not a partial NBA module overlay. Keep four NFL probability holds and NHL Goals/Assists validation safeguards. No coefficients, freshness rules, selection thresholds, receipt format or prediction formula changes. P01 model improvements remain a later workstream. Legitimate quote/history/role/unsupported-market holds must be visible and never filled with fabricated selections. CW08's separate Worker is outside this release.

No new namespace, binding, secret, migration, schedule, service or subscription. Local checks and recorded fixtures do **not** prove current provider availability, Cloudflare memory/CPU behavior, live rankings or full operational acceptance.

## Preflight after separate exact authorization

1. Read current deployment/settings/schedules and build trigger. Require fallback version retrievable, existing SQLite namespace `fc70a55e49c84d28bacc562a8d5cfb62`, KV `644df6a469e84dba90c8f7dac410f895`, all eight existing secret bindings by name only, compatibility `2026-11-06`/`nodejs_compat`, 350subrequests and unchanged cron configuration. Stop on an unexpected difference; no automatic corrective production changes.
2. Reuse verified20,904record recovery: 11,615history documents,6,368original receipts,1,616picks,1,305grades. Complete recovery manifest Drive ID `1UPEAyr4x9mWoFF0jzso80ilYDG_BvOeY`, SHA256 `1fd9aab55319ce90ce85daa3365a0592def16eb41fbdf4b9224ac08dbf41ccc5`;426-record delta Drive ID `1y1qSgnRwsOjg3I3jF8bbkZfALwgqFBnM`, SHA256 `c47fd9dbccd608394b3de0877a9d8e8b5987c3f5674ab8c4fb44e3bb32f330f1`. These are previously verified baseline counts, not a fresh production census. Before upload obtain bounded read-only current inventories, preserve all baseline identities/checksums, and account for genuine later additions. If new records lack recovery coverage, stop for only the necessary delta backup authorization; never repeat a full export/import or overwrite an old backup.
3. Verify archive, inventory and all812 unchanged build-input hashes against source; restore with `node scripts/prepare-r1-stability-release.mjs --prepare-only`. This script cannot upload. No rebuild or module edits. A dry-run must still show the approved config and no new migration. Local package tests already restore all files and detect tampering.
4. Keep automatic branch includes **only** `__cw08_manual_release_only__`; never enable the working branch. Recheck CW08's unchanged version/schedule read-only. No research-table access required.

## Existing authenticated manual environment — after approval only

The package commit must have source `e35c9d7...` as its immediate parent. Keep the proven depth2 checkout correction **and** the original ancestry guard. Do not fetch depth1 or remove `git merge-base --is-ancestor`.

Temporarily set only the existing manual trigger's commands, if that separate release authorization explicitly permits it. Substitute the literal full package SHA from the handoff, not the later documentation-only receipt commit:

```sh
git fetch --no-tags --depth=2 origin <PINNED_PACKAGE_COMMIT> && git checkout --detach <PINNED_PACKAGE_COMMIT> && cd frontend && npm ci && node scripts/prepare-r1-stability-release.mjs --prepare-only
```

```sh
cd frontend && node scripts/prepare-r1-stability-release.mjs --prepare-only && node scripts/deploy-cloudflare.mjs --tag r1-stability-2026-11-24 --message R1-STABILITY-2026-11-24-e35c9d7-84829ff137af
```

Trigger one manual build pinned to that same package SHA. The artifact is extracted and verified, not rebuilt. Authentication must stay in the existing authorized environment; never copy tokens or bypass platform approval. On completion **or failure**, immediately restore both original commands and read them back:

```sh
cd frontend && npm ci && npm run build:vinext
```

```sh
cd frontend && npm run deploy:vinext
```

Filters remain paused throughout. A build/config/permission/checksum failure stops the attempt; no second upload or ad hoc artifact change is authorized.

## Mandatory actual acceptance —90minutes from activation

- Actual desktop/mobile browser sessions: NBA all seven markets, NFL17active tabs, NHL six supported markets. Check schedules/counts/current identities and quotes, available original projections/confidence/signedEV, upper/lower ranking cards, supporting history matching input receipts, unique qualifying featured players and started-game selections. No invented minimum counts; distinguish a correctly disclosed legitimate hold from an application regression or failed feed. Authentic data unavailable for a required critical comparison means acceptance is incomplete.
- Prediction Dashboard: Today/Yesterday/Week/Month/Season, sport/market/result/daily/OVER-UNDER filters, authentic totals against saved picks/grades, cache timestamps, genuine grade/capture invalidation and automatic refresh. Cold<15seconds; repeated/concurrent<5seconds. Label partial archives; retain genuine stored statistics on refresh failure. Earlier live measurements are supporting evidence only.
- Safely initialize current official operational inputs via existing bounded jobs, with no historical reimport or restamping. Complete all38capture markets and three grading rotations within the90minute window; record each sport/market/job phase, cursor, checkpoint counts, request usage and completion or explicit genuine hold. A done state alone does not prove a forecast or grade exists. No retry starvation or endless nonprogress retries.
- Reconcile archives and last verified173older pending predictions; grade only exact authentic official outcomes/participation supported by evidence. Preserve unavailable cases explicitly. Do not invent missing historical forecasts or infer missing stats as zero.
- Monitor logs/resources/errors with concurrent foreground requests: no unsupported redirect, memory/CPU/subrequest failure, leaked cancelled work or repeated stalls. Worker350subrequests; job220operations/25s/four source requests/10s source timeout; NFL official history max2sources; NBA foreground256sourceoperations; performance220operations/20s/two sources/5s source timeout. Existing view16MiB/source1MiB/stored32MiB/serializedmemo16MiB-and8entries limits remain. Any new critical failure triggers immediate fallback.
- Verify all protected20,904baseline records and genuine new rows, history/receipt/pick/grade inventories, paused filters and unchanged CW08. Complete actual source/browser checks; replay/API-only results cannot substitute.

## Immediate compatible rollback

Use the existing Cloudflare deployment API for **this dashboard only**, POST `/accounts/d3d6d023ab7ab731cc3e191d0ea3c179/workers/scripts/sach-sports-cloudflare-test/deployments` with:

```json
{"strategy":"percentage","versions":[{"version_id":"a48c431a-5c3e-4491-8529-38cb20dfa898","percentage":100}],"annotations":{"workers/message":"R1 stability critical acceptance failure; restore verified compatible fallback; preserve all original and newly captured records"}}
```

Confirm100% fallback by readback, restore manual commands, verify browser loading and inventories, and report the specific failure. Its capture/grading scheduler remains held. Preserve existing SQLite/KV, job checkpoints, cached evidence and all new rows. **No database restore, deletion, pointer rollback or historical overwrite.** The exact candidate→fallback→candidate lost-ACK rehearsal preserves evidence and resumes without duplicate picks.

GO for separate controlled-deployment approval only after package/rehearsal gates pass. No approval from an older artifact carries forward. R1/CW11/V62 and unresolved archive/capture/grading/initialization requirements remain open until actual acceptance. Move only individually verified completed repairs; P01 and CW08 are not declared complete by this release.
