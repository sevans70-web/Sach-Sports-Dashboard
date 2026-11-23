# R1 final candidate — GO for controlled deployment approval

**Prepared only. No R1 upload or production initialization occurred. Separate authorization is required. R1/CW11/V62 remain open until actual live acceptance passes.**

## Frozen candidate and target

- Artifact: **`R1-2026-11-23-78ed0d5-cf008e306082`**.
- Worker: **`sach-sports-cloudflare-test`**, existing account and hosting only.
- Full bundle/config/assets SHA256: **`cf008e306082cb3d487760408fed859eeb2076d4969946e34fc57bdee629447a`**;427 fingerprinted files, plus build/Worker configuration checked by the file inventory.
- `candidate.tar.gz`:10,370,428bytes; SHA256 **`66bc09b81d087ebb5b6faf19ce6b54c6124b3cb1ddb7690e32fb5898ed463531`**.
- Application source:`78ed0d5f43e6fa143124d3086792c218a6b6bc04`, containing verified code`58829c2` and NFL schedule fix`d605e1a`. This task adds packaging/tests/evidence only; application code is unchanged.
- `files.json` covers every archived file, with byte count and SHA256; its SHA256 is`ca3f4f99a30de602e7622142407680c6148ab64d1de90ecafca4312908fc7d1d`.
- Compatible emergency rollback **version`a48c431a-5c3e-4491-8529-38cb20dfa898`** remains available and its exact archived code passes candidate→fallback→candidate recovery. Existing diagnostic version`9b38d251-9f0a-4d95-b07c-fc7feb6eab93`/deployment`907bf0e9-e512-48d6-8629-ab9b33a68710` is also available and remains active.

## Exact included fixes

NBA: Cloudflare-compatible manual redirect handling, summary/count failure semantics, PR memory/cache/cancellation safeguards, signed/zero EV and explicit missing-evidence reasons; stored-evidence-first and complete durable source recovery; exact official-player aliases and Clippers fixture/roster matching; actual-operation256 history budget (instead of false128-source exhaustion).

NFL: selected-day schedule discovery isolated from unrelated weekly failures,17-tab/quarterback visibility independent of unavailable EV, honest unsupported/history/probability holds; bounded cold enrichment, persistent denial/cooldown checkpoints and lost-acknowledgement recovery. No new NFL model.

NHL: loading, quote/identity/ranking recovery and started-game preservation; source failures and model-validation holds remain explicit. No NHL model/calibration or CW08 change.

Shared: independent sport capture/grading Durable Object lanes,220-operation phases, four active source requests, reservations,25second phase deadline,10second request timeout, cancellation/drained-body checkpointing, idempotent first-receipt preservation and bounded blocked states. Existing38-market rotation is unchanged. CFB/CBB pause and deferred sports visibility are unchanged.

## Release checks passed

See`docs/audits/2026-11-23-r1-final/README.md`for exact scope, logs and reused evidence.

- Production build; no-upload dry-run:7,580.04KiB compressed executable upload,78static assets. No dependencies/configuration/plan upgrades.
- Nine targeted tests run against this exact shipping build: cold/concurrent summary; redirect403/timeout recovery; actual cold NFL capture/lost ACK; actual NHL routes; all-three-sport official grading/restart; compatible fallback roundtrip. Two new frozen-package/tamper/no-upload tests pass. Total**11tests/0failures**, no full suite rerun.
- Additional exact shipping NBA full-route rehearsal: all7marketsHTTP200/25legitimate rows/25valid EV each; cold concurrent Points/Rebounds6.96/7.90seconds, remaining markets0.80–1.00seconds locally;152stored history operations each, zero history-provider calls or foreground evidence writes. Captured November23 inputs at their original2:22PMToronto clock; other schedule dates are explicitly empty test contracts. This is not live production acceptance.
- Exact shipping startup from101originalFINALs/zero calendars reaches25eligible capture rows and the original-reservation checkpoint in3phases using216/218/156<=220requests, max4active/max12reserved; source pointers101→144→211. Original101pointers unchanged. No protected write; local workerd only, captured supported responses and intentionally simulated prior athlete403. No real provider retry or data import.
- TypeScript0diagnostics. Existing892pass/0fail/17optional skips, Nov22live350-card/EV audit, Nov23full-population/native-model audit and earlier17NFL/6NHLbrowser evidence reused where code is unchanged. They are not relabeled as current/live candidate passes.

## Production safety and initialization

Fresh read-only control-plane checks: compatibility`2026-11-06`/`nodejs_compat`,350subrequests, observability, existing secret names, SQLite namespace`fc70a55e49c84d28bacc562a8d5cfb62`, KV`644df6a469e84dba90c8f7dac410f895`, bindings/assets/schedules compatible. No new namespace, migration or tables are required for this release. Source evidence tables already exist from the separately completed import; that import is not repeated.

Dashboard schedules remain capture`*/2 * * * *`,grade`0,30 * * * *`,archive`10-17 9 * * *`. Current fallback intentionally holds capture/grading. R1 activation resumes the existing native alarms and cron dispatch; it does not replace their schedule. Two legacy active and two blocked NBA jobs are retained; their stale-date/unavailable states must advance or block boundedly before/current alongside new jobs, never be reset or erased. NFL/NHL have no active pending capture jobs at preflight; all three lane leases are null. Refresh current official operational source inputs through the native bounded background path, with real receipt times; never upload/restamp the captured rehearsal calendars. Capture first-receipt/pick/grade writes are the ordinary existing job workflow and must retain conflict/first-pick safeguards. No historical protected row overwrite, bulk import or backup restore is authorized by release preparation.

**All20,468protected records match the completed backup's full-row inventory hashes:** history11,615; originals6,111; picks1,473; grades1,269. Read-only aggregate only; no private-row export. The complete existing Drive manifestSHA`cfea0a1386720861866117a3720f1789f1179be3a5151d9fbd41ccf520a67175`was read back and verified; prior part checksums/isolated20,468restore reused, not repeated. No remaining two-record gap. Recheck inventories before upload and compare existing identities after acceptance; valid new capture/grade rows are additions, not losses.

Production NBA evidence is still101versions/101pointers,764,248encoded bytes,zero calendars; read-only SELECTs report0rows_written. Its64MiB operational-evidence cap is unchanged. Initialization does not modify these original bodies or their receipt times; new complete validated observations are appended, successful-check pointers may advance only under existing validated monotonic rules. Failed/truncated sources cannot replace valid evidence. The new route/old evidence store may report explicit unavailability until its fresh calendars and required FINALs have actually checkpointed; a simulated warm store is not proof production is initialized. Preserve valid cached rankings while refreshing. Do not waive the acceptance requirement because provider access worked earlier.

Automatic builds must keep branch include only`__cw08_manual_release_only__`. CW08 remains deployment`39ea465b-ca3f-47f8-9bd2-50eb2f1ad174`/version`46e95f99-98f2-4abe-a2b2-0ff24b4f8e4b`,cron`*/15 * * * *`; no upload/configuration/research-table access.

## Authorized release execution — only after a new explicit approval

1. Reconfirm exact archive/inventory/fingerprint, package commit ancestry, active version, backup/inventories, bindings/namespace/schedules/paused builds and rollback availability. Stop on a critical mismatch. Make only narrowly bounded current feed/official health reads as necessary; do not repeat population/card/import/backup investigations. Original captured prices are not release-time odds.
2. Pin the existing authenticated Cloudflare manual environment to the Git commit containing this exact package. Install pinned dependencies; from`frontend`,run`node scripts/prepare-r1-final-release.mjs --prepare-only`. Verify manifest/artifact checksums again immediately before upload. **Do not rebuild or overlay modules.** No public/private-preview troubleshooting, credential transfer/rotation or new service.
3. Perform one controlled prebuilt upload through the established existing account to this Worker only: `node scripts/deploy-cloudflare.mjs --tag r1-final --message 'Approved R1 final; source78ed0d5; cf008e306082'`. Preserve existing bindings/schedules/credential values. If manual trigger commands are temporarily set, restore them immediately; never change branch filters.
4. Observe native startup/capture checkpoints and then actual acceptance below. A required fresh source refusal, recurrent zero rankings despite valid inputs, stalled progress, runtime/resource failure or critical browser error triggers immediate fallback. Do not repeatedly retry blocked providers or mask absent inputs. A job with no legitimate evidence must report a bounded blocked state; it cannot be counted as successful capture.

## Mandatory live acceptance and completion

- **Actual production desktop/mobile browsers**: NBA7markets, legitimate current rankings and exact-quote signed/zero EV or accurate unavailability; featured picks/history; NFL17tabs/quarterbacks and available forecasts; NHL6markets including Shots/Points/Assists/Saves, honest model/coverage holds. Verify lower displayed rows, IDs/market/line/opponent/game and refresh/started-game preservation. No stale data promoted as fresh. Recorded replays/APIs cannot substitute for this gate.
- Loading: cold usable page<=15seconds, representative warm APIp95<=5seconds; inspect hydration/console/network errors. Monitor actual memory/CPU/outcomes/subrequests in Cloudflare. Existing memory128MiB/defaultCPU30seconds are not increased; local elapsed times/absence of errors are not a production peak-memory measurement. Keep350Worker/220job guards and4source concurrency.
- **Complete38-market capture rotation (~38minutes) plus all-three-sport grading rotation (up to90minutes)**, independent checkpoints/restarts, bounded provider cooldowns/denials, no starvation/limit failure, duplicate or original overwrite. Confirm fresh calendar/FINAL source accumulation and uncached NBA recovery. Leave unavailable official-finals/legitimate data acceptance explicitly pending; never fabricate games/results or declare completion early.
- Match every protected pre-upload record hash/identity and account separately for valid later additions. Check actual schedules/held-job recovery and CW08 metadata/status without changing research configuration or data. Builds stay paused.

On critical failure, **immediately activate verified compatible fallback version`a48c431a-5c3e-4491-8529-38cb20dfa898`at100%** through the authenticated Cloudflare deployment API. It holds new capture/grading alarms and preserves the existing namespace, additive NBA evidence tables, original records and pending job documents. Do not restore an old database, delete tables, rewind successful checks or rebuild fallback code. Verify fallback browser/API/history and record the rollback deployment ID. Existing diagnostic version`9b38d251-9f0a-4d95-b07c-fc7feb6eab93`is a separately available prior held version; do not confuse deployment IDs with version IDs.

**GO for one separately approved controlled release; NOT completed and NOT already production-accepted.** No unresolved preapproval application blocker was found. Current provider availability, actual live peak resources, startup/rotation completion and desktop/mobile behavior are release-time acceptance gates. Optional SportsGameOdds401 recovery, new Q1/first-TD models, expanded calibration and extra diagnostics remain outside R1.
